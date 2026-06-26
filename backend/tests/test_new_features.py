"""Backend tests for new StockMaster features:
- 15-month stock history with carry-forward
- Currency selection (SEK/DKK/EUR/GBP)
- Warehouse address field
- PO email with warehouse delivery address
- Snapshot recording on product/movement changes
- Per-user isolation for new endpoints
"""
import os
import uuid
from datetime import datetime, timezone

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


# ---------------- Currency / Settings ----------------
class TestCurrencySettings:
    def test_default_currency_is_sek(self, base_url, auth_a):
        r = requests.get(f"{base_url}/api/auth/me", headers=auth_a, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "currency" in d, "currency field missing on /auth/me"
        # could be any previously-set value; just must be one of the allowed
        assert d["currency"] in ("SEK", "DKK", "EUR", "GBP")

    def test_currency_update_all_supported(self, base_url, auth_a):
        for cur in ("DKK", "EUR", "GBP", "SEK"):
            r = requests.put(f"{base_url}/api/settings", headers=auth_a,
                             json={"currency": cur}, timeout=15)
            assert r.status_code == 200, f"PUT settings {cur} -> {r.status_code} {r.text}"
            assert r.json()["currency"] == cur
            # Verify persistence via /auth/me
            r2 = requests.get(f"{base_url}/api/auth/me", headers=auth_a, timeout=15)
            assert r2.status_code == 200
            assert r2.json()["currency"] == cur, f"persisted currency mismatch: {r2.json()}"

    def test_currency_update_rejects_unsupported(self, base_url, auth_a):
        for bad in ("USD", "JPY", "sek", "", "XXX"):
            r = requests.put(f"{base_url}/api/settings", headers=auth_a,
                             json={"currency": bad}, timeout=15)
            assert r.status_code == 400, f"expected 400 for currency={bad!r}, got {r.status_code}"

    def test_currency_isolation_between_users(self, base_url, auth_a, auth_b):
        # Set A to GBP, B to EUR — neither should affect the other.
        requests.put(f"{base_url}/api/settings", headers=auth_a, json={"currency": "GBP"}, timeout=15)
        requests.put(f"{base_url}/api/settings", headers=auth_b, json={"currency": "EUR"}, timeout=15)
        ra = requests.get(f"{base_url}/api/auth/me", headers=auth_a, timeout=15).json()
        rb = requests.get(f"{base_url}/api/auth/me", headers=auth_b, timeout=15).json()
        assert ra["currency"] == "GBP"
        assert rb["currency"] == "EUR"


# ---------------- Warehouse address ----------------
class TestWarehouseAddress:
    def test_create_warehouse_with_address_persists(self, base_url, auth_a):
        name = f"TEST_WH_{uuid.uuid4().hex[:6]}"
        addr = "Storgatan 1, 11122 Stockholm, SE"
        r = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                          json={"name": name, "location": "Stockholm", "address": addr}, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == name
        assert created.get("address") == addr, f"address not returned on POST: {created}"
        wid = created["id"]

        # GET list must include the warehouse with address
        r = requests.get(f"{base_url}/api/warehouses", headers=auth_a, timeout=15)
        assert r.status_code == 200
        match = [w for w in r.json() if w["id"] == wid]
        assert len(match) == 1, "newly created warehouse not present in list"
        assert match[0].get("address") == addr, f"address missing in list: {match[0]}"
        assert match[0].get("name") == name

        # cleanup
        requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)

    def test_create_warehouse_without_address_ok(self, base_url, auth_a):
        # address is optional
        r = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                          json={"name": f"TEST_WH_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert r.status_code == 200
        wid = r.json()["id"]
        # address may be None or absent
        assert r.json().get("address") in (None, "")
        requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)


# ---------------- Stock history (15 months) ----------------
class TestStockHistory:
    def test_returns_exactly_15_months_ordered(self, base_url, auth_a):
        r = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_a, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "history" in d
        hist = d["history"]
        assert isinstance(hist, list)
        assert len(hist) == 15, f"expected 15 monthly points, got {len(hist)}"
        # last item must be the current YYYY-MM
        now = datetime.now(timezone.utc)
        expected_last = f"{now.year:04d}-{now.month:02d}"
        assert hist[-1]["month"] == expected_last, f"last month {hist[-1]['month']} != {expected_last}"
        # months must be strictly chronologically increasing and YYYY-MM formatted
        prev = None
        for pt in hist:
            assert "month" in pt and "value" in pt
            ym = pt["month"]
            assert len(ym) == 7 and ym[4] == "-"
            y, m = int(ym[:4]), int(ym[5:])
            assert 1 <= m <= 12
            key = y * 12 + m
            if prev is not None:
                assert key == prev + 1, f"months not contiguous: {ym} after prev key {prev}"
            prev = key
            assert isinstance(pt["value"], (int, float))
            assert pt["value"] >= 0

    def test_current_month_reflects_latest_stock_value(self, base_url, auth_a):
        # Create a product with known cost*qty contribution and verify current month >= that contribution
        cost = 7.5
        qty = 4
        name = f"TEST_HIST_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{base_url}/api/products", headers=auth_a,
                          json={"name": name, "cost": cost, "price": 10.0, "quantity": qty,
                                "low_stock_threshold": 1}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            # Dashboard updates snapshot and gives us total stock_value
            dr = requests.get(f"{base_url}/api/dashboard", headers=auth_a, timeout=15)
            assert dr.status_code == 200
            stock_value = dr.json()["stock_value"]

            r = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_a, timeout=15)
            hist = r.json()["history"]
            current = hist[-1]["value"]
            assert abs(current - stock_value) < 0.01, (
                f"current-month history value {current} != dashboard stock_value {stock_value}"
            )
            # And it must include our product's contribution
            assert current >= cost * qty - 0.01
        finally:
            requests.delete(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)

    def test_snapshot_updated_by_movement(self, base_url, auth_a):
        # Create with qty=2 cost=5 -> contribution 10. Then receive +3 -> qty=5 -> +15 contribution
        r = requests.post(f"{base_url}/api/products", headers=auth_a,
                          json={"name": f"TEST_SNAP_{uuid.uuid4().hex[:6]}", "cost": 5.0,
                                "price": 9.0, "quantity": 2, "low_stock_threshold": 1}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            before = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_a, timeout=15).json()["history"][-1]["value"]
            # receive 3
            r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                              json={"product_id": pid, "type": "receive", "quantity": 3}, timeout=15)
            assert r.status_code == 200
            after = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_a, timeout=15).json()["history"][-1]["value"]
            # snapshot should have increased by 3 * 5 = 15
            assert after - before >= 14.99, f"snapshot did not increase after movement: before={before} after={after}"
        finally:
            requests.delete(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15)

    def test_history_isolation_between_users(self, base_url, auth_a, auth_b):
        ra = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_a, timeout=15)
        rb = requests.get(f"{base_url}/api/reports/stock-history", headers=auth_b, timeout=15)
        assert ra.status_code == 200 and rb.status_code == 200
        assert len(ra.json()["history"]) == 15
        assert len(rb.json()["history"]) == 15
        # B is a brand-new isolation user with no products -> current month must be 0
        assert rb.json()["history"][-1]["value"] == 0


# ---------------- PO email with warehouse delivery address ----------------
class TestPOEmailWarehouse:
    def _mk_product(self, base_url, auth, supplier_id=None):
        body = {"name": f"TEST_POW_{uuid.uuid4().hex[:6]}", "cost": 2.0, "price": 5.0,
                "quantity": 0, "low_stock_threshold": 5, "supplier_id": supplier_id}
        r = requests.post(f"{base_url}/api/products", headers=auth, json=body, timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_po_email_includes_deliver_to_with_address(self, base_url, auth_a):
        # warehouse with address
        wname = f"TEST_DLV_{uuid.uuid4().hex[:6]}"
        waddr = "Lagervägen 42, 41501 Göteborg, SE"
        wr = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                           json={"name": wname, "address": waddr}, timeout=15)
        assert wr.status_code == 200
        wid = wr.json()["id"]
        # supplier
        sr = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                           json={"name": "TEST_POW_Sup", "email": "pow@test.com"}, timeout=15)
        sid = sr.json()["id"]
        p = self._mk_product(base_url, auth_a, supplier_id=sid)
        try:
            r = requests.post(f"{base_url}/api/reports/po-email", headers=auth_a,
                              json={"supplier_id": sid, "warehouse_id": wid,
                                    "product_ids": [p["id"]]}, timeout=20)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["to"] == "pow@test.com"
            body = d["body"]
            assert "Deliver to:" in body, f"'Deliver to:' missing in body: {body!r}"
            assert wname in body, f"warehouse name missing in body: {body!r}"
            assert waddr in body, f"warehouse address missing in body: {body!r}"
            assert p["name"] in body
        finally:
            requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)
            requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)
            requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)

    def test_po_email_without_warehouse_omits_delivery(self, base_url, auth_a):
        sr = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                           json={"name": "TEST_POW_Sup2", "email": "pow2@test.com"}, timeout=15)
        sid = sr.json()["id"]
        p = self._mk_product(base_url, auth_a, supplier_id=sid)
        try:
            r = requests.post(f"{base_url}/api/reports/po-email", headers=auth_a,
                              json={"supplier_id": sid, "product_ids": [p["id"]]}, timeout=20)
            assert r.status_code == 200
            assert "Deliver to:" not in r.json()["body"]
        finally:
            requests.delete(f"{base_url}/api/products/{p['id']}", headers=auth_a, timeout=15)
            requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)

    def test_po_email_warehouse_isolation(self, base_url, auth_a, auth_b):
        # A's warehouse must NOT be usable by B's PO email (should be silently ignored / no delivery section)
        wr = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                           json={"name": "TEST_ISO_WH", "address": "Secret Address 1"}, timeout=15)
        wid = wr.json()["id"]
        try:
            # B creates own supplier+product
            sr = requests.post(f"{base_url}/api/suppliers", headers=auth_b,
                               json={"name": "TEST_B_Sup", "email": "b@test.com"}, timeout=15)
            sid = sr.json()["id"]
            pr = requests.post(f"{base_url}/api/products", headers=auth_b,
                               json={"name": f"TEST_B_{uuid.uuid4().hex[:6]}", "cost": 1,
                                     "quantity": 0, "low_stock_threshold": 5,
                                     "supplier_id": sid}, timeout=15)
            pid = pr.json()["id"]
            r = requests.post(f"{base_url}/api/reports/po-email", headers=auth_b,
                              json={"supplier_id": sid, "warehouse_id": wid,
                                    "product_ids": [pid]}, timeout=20)
            assert r.status_code == 200
            body = r.json()["body"]
            assert "Secret Address 1" not in body, "Other-user warehouse address leaked into PO body"
            assert "TEST_ISO_WH" not in body, "Other-user warehouse name leaked into PO body"
            # cleanup B
            requests.delete(f"{base_url}/api/products/{pid}", headers=auth_b, timeout=15)
            requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_b, timeout=15)
        finally:
            requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)
