"""Tests for new Sales-Order additions: ship-from warehouse stock movement
and return-warehouse selection (restock to chosen warehouse)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def token():
    # Use isolated TEST user so we have a clean stock state.
    email = f"TEST_sowh_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "test123", "name": "TEST WH"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def two_warehouses(token):
    """Return (wh_a_id, wh_b_id) — create them if not present."""
    h = _h(token)
    existing = requests.get(f"{BASE_URL}/api/warehouses", headers=h, timeout=15).json()
    ids = [w["id"] for w in existing]
    while len(ids) < 2:
        r = requests.post(f"{BASE_URL}/api/warehouses", headers=h,
                          json={"name": f"TEST_WH_{uuid.uuid4().hex[:4]}"}, timeout=15)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    return ids[0], ids[1]


@pytest.fixture
def product_in_a(token, two_warehouses):
    a, _b = two_warehouses
    h = _h(token)
    body = {"name": f"TEST_SOWH_{uuid.uuid4().hex[:6]}", "quantity": 20, "warehouse_id": a}
    r = requests.post(f"{BASE_URL}/api/products", headers=h, json=body, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _get_stock(token, pid):
    r = requests.get(f"{BASE_URL}/api/products/{pid}", headers=_h(token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("stock") or {}


# ----- Return-warehouse stock math -----
class TestReturnWarehouse:
    def test_ship_then_return_to_different_warehouse(self, token, two_warehouses, product_in_a):
        a, b = two_warehouses
        pid = product_in_a["id"]
        # baseline
        st = _get_stock(token, pid)
        assert int(st.get(a, 0)) == 20
        # create SO ship-from A, qty 5
        h = _h(token)
        so = requests.post(f"{BASE_URL}/api/sales-orders", headers=h,
                           json={"warehouse_id": a, "items": [{"product_id": pid, "name": product_in_a["name"], "quantity": 5}]},
                           timeout=15).json()
        oid = so["id"]
        assert so["warehouse_id"] == a
        # ship -> A drops to 15
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "shipped"}, timeout=15)
        assert r.status_code == 200, r.text
        st1 = _get_stock(token, pid)
        assert int(st1.get(a, 0)) == 15
        assert int(st1.get(b, 0)) == 0  # nothing restocked to B yet
        # return -> B
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h,
                          json={"status": "returned", "warehouse_id": b}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "returned"
        assert body.get("return_warehouse_id") == b
        # final stock: A=15, B=5, total=20
        st2 = _get_stock(token, pid)
        assert int(st2.get(a, 0)) == 15
        assert int(st2.get(b, 0)) == 5
        assert sum(int(v) for v in st2.values()) == 20
        # GET-verify persistence on the order
        g = requests.get(f"{BASE_URL}/api/sales-orders/{oid}", headers=h, timeout=15).json()
        assert g["status"] == "returned"
        assert g.get("return_warehouse_id") == b

    def test_return_without_warehouse_falls_back_to_ship_from(self, token, two_warehouses):
        a, _b = two_warehouses
        h = _h(token)
        # fresh product with 10 in A
        p = requests.post(f"{BASE_URL}/api/products", headers=h,
                          json={"name": f"TEST_SOWH_{uuid.uuid4().hex[:6]}", "quantity": 10, "warehouse_id": a}, timeout=15).json()
        pid = p["id"]
        so = requests.post(f"{BASE_URL}/api/sales-orders", headers=h,
                           json={"warehouse_id": a, "items": [{"product_id": pid, "name": p["name"], "quantity": 3}]}, timeout=15).json()
        oid = so["id"]
        # ship
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "shipped"}, timeout=15)
        assert r.status_code == 200
        assert int(_get_stock(token, pid).get(a, 0)) == 7
        # return WITHOUT warehouse_id -> falls back to ship-from (a)
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "returned"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("return_warehouse_id") == a
        # stock back to 10 in A
        assert int(_get_stock(token, pid).get(a, 0)) == 10


# ----- Status flow forward-only + no double stock movement -----
class TestStatusFlow:
    def test_no_double_stock_movement(self, token, two_warehouses):
        a, _b = two_warehouses
        h = _h(token)
        p = requests.post(f"{BASE_URL}/api/products", headers=h,
                          json={"name": f"TEST_SOWH_{uuid.uuid4().hex[:6]}", "quantity": 8, "warehouse_id": a}, timeout=15).json()
        pid = p["id"]
        so = requests.post(f"{BASE_URL}/api/sales-orders", headers=h,
                           json={"warehouse_id": a, "items": [{"product_id": pid, "name": p["name"], "quantity": 2}]}, timeout=15).json()
        oid = so["id"]
        # saved -> picked (no stock change)
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "picked"}, timeout=15)
        assert r.status_code == 200
        assert int(_get_stock(token, pid).get(a, 0)) == 8
        # picked -> shipped (-2)
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "shipped"}, timeout=15)
        assert r.status_code == 200
        assert int(_get_stock(token, pid).get(a, 0)) == 6
        # shipped -> shipped should be rejected
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "shipped"}, timeout=15)
        assert r.status_code == 400
        assert "invalid_transition" in r.text
        # still 6
        assert int(_get_stock(token, pid).get(a, 0)) == 6

    def test_forward_only_backwards_rejected(self, token, two_warehouses):
        a, _b = two_warehouses
        h = _h(token)
        p = requests.post(f"{BASE_URL}/api/products", headers=h,
                          json={"name": f"TEST_SOWH_{uuid.uuid4().hex[:6]}", "quantity": 5, "warehouse_id": a}, timeout=15).json()
        pid = p["id"]
        so = requests.post(f"{BASE_URL}/api/sales-orders", headers=h,
                           json={"warehouse_id": a, "items": [{"product_id": pid, "name": p["name"], "quantity": 1}]}, timeout=15).json()
        oid = so["id"]
        # ship then try returning then -> back to picked (should fail)
        requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "shipped"}, timeout=15)
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "picked"}, timeout=15)
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "saved"}, timeout=15)
        assert r.status_code == 400
        # returned -> any (should fail after we mark returned)
        requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": "returned"}, timeout=15)
        for st in ("saved", "picked", "shipped", "returned"):
            r = requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status", headers=h, json={"status": st}, timeout=15)
            assert r.status_code == 400
