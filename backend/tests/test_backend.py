"""Backend tests for StockMaster API"""
import os
import time
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


# ---------------- Auth ----------------
class TestAuth:
    def test_register_duplicate_or_login(self, base_url):
        # warehouse@test.com should already exist (seeded). Duplicate register => 400
        r = requests.post(f"{base_url}/api/auth/register",
                          json={"email": "warehouse@test.com", "password": "test123"}, timeout=15)
        assert r.status_code in (200, 400)
        # login works
        r = requests.post(f"{base_url}/api/auth/login",
                          json={"email": "warehouse@test.com", "password": "test123"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and d.get("token_type") == "bearer"

    def test_login_bad_password(self, base_url):
        r = requests.post(f"{base_url}/api/auth/login",
                          json={"email": "warehouse@test.com", "password": "wrongpass"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, base_url, auth_a):
        r = requests.get(f"{base_url}/api/auth/me", headers=auth_a, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == "warehouse@test.com"
        assert "id" in d and "_id" not in d

    def test_me_no_token(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me", timeout=15)
        assert r.status_code == 401


# ---------------- Warehouses / Categories / Suppliers ----------------
class TestEntities:
    def test_default_warehouse_seeded(self, base_url, auth_a):
        r = requests.get(f"{base_url}/api/warehouses", headers=auth_a, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_category_crud(self, base_url, auth_a):
        r = requests.post(f"{base_url}/api/categories", headers=auth_a,
                          json={"name": "TEST_Cat", "color": "#000"}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        r = requests.get(f"{base_url}/api/categories", headers=auth_a, timeout=15)
        assert any(c["id"] == cid for c in r.json())
        r = requests.delete(f"{base_url}/api/categories/{cid}", headers=auth_a, timeout=15)
        assert r.status_code == 200

    def test_supplier_crud(self, base_url, auth_a):
        r = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                          json={"name": "TEST_Sup", "email": "sup@test.com"}, timeout=15)
        assert r.status_code == 200
        sid = r.json()["id"]
        # update
        r = requests.put(f"{base_url}/api/suppliers/{sid}", headers=auth_a,
                         json={"id": sid, "name": "TEST_Sup2", "email": "sup2@test.com"}, timeout=15)
        assert r.status_code == 200
        # delete
        r = requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)
        assert r.status_code == 200


# ---------------- Products + Movements ----------------
class TestProductsAndMovements:
    def test_product_lifecycle_with_movement(self, base_url, auth_a):
        # create
        payload = {
            "name": f"TEST_Prod_{uuid.uuid4().hex[:6]}",
            "barcode": f"TESTBC{uuid.uuid4().hex[:8]}",
            "price": 9.99, "cost": 4.0, "quantity": 10,
            "low_stock_threshold": 5,
            "best_before_date": "2026-12-31T00:00:00Z"
        }
        r = requests.post(f"{base_url}/api/products", headers=auth_a, json=payload, timeout=15)
        assert r.status_code == 200
        prod = r.json()
        pid = prod["id"]
        assert "_id" not in prod
        assert prod["quantity"] == 10

        # GET verify
        r = requests.get(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
        assert r.status_code == 200 and r.json()["id"] == pid

        # by-barcode
        r = requests.get(f"{base_url}/api/products/by-barcode/{payload['barcode']}", headers=auth_a, timeout=15)
        assert r.status_code == 200 and r.json()["id"] == pid

        # receive +5 => 15
        r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "receive", "quantity": 5}, timeout=15)
        assert r.status_code == 200
        assert r.json()["resulting_qty"] == 15

        # remove 3 => 12
        r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "remove", "quantity": 3}, timeout=15)
        assert r.status_code == 200 and r.json()["resulting_qty"] == 12

        # adjust => 2 (below threshold)
        r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "adjust", "quantity": 2}, timeout=15)
        assert r.status_code == 200 and r.json()["resulting_qty"] == 2

        # remove more than current => clamps to 0
        r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "remove", "quantity": 999}, timeout=15)
        assert r.json()["resulting_qty"] == 0

        # verify via GET product
        r = requests.get(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
        assert r.json()["quantity"] == 0

        # update product
        upd = {**payload, "quantity": 7, "price": 12.5}
        r = requests.put(f"{base_url}/api/products/{pid}", headers=auth_a, json=upd, timeout=15)
        assert r.status_code == 200 and r.json()["price"] == 12.5
        assert r.json()["quantity"] == 7

        # delete
        r = requests.delete(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
        assert r.status_code == 200
        # verify gone
        r = requests.get(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
        assert r.status_code == 404

    def test_movement_on_missing_product(self, base_url, auth_a):
        r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": "does-not-exist", "type": "receive", "quantity": 1}, timeout=15)
        assert r.status_code == 404


# ---------------- Barcode lookup (Open Food Facts) ----------------
class TestBarcode:
    def test_known_barcode(self, base_url, auth_a):
        # Nutella - common test barcode
        r = requests.get(f"{base_url}/api/barcode-lookup/3017620422003", headers=auth_a, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "found" in d and "name" in d

    def test_unknown_barcode(self, base_url, auth_a):
        r = requests.get(f"{base_url}/api/barcode-lookup/0000000000000", headers=auth_a, timeout=20)
        assert r.status_code == 200
        assert r.json()["found"] is False


# ---------------- Dashboard & Reports ----------------
class TestDashboardReports:
    def _mk_product(self, base_url, auth, name, qty, threshold=5, cost=2.0, price=5.0, supplier_id=None, best_before=None):
        body = {"name": name, "quantity": qty, "low_stock_threshold": threshold,
                "cost": cost, "price": price, "supplier_id": supplier_id, "best_before_date": best_before}
        r = requests.post(f"{base_url}/api/products", headers=auth, json=body, timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_dashboard_fields(self, base_url, auth_a):
        p = self._mk_product(base_url, auth_a, f"TEST_DASH_{uuid.uuid4().hex[:6]}", qty=2, threshold=10,
                             best_before="2026-02-15T00:00:00Z")
        r = requests.get(f"{base_url}/api/dashboard", headers=auth_a, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_products", "total_units", "stock_value", "retail_value",
                  "low_stock_count", "low_stock_items", "expiring_count", "expiring_items", "recent_movements"]:
            assert k in d, f"missing {k}"
        assert d["low_stock_count"] >= 1
        # cleanup
        requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)

    def test_reorder_suggestions(self, base_url, auth_a):
        # supplier + low stock product
        rs = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                          json={"name": "TEST_SupReorder", "email": "ro@test.com"}, timeout=15)
        sid = rs.json()["id"]
        p = self._mk_product(base_url, auth_a, f"TEST_RO_{uuid.uuid4().hex[:6]}", qty=1, threshold=10, cost=3.0, supplier_id=sid)
        r = requests.get(f"{base_url}/api/reports/reorder-suggestions", headers=auth_a, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "suggestions" in d and "total_estimated_cost" in d
        match = [s for s in d["suggestions"] if s["product_id"] == p["id"]]
        assert len(match) == 1
        s = match[0]
        # suggested_qty = max(threshold*2 - qty, threshold) = max(19, 10) = 19
        assert s["suggested_qty"] == 19
        assert s["estimated_cost"] == round(3.0 * 19, 2)
        assert s["supplier_email"] == "ro@test.com"
        # cleanup
        requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)
        requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)

    def test_po_email_draft(self, base_url, auth_a):
        rs = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                          json={"name": "TEST_PO_Sup", "email": "po@test.com"}, timeout=15)
        sid = rs.json()["id"]
        p = self._mk_product(base_url, auth_a, f"TEST_PO_{uuid.uuid4().hex[:6]}", qty=0, threshold=5, supplier_id=sid)
        r = requests.post(f"{base_url}/api/reports/po-email", headers=auth_a,
                          json={"supplier_id": sid, "product_ids": [p["id"]]}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["to"] == "po@test.com"
        assert "subject" in d and "body" in d
        assert p["name"] in d["body"]
        # cleanup
        requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)
        requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)

    def test_ai_insights(self, base_url, auth_a):
        # ensure some product exists
        p = self._mk_product(base_url, auth_a, f"TEST_AI_{uuid.uuid4().hex[:6]}", qty=1, threshold=10)
        r = requests.get(f"{base_url}/api/reports/ai-insights", headers=auth_a, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "insight" in d
        assert isinstance(d["insight"], str) and len(d["insight"]) > 0
        # cleanup
        requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)


# ---------------- Multi-tenant isolation ----------------
class TestIsolation:
    def test_product_owner_isolation(self, base_url, auth_a, auth_b):
        # A creates product
        r = requests.post(f"{base_url}/api/products", headers=auth_a,
                          json={"name": f"TEST_ISO_{uuid.uuid4().hex[:6]}", "quantity": 5,
                                "barcode": f"ISOBC{uuid.uuid4().hex[:8]}"}, timeout=15)
        assert r.status_code == 200
        prod = r.json()
        pid = prod["id"]

        # B cannot GET
        r = requests.get(f"{base_url}/api/products/{pid}", headers=auth_b, timeout=15)
        assert r.status_code == 404

        # B cannot find by barcode
        r = requests.get(f"{base_url}/api/products/by-barcode/{prod['barcode']}", headers=auth_b, timeout=15)
        assert r.status_code == 404

        # B's list doesn't include it
        r = requests.get(f"{base_url}/api/products", headers=auth_b, timeout=15)
        assert all(p["id"] != pid for p in r.json())

        # B cannot delete it
        r = requests.delete(f"{base_url}/api/products/{pid}", headers=auth_b, timeout=15)
        assert r.status_code == 200  # delete returns ok even if nothing matched (no-op)
        # verify still exists for A
        r = requests.get(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
        assert r.status_code == 200

        # B cannot create movement
        r = requests.post(f"{base_url}/api/movements", headers=auth_b,
                          json={"product_id": pid, "type": "receive", "quantity": 1}, timeout=15)
        assert r.status_code == 404

        # cleanup
        requests.delete(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)
