# Backend tests for the new "Tools" hub features:
#  - Product BOM / is_production_unit persistence
#  - Production Orders CRUD + complete flow with stock mutation + negative warnings
#  - /api/transfers still works for Stock Movement
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# --------- session-scoped helpers ---------
def _login():
    r = requests.post(f"{API}/auth/login", json={"email": "warehouse@test.com", "password": "test123"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth():
    tok = _login()
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sandbox(auth):
    """Create dedicated warehouse + finished product (with BOM) + 2 part products.
    Everything is prefixed TEST_ and cleaned up at end of module.
    """
    tag = uuid.uuid4().hex[:6]
    # warehouse
    w = requests.post(f"{API}/warehouses", headers=auth,
                      json={"name": f"TEST_wh_prod_{tag}"}, timeout=15)
    assert w.status_code == 200, w.text
    warehouse = w.json()
    wid = warehouse["id"]

    # two part products with initial stock
    part_a = requests.post(f"{API}/products", headers=auth,
                           json={"name": f"TEST_partA_{tag}", "quantity": 20, "warehouse_id": wid}, timeout=15).json()
    part_b = requests.post(f"{API}/products", headers=auth,
                           json={"name": f"TEST_partB_{tag}", "quantity": 5, "warehouse_id": wid}, timeout=15).json()

    # finished product marked as production unit with BOM
    finished = requests.post(
        f"{API}/products",
        headers=auth,
        json={
            "name": f"TEST_finished_{tag}",
            "quantity": 0,
            "warehouse_id": wid,
            "is_production_unit": True,
            "bom": [
                {"product_id": part_a["id"], "qty": 2},
                {"product_id": part_b["id"], "qty": 3},
            ],
        },
        timeout=15,
    ).json()

    data = {"wid": wid, "warehouse": warehouse, "part_a": part_a, "part_b": part_b, "finished": finished, "tag": tag,
            "created_orders": []}
    yield data
    # cleanup
    for oid in data["created_orders"]:
        try: requests.delete(f"{API}/production-orders/{oid}", headers=auth, timeout=10)
        except Exception: pass
    for pid in (finished["id"], part_a["id"], part_b["id"]):
        try: requests.delete(f"{API}/products/{pid}", headers=auth, timeout=10)
        except Exception: pass
    try: requests.delete(f"{API}/warehouses/{wid}", headers=auth, timeout=10)
    except Exception: pass


# --------- Products: is_production_unit + bom persistence ---------
class TestProductProductionFields:
    def test_create_persists_is_production_unit_and_bom(self, sandbox, auth):
        p = sandbox["finished"]
        # GET back
        r = requests.get(f"{API}/products/{p['id']}", headers=auth, timeout=10)
        assert r.status_code == 200
        got = r.json()
        assert got.get("is_production_unit") is True
        bom = got.get("bom") or []
        assert isinstance(bom, list) and len(bom) == 2
        # Confirm shape
        ids = sorted([b["product_id"] for b in bom])
        assert ids == sorted([sandbox["part_a"]["id"], sandbox["part_b"]["id"]])
        for b in bom:
            assert "qty" in b and int(b["qty"]) > 0

    def test_put_updates_is_production_unit_and_bom(self, sandbox, auth):
        p = sandbox["finished"]
        # flip toggle off temporarily and change bom
        upd = {
            "name": p["name"], "quantity": 0, "warehouse_id": sandbox["wid"],
            "is_production_unit": False, "bom": []
        }
        r = requests.put(f"{API}/products/{p['id']}", headers=auth, json=upd, timeout=10)
        assert r.status_code == 200
        got = requests.get(f"{API}/products/{p['id']}", headers=auth, timeout=10).json()
        assert got.get("is_production_unit") is False
        assert (got.get("bom") or []) == []
        # restore
        restore = {
            "name": p["name"], "quantity": 0, "warehouse_id": sandbox["wid"],
            "is_production_unit": True,
            "bom": [
                {"product_id": sandbox["part_a"]["id"], "qty": 2},
                {"product_id": sandbox["part_b"]["id"], "qty": 3},
            ],
        }
        r2 = requests.put(f"{API}/products/{p['id']}", headers=auth, json=restore, timeout=10)
        assert r2.status_code == 200
        got2 = requests.get(f"{API}/products/{p['id']}", headers=auth, timeout=10).json()
        assert got2.get("is_production_unit") is True
        assert len(got2.get("bom") or []) == 2


# --------- Production Orders CRUD ---------
class TestProductionOrderCrud:
    def test_create_lists_and_gets(self, sandbox, auth):
        # create a draft with items
        body = {
            "warehouse_id": sandbox["wid"],
            "items": [{"product_id": sandbox["finished"]["id"], "quantity": 2, "batch_number": "B-1", "best_before_date": "2027-01-01"}],
        }
        r = requests.post(f"{API}/production-orders", headers=auth, json=body, timeout=15)
        assert r.status_code == 200, r.text
        o = r.json()
        sandbox["created_orders"].append(o["id"])
        assert o["status"] == "draft"
        assert o["number"].startswith("PRD")
        assert len(o["number"]) >= 9  # PRD + YYMM + 4 digit
        assert o["warehouse_id"] == sandbox["wid"]
        assert len(o["items"]) == 1
        assert o["items"][0]["batch_number"] == "B-1"

        # GET single
        r2 = requests.get(f"{API}/production-orders/{o['id']}", headers=auth, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["id"] == o["id"]

        # LIST includes newest first
        r3 = requests.get(f"{API}/production-orders", headers=auth, timeout=10)
        assert r3.status_code == 200
        lst = r3.json()
        assert any(x["id"] == o["id"] for x in lst)
        # verify newest first (this order should be within first few)
        first_ids = [x["id"] for x in lst[:5]]
        assert o["id"] in first_ids

    def test_put_updates_draft(self, sandbox, auth):
        r = requests.post(f"{API}/production-orders", headers=auth,
                          json={"warehouse_id": sandbox["wid"], "items": []}, timeout=10)
        o = r.json()
        sandbox["created_orders"].append(o["id"])

        upd = {"items": [{"product_id": sandbox["finished"]["id"], "quantity": 1, "batch_number": "BX", "best_before_date": ""}]}
        r2 = requests.put(f"{API}/production-orders/{o['id']}", headers=auth, json=upd, timeout=10)
        assert r2.status_code == 200
        got = requests.get(f"{API}/production-orders/{o['id']}", headers=auth, timeout=10).json()
        assert len(got["items"]) == 1
        assert got["items"][0]["batch_number"] == "BX"

    def test_delete(self, sandbox, auth):
        r = requests.post(f"{API}/production-orders", headers=auth,
                          json={"warehouse_id": sandbox["wid"], "items": []}, timeout=10)
        oid = r.json()["id"]
        d = requests.delete(f"{API}/production-orders/{oid}", headers=auth, timeout=10)
        assert d.status_code == 200
        # verify gone
        g = requests.get(f"{API}/production-orders/{oid}", headers=auth, timeout=10)
        assert g.status_code == 404


# --------- Complete flow: stock deltas + warnings + not_draft after ---------
class TestProductionComplete:
    def test_complete_updates_stock_and_locks(self, sandbox, auth):
        wid = sandbox["wid"]
        # snapshot current stocks
        fin_before = requests.get(f"{API}/products/{sandbox['finished']['id']}", headers=auth, timeout=10).json()
        a_before = requests.get(f"{API}/products/{sandbox['part_a']['id']}", headers=auth, timeout=10).json()
        b_before = requests.get(f"{API}/products/{sandbox['part_b']['id']}", headers=auth, timeout=10).json()
        fin_qty0 = int((fin_before.get("stock") or {}).get(wid, 0))
        a_qty0 = int((a_before.get("stock") or {}).get(wid, 0))
        b_qty0 = int((b_before.get("stock") or {}).get(wid, 0))

        # create draft with quantity=2 (needs partA*2=4, partB*3=6)
        r = requests.post(
            f"{API}/production-orders", headers=auth,
            json={"warehouse_id": wid,
                  "items": [{"product_id": sandbox["finished"]["id"], "quantity": 2,
                             "batch_number": "COMP-1", "best_before_date": "2027-06-01"}]},
            timeout=10,
        )
        assert r.status_code == 200
        oid = r.json()["id"]
        sandbox["created_orders"].append(oid)

        c = requests.post(f"{API}/production-orders/{oid}/complete", headers=auth, timeout=15)
        assert c.status_code == 200, c.text
        body = c.json()
        assert body.get("ok") is True
        assert body["production_order"]["status"] == "completed"
        # partA had enough (20 -> 16), partB had 5 -> becomes -1 => warning
        warnings = body.get("warnings") or []
        assert sandbox["part_b"]["name"] in warnings
        assert sandbox["part_a"]["name"] not in warnings

        # Verify actual stock movements via GET
        fin_after = requests.get(f"{API}/products/{sandbox['finished']['id']}", headers=auth, timeout=10).json()
        a_after = requests.get(f"{API}/products/{sandbox['part_a']['id']}", headers=auth, timeout=10).json()
        b_after = requests.get(f"{API}/products/{sandbox['part_b']['id']}", headers=auth, timeout=10).json()
        assert int((fin_after["stock"] or {}).get(wid, 0)) == fin_qty0 + 2
        assert int((a_after["stock"] or {}).get(wid, 0)) == a_qty0 - 4
        assert int((b_after["stock"] or {}).get(wid, 0)) == b_qty0 - 6  # went negative

        # PUT on completed returns 400 not_draft
        upd = requests.put(f"{API}/production-orders/{oid}", headers=auth,
                           json={"items": []}, timeout=10)
        assert upd.status_code == 400
        assert upd.json().get("detail") == "not_draft"

        # Second complete returns 400 already_completed
        c2 = requests.post(f"{API}/production-orders/{oid}/complete", headers=auth, timeout=10)
        assert c2.status_code == 400


# --------- /api/transfers (Stock Movement) ---------
class TestTransfers:
    def test_transfer_moves_stock_and_records_movement(self, auth):
        tag = uuid.uuid4().hex[:6]
        w1 = requests.post(f"{API}/warehouses", headers=auth, json={"name": f"TEST_from_{tag}"}, timeout=10).json()
        w2 = requests.post(f"{API}/warehouses", headers=auth, json={"name": f"TEST_to_{tag}"}, timeout=10).json()
        p = requests.post(f"{API}/products", headers=auth,
                          json={"name": f"TEST_tr_{tag}", "quantity": 10, "warehouse_id": w1["id"]}, timeout=10).json()
        try:
            r = requests.post(f"{API}/transfers", headers=auth,
                              json={"product_id": p["id"], "from_warehouse_id": w1["id"], "to_warehouse_id": w2["id"], "quantity": 3},
                              timeout=10)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["ok"] is True
            assert data["stock"][w1["id"]] == 7
            assert data["stock"][w2["id"]] == 3
            # movement recorded
            movs = requests.get(f"{API}/movements?type=transfer&limit=50", headers=auth, timeout=10).json()
            assert any(m.get("product_id") == p["id"] and m.get("from_warehouse_id") == w1["id"] and m.get("warehouse_id") == w2["id"] for m in movs)
        finally:
            requests.delete(f"{API}/products/{p['id']}", headers=auth, timeout=10)
            requests.delete(f"{API}/warehouses/{w1['id']}", headers=auth, timeout=10)
            requests.delete(f"{API}/warehouses/{w2['id']}", headers=auth, timeout=10)

    def test_transfer_same_warehouse_400(self, auth):
        tag = uuid.uuid4().hex[:6]
        w = requests.post(f"{API}/warehouses", headers=auth, json={"name": f"TEST_same_{tag}"}, timeout=10).json()
        p = requests.post(f"{API}/products", headers=auth,
                          json={"name": f"TEST_same_{tag}", "quantity": 4, "warehouse_id": w["id"]}, timeout=10).json()
        try:
            r = requests.post(f"{API}/transfers", headers=auth,
                              json={"product_id": p["id"], "from_warehouse_id": w["id"], "to_warehouse_id": w["id"], "quantity": 1},
                              timeout=10)
            assert r.status_code == 400
        finally:
            requests.delete(f"{API}/products/{p['id']}", headers=auth, timeout=10)
            requests.delete(f"{API}/warehouses/{w['id']}", headers=auth, timeout=10)
