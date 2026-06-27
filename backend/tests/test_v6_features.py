"""v6 feature tests:
- Movements filter (type, warehouse_id)
- Auto purchase orders grouped by supplier
- POST/PUT /purchase-orders with items[{product_id,qty}] (custom qty) + legacy product_ids
- Settings update accepts SEK/DKK/EUR/GBP
- Warehouse and Supplier address fields persist
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# -------- Warehouse address persistence --------
class TestWarehouseAddress:
    def test_create_warehouse_with_full_address(self, token_a, auth_a):
        body = {
            "name": f"TEST_v6_wh_{uuid.uuid4().hex[:6]}",
            "street1": "Storgatan", "street2": "Suite 4", "number": "12B",
            "postcode": "11122", "city": "Stockholm", "state": "Stockholms län",
            "county": "Solna", "contact_person": "Alex Tester", "phone": "+46 8 123 456"
        }
        r = requests.post(f"{BASE_URL}/api/warehouses", json=body, headers=auth_a)
        assert r.status_code == 200, r.text
        w = r.json()
        wid = w["id"]
        for k, v in body.items():
            assert w.get(k) == v, f"create: {k} expected {v!r} got {w.get(k)!r}"
        # GET via list -> verify persisted
        wl = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
        found = next((x for x in wl if x["id"] == wid), None)
        assert found is not None
        for k, v in body.items():
            assert found.get(k) == v
        # PUT update
        body2 = {**body, "city": "Göteborg", "postcode": "41101", "phone": "+46 31 999"}
        r2 = requests.put(f"{BASE_URL}/api/warehouses/{wid}", json=body2, headers=auth_a)
        assert r2.status_code == 200
        u = r2.json()
        assert u["city"] == "Göteborg"
        assert u["postcode"] == "41101"
        assert u["phone"] == "+46 31 999"
        # cleanup
        requests.delete(f"{BASE_URL}/api/warehouses/{wid}", headers=auth_a)


# -------- Supplier address + email --------
class TestSupplierAddress:
    def test_create_supplier_with_full_address_and_email(self, token_a, auth_a):
        body = {
            "name": f"TEST_v6_sup_{uuid.uuid4().hex[:6]}",
            "email": "supplier@example.com", "phone": "+46 70 000",
            "street1": "Industrivägen", "street2": "Bldg 2", "number": "7",
            "postcode": "22233", "city": "Malmö", "state": "Skåne",
            "county": "Lund", "contact_person": "Petra Test"
        }
        r = requests.post(f"{BASE_URL}/api/suppliers", json=body, headers=auth_a)
        assert r.status_code == 200, r.text
        s = r.json(); sid = s["id"]
        for k, v in body.items():
            assert s.get(k) == v, f"{k}: {s.get(k)!r} != {v!r}"
        # PUT and verify via list
        body2 = {**body, "email": "new@example.com", "city": "Lund"}
        r2 = requests.put(f"{BASE_URL}/api/suppliers/{sid}", json=body2, headers=auth_a)
        assert r2.status_code == 200
        assert r2.json()["email"] == "new@example.com"
        sl = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_a).json()
        found = next((x for x in sl if x["id"] == sid), None)
        assert found and found["email"] == "new@example.com" and found["city"] == "Lund"
        requests.delete(f"{BASE_URL}/api/suppliers/{sid}", headers=auth_a)


# -------- Settings currency dropdown values --------
class TestSettingsCurrency:
    @pytest.mark.parametrize("cur", ["SEK", "DKK", "EUR", "GBP"])
    def test_accept_supported(self, cur, auth_a):
        r = requests.put(f"{BASE_URL}/api/settings", json={"currency": cur}, headers=auth_a)
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == cur

    def test_reject_unsupported(self, auth_a):
        r = requests.put(f"{BASE_URL}/api/settings", json={"currency": "USD"}, headers=auth_a)
        assert r.status_code == 400


# -------- Movements filtering --------
class TestMovementsFilter:
    @pytest.fixture
    def seeded(self, auth_a):
        # ensure at least 2 warehouses
        whs = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
        if len(whs) < 2:
            requests.post(f"{BASE_URL}/api/warehouses", json={"name": f"TEST_v6_wh_{uuid.uuid4().hex[:5]}"}, headers=auth_a)
            whs = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
        w1, w2 = whs[0]["id"], whs[1]["id"]
        # create test product
        p = requests.post(f"{BASE_URL}/api/products", json={
            "name": f"TEST_v6_mv_{uuid.uuid4().hex[:6]}", "quantity": 0,
            "warehouse_id": w1, "low_stock_threshold": 5, "cost": 1.0
        }, headers=auth_a).json()
        pid = p["id"]
        # generate one of each type on w1 and a receive on w2
        requests.post(f"{BASE_URL}/api/movements", json={"product_id": pid, "type": "receive", "quantity": 10, "warehouse_id": w1}, headers=auth_a)
        requests.post(f"{BASE_URL}/api/movements", json={"product_id": pid, "type": "adjust", "quantity": 8, "warehouse_id": w1}, headers=auth_a)
        requests.post(f"{BASE_URL}/api/movements", json={"product_id": pid, "type": "remove", "quantity": 2, "warehouse_id": w1}, headers=auth_a)
        requests.post(f"{BASE_URL}/api/movements", json={"product_id": pid, "type": "receive", "quantity": 5, "warehouse_id": w2}, headers=auth_a)
        # transfer w1 -> w2
        requests.post(f"{BASE_URL}/api/transfers", json={"product_id": pid, "from_warehouse_id": w1, "to_warehouse_id": w2, "quantity": 1}, headers=auth_a)
        yield {"pid": pid, "w1": w1, "w2": w2}
        requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_a)

    def test_filter_by_type(self, auth_a, seeded):
        r = requests.get(f"{BASE_URL}/api/movements?type=receive", headers=auth_a)
        assert r.status_code == 200
        items = r.json()
        assert all(m["type"] == "receive" for m in items), "non-receive present"
        assert any(m["product_id"] == seeded["pid"] for m in items)

    def test_filter_by_type_transfer(self, auth_a, seeded):
        items = requests.get(f"{BASE_URL}/api/movements?type=transfer", headers=auth_a).json()
        assert all(m["type"] == "transfer" for m in items)
        # must have at least our seeded transfer
        mine = [m for m in items if m["product_id"] == seeded["pid"]]
        assert len(mine) >= 1
        assert mine[0]["from_warehouse_id"] == seeded["w1"]
        assert mine[0]["warehouse_id"] == seeded["w2"]

    def test_filter_by_warehouse(self, auth_a, seeded):
        items = requests.get(f"{BASE_URL}/api/movements?warehouse_id={seeded['w2']}", headers=auth_a).json()
        # all returned must touch w2 (either as warehouse_id or from_warehouse_id)
        for m in items:
            assert m.get("warehouse_id") == seeded["w2"] or m.get("from_warehouse_id") == seeded["w2"]
        mine = [m for m in items if m["product_id"] == seeded["pid"]]
        # We seeded one receive on w2 and one transfer with to=w2 -> at least 2
        assert len(mine) >= 2

    def test_filter_combined(self, auth_a, seeded):
        items = requests.get(f"{BASE_URL}/api/movements?type=remove&warehouse_id={seeded['w1']}", headers=auth_a).json()
        assert all(m["type"] == "remove" and m["warehouse_id"] == seeded["w1"] for m in items)


# -------- Purchase orders with items + custom qty --------
class TestPOCustomQty:
    @pytest.fixture
    def products(self, auth_a):
        whs = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
        w1 = whs[0]["id"]
        ids = []
        for _ in range(2):
            p = requests.post(f"{BASE_URL}/api/products", json={
                "name": f"TEST_v6_po_{uuid.uuid4().hex[:6]}", "quantity": 0,
                "warehouse_id": w1, "low_stock_threshold": 5, "cost": 3.5
            }, headers=auth_a).json()
            ids.append(p["id"])
        yield ids, w1
        for pid in ids:
            requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_a)

    def test_create_po_with_items_custom_qty(self, auth_a, products):
        ids, w1 = products
        body = {"items": [{"product_id": ids[0], "qty": 7}, {"product_id": ids[1], "qty": 3}], "warehouse_id": w1}
        r = requests.post(f"{BASE_URL}/api/purchase-orders", json=body, headers=auth_a)
        assert r.status_code == 200, r.text
        po = r.json()
        items_by_pid = {i["product_id"]: i for i in po["items"]}
        assert items_by_pid[ids[0]]["qty"] == 7
        assert items_by_pid[ids[1]]["qty"] == 3
        # total = 7*3.5 + 3*3.5 = 35.0
        assert abs(po["total"] - 35.0) < 0.01
        # cleanup
        requests.delete(f"{BASE_URL}/api/purchase-orders/{po['id']}", headers=auth_a)

    def test_create_po_legacy_product_ids(self, auth_a, products):
        ids, w1 = products
        # threshold=5, qty=0 -> suggest_qty = max(5*2-0, 5) = 10
        body = {"product_ids": ids, "warehouse_id": w1}
        r = requests.post(f"{BASE_URL}/api/purchase-orders", json=body, headers=auth_a)
        assert r.status_code == 200, r.text
        po = r.json()
        for it in po["items"]:
            assert it["qty"] == 10
        requests.delete(f"{BASE_URL}/api/purchase-orders/{po['id']}", headers=auth_a)

    def test_put_po_updates_qty_and_total(self, auth_a, products):
        ids, w1 = products
        # create draft
        po = requests.post(f"{BASE_URL}/api/purchase-orders",
                           json={"items": [{"product_id": ids[0], "qty": 5}], "warehouse_id": w1},
                           headers=auth_a).json()
        pid_po = po["id"]
        # edit qty 5 -> 12
        r = requests.put(f"{BASE_URL}/api/purchase-orders/{pid_po}",
                         json={"items": [{"product_id": ids[0], "qty": 12}]},
                         headers=auth_a)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert len(updated["items"]) == 1
        assert updated["items"][0]["qty"] == 12
        assert abs(updated["total"] - 12 * 3.5) < 0.01
        # verify via GET list
        pos = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_a).json()
        found = next((x for x in pos if x["id"] == pid_po), None)
        assert found and found["items"][0]["qty"] == 12
        requests.delete(f"{BASE_URL}/api/purchase-orders/{pid_po}", headers=auth_a)

    def test_put_po_404(self, auth_a):
        r = requests.put(f"{BASE_URL}/api/purchase-orders/nope-xxx",
                         json={"items": [{"product_id": "x", "qty": 1}]},
                         headers=auth_a)
        assert r.status_code == 404


# -------- Auto purchase orders grouped by supplier --------
class TestAutoPO:
    @pytest.fixture
    def seed(self, auth_a):
        # cleanup any previous TEST_v6_auto suppliers + their POs to keep results deterministic
        whs = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a).json()
        w1 = whs[0]["id"]
        # create 2 suppliers
        s1 = requests.post(f"{BASE_URL}/api/suppliers",
                           json={"name": f"TEST_v6_auto_S1_{uuid.uuid4().hex[:4]}"}, headers=auth_a).json()
        s2 = requests.post(f"{BASE_URL}/api/suppliers",
                           json={"name": f"TEST_v6_auto_S2_{uuid.uuid4().hex[:4]}"}, headers=auth_a).json()
        # 3 low-stock products: 1 under s1, 1 under s2, 1 with no supplier
        pids = []
        for sid in (s1["id"], s1["id"], s2["id"], None):
            body = {"name": f"TEST_v6_auto_p_{uuid.uuid4().hex[:6]}", "quantity": 0,
                    "warehouse_id": w1, "low_stock_threshold": 5, "cost": 2.0}
            if sid: body["supplier_id"] = sid
            p = requests.post(f"{BASE_URL}/api/products", json=body, headers=auth_a).json()
            pids.append(p["id"])
        # capture pre-existing PO ids so we can isolate the new ones
        pre = {po["id"] for po in requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_a).json()}
        yield {"s1": s1["id"], "s2": s2["id"], "pids": pids, "pre_ids": pre}
        # cleanup
        for pid in pids:
            requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_a)
        requests.delete(f"{BASE_URL}/api/suppliers/{s1['id']}", headers=auth_a)
        requests.delete(f"{BASE_URL}/api/suppliers/{s2['id']}", headers=auth_a)
        post = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_a).json()
        for po in post:
            if po["id"] not in pre:
                requests.delete(f"{BASE_URL}/api/purchase-orders/{po['id']}", headers=auth_a)

    def test_auto_creates_one_po_per_supplier(self, auth_a, seed):
        r = requests.post(f"{BASE_URL}/api/purchase-orders/auto", json={}, headers=auth_a)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["count"] >= 3  # s1, s2, none-group, plus any pre-existing low-stock owner groups
        created = body["created"]
        # find our 3 groups
        by_sup = {}
        for po in created:
            by_sup.setdefault(po.get("supplier_id"), []).append(po)
        # s1 group must exist and contain 2 items (we created 2 products under s1)
        s1_pos = by_sup.get(seed["s1"], [])
        assert len(s1_pos) == 1, f"expected 1 PO for s1, got {len(s1_pos)}"
        assert len(s1_pos[0]["items"]) == 2
        # s2 group
        s2_pos = by_sup.get(seed["s2"], [])
        assert len(s2_pos) == 1
        assert len(s2_pos[0]["items"]) == 1
        # none-group: supplier_id is None
        none_pos = by_sup.get(None, [])
        assert len(none_pos) >= 1
        # qty = suggest = max(threshold*2-qty, threshold). For our seeded products threshold=5, qty=0 -> 10
        our_pids = set(seed["pids"])
        for po in s1_pos + s2_pos + none_pos:
            for it in po["items"]:
                if it["product_id"] in our_pids:
                    assert it["qty"] == 10, f"seeded item qty should be 10, got {it['qty']}"
            # total >= sum(seeded items contribution)
            assert po["total"] > 0

    def test_auto_no_low_stock_returns_zero(self, auth_b):
        # fresh user with no products
        r = requests.post(f"{BASE_URL}/api/purchase-orders/auto", json={}, headers=auth_b)
        assert r.status_code == 200
        assert r.json() == {"created": [], "count": 0}
