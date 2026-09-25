"""Backend tests for the Stocktakes (Inventering) feature."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def _post(path, token, body=None):
    return requests.post(f"{API}{path}", json=body or {}, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=20)


def _get(path, token):
    return requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=20)


def _put(path, token, body=None):
    return requests.put(f"{API}{path}", json=body or {}, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=20)


def _delete(path, token):
    return requests.delete(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=20)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def token_a():
    r = requests.post(f"{API}/auth/login", json={"email": "warehouse@test.com", "password": "test123"}, timeout=15)
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/register", json={"email": "warehouse@test.com", "password": "test123", "name": "Warehouse"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def token_b():
    email = f"TEST_st_iso_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "Iso"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def warehouse(token_a):
    # Reuse or create an isolated test warehouse
    r = _post("/warehouses", token_a, {"name": f"TEST_ST_WH_{uuid.uuid4().hex[:6]}", "location": "test"})
    assert r.status_code == 200, r.text
    wh = r.json()
    yield wh
    _delete(f"/warehouses/{wh['id']}", token_a)


@pytest.fixture(scope="module")
def products(token_a, warehouse):
    wid = warehouse["id"]
    created = []
    # Create 3 products with per-warehouse stock at this warehouse
    for i in range(3):
        payload = {
            "name": f"TEST_ST_P_{i}_{uuid.uuid4().hex[:5]}",
            "sku": f"TSTSKU-{i}-{uuid.uuid4().hex[:4]}",
            "barcode": f"9999{i}{uuid.uuid4().hex[:6]}",
            "quantity": 10 + i,
            "warehouse_id": wid,
            "price": 5.0,
        }
        r = _post("/products", token_a, payload)
        assert r.status_code == 200, r.text
        created.append(r.json())
    yield created
    for p in created:
        _delete(f"/products/{p['id']}", token_a)


# ---------- tests ----------
class TestStocktakeLifecycle:

    def test_create_stocktake_prefills_items(self, token_a, warehouse, products):
        r = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-15"})
        assert r.status_code == 200, r.text
        st = r.json()
        assert st["status"] == "open"
        assert st["warehouse_id"] == warehouse["id"]
        assert st["date"] == "2026-01-15"
        assert st["number"].startswith("INV"), f"got number={st['number']}"
        # Auto number pattern INV<yymm><seq>
        assert len(st["number"]) >= 9
        # Items include our test products with matching system_qty & counted_qty
        pmap = {i["product_id"]: i for i in st["items"]}
        for p in products:
            assert p["id"] in pmap, f"product {p['id']} not included in stocktake items"
            it = pmap[p["id"]]
            assert it["system_qty"] == p["quantity"], f"system_qty mismatch: {it}"
            assert it["counted_qty"] == it["system_qty"], "counted_qty must be prefilled to system_qty"
            assert it["name"] == p["name"]
            assert it["sku"] == p["sku"]
            assert it["barcode"] == p["barcode"]
        # cleanup
        _delete(f"/stocktakes/{st['id']}", token_a)

    def test_create_stocktake_bad_warehouse(self, token_a):
        r = _post("/stocktakes", token_a, {"warehouse_id": "does-not-exist", "date": "2026-01-15"})
        assert r.status_code == 400, r.text

    def test_list_stocktakes_sorted_desc(self, token_a, warehouse, products):
        ids = []
        for d in ["2026-01-10", "2026-01-20", "2026-01-15"]:
            r = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": d})
            assert r.status_code == 200
            ids.append(r.json()["id"])
        r = _get("/stocktakes", token_a)
        assert r.status_code == 200
        items = r.json()
        # Filter to ones we just created and check ordering (date desc)
        mine = [i for i in items if i["id"] in ids]
        assert len(mine) == 3
        dates = [i["date"] for i in mine]
        assert dates == sorted(dates, reverse=True), f"not sorted desc: {dates}"
        # No _id leakage
        assert all("_id" not in i for i in items)
        for sid in ids:
            _delete(f"/stocktakes/{sid}", token_a)

    def test_get_stocktake_by_id(self, token_a, warehouse):
        c = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-16"})
        sid = c.json()["id"]
        r = _get(f"/stocktakes/{sid}", token_a)
        assert r.status_code == 200
        assert r.json()["id"] == sid
        _delete(f"/stocktakes/{sid}", token_a)

    def test_get_stocktake_404(self, token_a):
        r = _get("/stocktakes/no-such-id", token_a)
        assert r.status_code == 404

    def test_update_counted_only(self, token_a, warehouse, products):
        c = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-17"})
        st = c.json()
        sid = st["id"]
        target = products[0]
        new_count = 99
        r = _put(f"/stocktakes/{sid}", token_a, {"items": [{"product_id": target["id"], "counted_qty": new_count}]})
        assert r.status_code == 200, r.text
        # Verify with GET
        g = _get(f"/stocktakes/{sid}", token_a).json()
        it = next(i for i in g["items"] if i["product_id"] == target["id"])
        assert it["counted_qty"] == new_count
        assert it["system_qty"] == target["quantity"], "system_qty must be preserved"
        assert it["name"] == target["name"]
        # Other items must not be touched
        other = next(i for i in g["items"] if i["product_id"] == products[1]["id"])
        assert other["counted_qty"] == other["system_qty"]
        _delete(f"/stocktakes/{sid}", token_a)

    def test_update_clamps_negative(self, token_a, warehouse, products):
        c = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-17"})
        sid = c.json()["id"]
        target = products[0]
        r = _put(f"/stocktakes/{sid}", token_a, {"items": [{"product_id": target["id"], "counted_qty": -5}]})
        assert r.status_code == 200
        g = _get(f"/stocktakes/{sid}", token_a).json()
        it = next(i for i in g["items"] if i["product_id"] == target["id"])
        assert it["counted_qty"] == 0, "negative counts must clamp to 0"
        _delete(f"/stocktakes/{sid}", token_a)

    def test_complete_updates_product_stock_and_movements(self, token_a, warehouse, products):
        wid = warehouse["id"]
        c = _post("/stocktakes", token_a, {"warehouse_id": wid, "date": "2026-01-18"})
        st = c.json()
        sid = st["id"]
        # Snapshot original stocks so we can restore afterwards
        orig = {}
        for p in products:
            g = _get(f"/products/{p['id']}", token_a).json()
            orig[p["id"]] = {"quantity": g.get("quantity", 0), "stock": dict(g.get("stock") or {})}

        # Set new counts
        new_counts = {products[0]["id"]: 5, products[1]["id"]: 20, products[2]["id"]: products[2]["quantity"]}
        r = _put(f"/stocktakes/{sid}", token_a, {"items": [{"product_id": pid, "counted_qty": q} for pid, q in new_counts.items()]})
        assert r.status_code == 200
        r = _post(f"/stocktakes/{sid}/complete", token_a)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        # products[2] unchanged => not counted in `adjusted`
        assert data["adjusted"] == 2, f"expected 2 adjusted, got {data}"
        assert data["stocktake"]["status"] == "completed"

        # Verify via GET /api/products/{id}
        for pid, expected in new_counts.items():
            g = _get(f"/products/{pid}", token_a).json()
            assert g["stock"].get(wid) == expected, f"stock[wid] mismatch for {pid}: {g.get('stock')}"

        # Movements recorded
        m = _get("/movements", token_a).json()
        adj = [x for x in m if x.get("type") == "adjust" and (x.get("note") or "").startswith("Stocktake ")]
        assert len(adj) >= 2

        # Second complete must return 400 stocktake_completed
        r2 = _post(f"/stocktakes/{sid}/complete", token_a)
        assert r2.status_code == 400
        assert r2.json().get("detail") == "stocktake_completed"

        # Update after complete must 400
        r3 = _put(f"/stocktakes/{sid}", token_a, {"items": [{"product_id": products[0]["id"], "counted_qty": 1}]})
        assert r3.status_code == 400
        assert r3.json().get("detail") == "stocktake_completed"

        # ---- Restore product stock so we don't permanently mutate ----
        for p in products:
            _put(f"/products/{p['id']}", token_a, {
                "name": p["name"], "sku": p["sku"], "barcode": p["barcode"],
                "quantity": orig[p["id"]]["quantity"],
                "warehouse_id": wid, "price": 5.0,
            })
        _delete(f"/stocktakes/{sid}", token_a)

    def test_delete_stocktake(self, token_a, warehouse):
        c = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-19"})
        sid = c.json()["id"]
        r = _delete(f"/stocktakes/{sid}", token_a)
        assert r.status_code == 200
        assert _get(f"/stocktakes/{sid}", token_a).status_code == 404


class TestStocktakeScoping:

    def test_user_b_cannot_see_user_a_stocktake(self, token_a, token_b, warehouse):
        c = _post("/stocktakes", token_a, {"warehouse_id": warehouse["id"], "date": "2026-01-20"})
        sid = c.json()["id"]
        # user B: GET list must not contain
        lst = _get("/stocktakes", token_b).json()
        assert all(i["id"] != sid for i in lst)
        # user B: GET by id must 404
        r = _get(f"/stocktakes/{sid}", token_b)
        assert r.status_code == 404
        # user B: PUT must 404
        r2 = _put(f"/stocktakes/{sid}", token_b, {"items": []})
        assert r2.status_code == 404
        # user B: complete must 404
        r3 = _post(f"/stocktakes/{sid}/complete", token_b)
        assert r3.status_code == 404
        _delete(f"/stocktakes/{sid}", token_a)

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{API}/stocktakes", timeout=15)
        assert r.status_code in (401, 403)
