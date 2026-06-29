"""Tests for sales-order item.picked persistence (scan-to-pick feature)."""
import os
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _seed(api_client, auth_a):
    """Activate PRO, ensure warehouse + product (with barcode) exist; return (wh_id, product_id)."""
    # Activate PRO so feature gates pass
    api_client.post(f"{BASE_URL}/api/billing/activate-test", headers=auth_a)

    # Warehouse
    whs = api_client.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
    if whs:
        wh_id = whs[0]["id"]
    else:
        r = api_client.post(f"{BASE_URL}/api/warehouses",
                            json={"name": f"TEST_WH_{uuid.uuid4().hex[:6]}"}, headers=auth_a)
        assert r.status_code == 200, r.text
        wh_id = r.json()["id"]

    # Product (with barcode)
    pname = f"TEST_PICK_{uuid.uuid4().hex[:6]}"
    pbody = {"name": pname, "barcode": f"BC{uuid.uuid4().hex[:10]}",
             "quantity": 50, "warehouse_id": wh_id}
    r = api_client.post(f"{BASE_URL}/api/products", json=pbody, headers=auth_a)
    assert r.status_code == 200, r.text
    p = r.json()
    return wh_id, p["id"], p.get("name") or pname


def test_default_picked_zero_on_create(api_client, auth_a):
    wh_id, pid, pname = _seed(api_client, auth_a)
    body = {"warehouse_id": wh_id, "items": [{"product_id": pid, "name": pname, "quantity": 5}]}
    r = api_client.post(f"{BASE_URL}/api/sales-orders", json=body, headers=auth_a)
    assert r.status_code == 200, r.text
    so = r.json()
    assert len(so["items"]) == 1
    assert so["items"][0].get("picked", 0) == 0

    # GET also returns picked=0
    g = api_client.get(f"{BASE_URL}/api/sales-orders/{so['id']}", headers=auth_a)
    assert g.status_code == 200
    assert g.json()["items"][0].get("picked", 0) == 0

    # cleanup
    api_client.delete(f"{BASE_URL}/api/sales-orders/{so['id']}", headers=auth_a)


def test_put_persists_picked_value(api_client, auth_a):
    wh_id, pid, pname = _seed(api_client, auth_a)
    create = api_client.post(f"{BASE_URL}/api/sales-orders",
                             json={"warehouse_id": wh_id, "items": [{"product_id": pid, "name": pname, "quantity": 10}]},
                             headers=auth_a)
    assert create.status_code == 200, create.text
    so = create.json()

    # PUT with picked=7
    upd = {"warehouse_id": wh_id, "field1": so.get("field1", ""), "field2": so.get("field2", ""),
           "comment": "", "shipping_ref": "", "order_date": so.get("order_date"),
           "items": [{"product_id": pid, "name": pname, "quantity": 10, "picked": 7}]}
    r = api_client.put(f"{BASE_URL}/api/sales-orders/{so['id']}", json=upd, headers=auth_a)
    assert r.status_code == 200, r.text

    g = api_client.get(f"{BASE_URL}/api/sales-orders/{so['id']}", headers=auth_a)
    assert g.status_code == 200
    items = g.json()["items"]
    assert items[0]["picked"] == 7
    assert items[0]["quantity"] == 10

    api_client.delete(f"{BASE_URL}/api/sales-orders/{so['id']}", headers=auth_a)


def test_picked_survives_status_transition_to_picked_and_shipped(api_client, auth_a):
    wh_id, pid, pname = _seed(api_client, auth_a)
    create = api_client.post(f"{BASE_URL}/api/sales-orders",
                             json={"warehouse_id": wh_id, "items": [{"product_id": pid, "name": pname, "quantity": 4}]},
                             headers=auth_a)
    assert create.status_code == 200, create.text
    so = create.json()
    oid = so["id"]

    # set picked=3 via PUT (while still saved)
    upd = {"warehouse_id": wh_id, "field1": "", "field2": "", "comment": "", "shipping_ref": "",
           "order_date": so.get("order_date"),
           "items": [{"product_id": pid, "name": pname, "quantity": 4, "picked": 3}]}
    r = api_client.put(f"{BASE_URL}/api/sales-orders/{oid}", json=upd, headers=auth_a)
    assert r.status_code == 200, r.text

    # transition saved -> picked
    s1 = api_client.post(f"{BASE_URL}/api/sales-orders/{oid}/status",
                        json={"status": "picked"}, headers=auth_a)
    assert s1.status_code == 200, s1.text

    g1 = api_client.get(f"{BASE_URL}/api/sales-orders/{oid}", headers=auth_a).json()
    assert g1["status"] == "picked"
    assert g1["items"][0]["picked"] == 3, "picked must survive status->picked"

    # transition picked -> shipped
    s2 = api_client.post(f"{BASE_URL}/api/sales-orders/{oid}/status",
                        json={"status": "shipped"}, headers=auth_a)
    assert s2.status_code == 200, s2.text

    g2 = api_client.get(f"{BASE_URL}/api/sales-orders/{oid}", headers=auth_a).json()
    assert g2["status"] == "shipped"
    assert g2["items"][0]["picked"] == 3, "picked must survive status->shipped"
    assert g2["items"][0]["quantity"] == 4

    # locked after shipped — PUT must 400
    r2 = api_client.put(f"{BASE_URL}/api/sales-orders/{oid}", json=upd, headers=auth_a)
    assert r2.status_code == 400

    # cleanup (delete is allowed even when shipped)
    api_client.delete(f"{BASE_URL}/api/sales-orders/{oid}", headers=auth_a)
