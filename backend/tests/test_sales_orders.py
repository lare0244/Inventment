"""Sales Orders backend tests (Jan 2026)."""
import re
import uuid
from datetime import datetime, timezone

import pytest
import requests

from conftest import BASE_URL


# ---------- helpers ----------
def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_or_create_warehouse(token):
    h = _auth(token)
    whs = requests.get(f"{BASE_URL}/api/warehouses", headers=h, timeout=15).json()
    if whs:
        return whs[0]
    r = requests.post(f"{BASE_URL}/api/warehouses", headers=h,
                      json={"name": f"TEST_WH_{uuid.uuid4().hex[:6]}"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _create_product(token, wh_id, qty=50, name=None):
    h = _auth(token)
    payload = {"name": name or f"TEST_SO_PROD_{uuid.uuid4().hex[:6]}",
               "quantity": qty, "low_stock_threshold": 1,
               "warehouse_id": wh_id, "price": 10.0, "cost": 5.0}
    r = requests.post(f"{BASE_URL}/api/products", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _create_so(token, warehouse_id, items=None, **extra):
    h = _auth(token)
    body = {"field1": extra.get("field1", "C1"),
            "field2": extra.get("field2", "P1"),
            "comment": extra.get("comment", ""),
            "shipping_ref": extra.get("shipping_ref", ""),
            "order_date": extra.get("order_date"),
            "warehouse_id": warehouse_id,
            "items": items or []}
    body = {k: v for k, v in body.items() if v is not None}
    r = requests.post(f"{BASE_URL}/api/sales-orders", headers=h, json=body, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _set_status(token, oid, status):
    return requests.post(f"{BASE_URL}/api/sales-orders/{oid}/status",
                         headers=_auth(token), json={"status": status}, timeout=15)


# ---------- order number ----------
class TestOrderNumber:
    def test_order_number_format_and_increment(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o1 = _create_so(token_a, wh["id"])
        o2 = _create_so(token_a, wh["id"])
        pattern = r"^[0-9]{4}[A-Z][0-9]{6}$"
        assert re.match(pattern, o1["order_number"]), o1["order_number"]
        assert re.match(pattern, o2["order_number"]), o2["order_number"]
        # YYMM prefix matches now (Jan 2026 expected -> 2601)
        period = datetime.now(timezone.utc).strftime("%y%m")
        assert o1["order_number"].startswith(period)
        assert o2["order_number"].startswith(period)
        # increment by 1
        n1 = int(o1["order_number"][5:])
        n2 = int(o2["order_number"][5:])
        assert n2 == n1 + 1

    def test_isolated_user_starts_at_A000001(self, token_b):
        wh = _get_or_create_warehouse(token_b)
        o = _create_so(token_b, wh["id"])
        period = datetime.now(timezone.utc).strftime("%y%m")
        assert o["order_number"] == f"{period}A000001", o["order_number"]


# ---------- status transitions ----------
class TestStatusTransitions:
    def test_saved_to_picked_ok(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        r = _set_status(token_a, o["id"], "picked")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "picked"

    def test_saved_to_shipped_ok(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        r = _set_status(token_a, o["id"], "shipped")
        assert r.status_code == 200, r.text

    def test_picked_to_shipped_ok(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        assert _set_status(token_a, o["id"], "picked").status_code == 200
        r = _set_status(token_a, o["id"], "shipped")
        assert r.status_code == 200, r.text

    def test_shipped_to_returned_ok(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        assert _set_status(token_a, o["id"], "shipped").status_code == 200
        r = _set_status(token_a, o["id"], "returned")
        assert r.status_code == 200, r.text

    def test_picked_to_saved_blocked(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        assert _set_status(token_a, o["id"], "picked").status_code == 200
        r = _set_status(token_a, o["id"], "saved")
        assert r.status_code == 400
        assert r.json().get("detail") == "invalid_transition"

    def test_shipped_to_picked_blocked(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        assert _set_status(token_a, o["id"], "shipped").status_code == 200
        r = _set_status(token_a, o["id"], "picked")
        assert r.status_code == 400
        assert r.json().get("detail") == "invalid_transition"

    def test_returned_to_anything_blocked(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        assert _set_status(token_a, o["id"], "shipped").status_code == 200
        assert _set_status(token_a, o["id"], "returned").status_code == 200
        for target in ("saved", "picked", "shipped"):
            r = _set_status(token_a, o["id"], target)
            assert r.status_code == 400, f"{target}: {r.status_code}"

    def test_bad_status_string(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        r = _set_status(token_a, o["id"], "nonsense")
        assert r.status_code == 400
        assert r.json().get("detail") == "bad_status"


# ---------- stock effects ----------
class TestStockEffects:
    def test_ship_then_return_stock_delta(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        prod = _create_product(token_a, wh["id"], qty=50)
        n = 7
        o = _create_so(token_a, wh["id"], items=[{"product_id": prod["id"], "quantity": n, "name": prod["name"]}])
        # ship -> stock decreases by N
        r = _set_status(token_a, o["id"], "shipped")
        assert r.status_code == 200, r.text
        p_after_ship = requests.get(f"{BASE_URL}/api/products/{prod['id']}", headers=_auth(token_a), timeout=15).json()
        assert int(p_after_ship["stock"].get(wh["id"], 0)) == 50 - n
        # return -> stock back to original
        r = _set_status(token_a, o["id"], "returned")
        assert r.status_code == 200, r.text
        p_after_ret = requests.get(f"{BASE_URL}/api/products/{prod['id']}", headers=_auth(token_a), timeout=15).json()
        assert int(p_after_ret["stock"].get(wh["id"], 0)) == 50


# ---------- edit lock ----------
class TestEditLock:
    def test_edit_allowed_saved_picked_blocked_after_shipped(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        o = _create_so(token_a, wh["id"])
        h = _auth(token_a)
        # saved -> edit ok
        upd = {"field1": "X", "field2": "Y", "comment": "c", "shipping_ref": "s",
               "order_date": o["order_date"], "warehouse_id": wh["id"], "items": []}
        r = requests.put(f"{BASE_URL}/api/sales-orders/{o['id']}", headers=h, json=upd, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["field1"] == "X"
        # picked -> edit ok
        assert _set_status(token_a, o["id"], "picked").status_code == 200
        r = requests.put(f"{BASE_URL}/api/sales-orders/{o['id']}", headers=h, json=upd, timeout=15)
        assert r.status_code == 200, r.text
        # shipped -> edit blocked
        assert _set_status(token_a, o["id"], "shipped").status_code == 200
        r = requests.put(f"{BASE_URL}/api/sales-orders/{o['id']}", headers=h, json=upd, timeout=15)
        assert r.status_code == 400
        assert r.json().get("detail") == "locked_after_shipped"
        # returned -> still blocked
        assert _set_status(token_a, o["id"], "returned").status_code == 200
        r = requests.put(f"{BASE_URL}/api/sales-orders/{o['id']}", headers=h, json=upd, timeout=15)
        assert r.status_code == 400
        assert r.json().get("detail") == "locked_after_shipped"


# ---------- chart ----------
class TestChart:
    def test_chart_shape(self, token_a):
        r = requests.get(f"{BASE_URL}/api/sales-orders/chart", headers=_auth(token_a), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "months" in data and "series" in data
        assert len(data["months"]) == 15
        # YYYY-MM format
        for m in data["months"]:
            assert re.match(r"^\d{4}-\d{2}$", m), m
        # last month is current YYYY-MM
        current = datetime.now(timezone.utc).strftime("%Y-%m")
        assert data["months"][-1] == current
        for st in ("saved", "picked", "shipped", "returned"):
            assert st in data["series"]
            assert len(data["series"][st]) == 15
            assert all(isinstance(x, int) for x in data["series"][st])


# ---------- list filter/search/sort ----------
class TestListFilterSearchSort:
    def test_filter_search_sort(self, token_a):
        wh = _get_or_create_warehouse(token_a)
        ref_tag = f"REF{uuid.uuid4().hex[:6].upper()}"
        a = _create_so(token_a, wh["id"], shipping_ref=ref_tag, field1="ZZZ", order_date="2025-01-01")
        b = _create_so(token_a, wh["id"], shipping_ref=ref_tag, field1="AAA", order_date="2025-12-15")
        # filter by status=saved
        r = requests.get(f"{BASE_URL}/api/sales-orders?status=saved", headers=_auth(token_a), timeout=15)
        assert r.status_code == 200, r.text
        ids = [o["id"] for o in r.json()]
        assert a["id"] in ids and b["id"] in ids
        # search by shipping_ref
        r = requests.get(f"{BASE_URL}/api/sales-orders?q={ref_tag}", headers=_auth(token_a), timeout=15)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert a["id"] in ids and b["id"] in ids
        # default sort = date desc -> b before a
        r = requests.get(f"{BASE_URL}/api/sales-orders?q={ref_tag}", headers=_auth(token_a), timeout=15)
        rows = r.json()
        idx_a = next(i for i, o in enumerate(rows) if o["id"] == a["id"])
        idx_b = next(i for i, o in enumerate(rows) if o["id"] == b["id"])
        assert idx_b < idx_a, "date desc should put 2025-12-15 before 2025-01-01"
        # sort = order_number asc
        r = requests.get(f"{BASE_URL}/api/sales-orders?q={ref_tag}&sort=order_number",
                         headers=_auth(token_a), timeout=15)
        rows = r.json()
        nums = [o["order_number"] for o in rows if o["id"] in (a["id"], b["id"])]
        assert nums == sorted(nums)
        # sort = field1 alpha -> AAA (b) before ZZZ (a)
        r = requests.get(f"{BASE_URL}/api/sales-orders?q={ref_tag}&sort=field1",
                         headers=_auth(token_a), timeout=15)
        rows = r.json()
        idx_a = next(i for i, o in enumerate(rows) if o["id"] == a["id"])
        idx_b = next(i for i, o in enumerate(rows) if o["id"] == b["id"])
        assert idx_b < idx_a


# ---------- settings labels ----------
class TestSettingsLabels:
    def test_persist_and_truncate(self, token_a):
        h = _auth(token_a)
        # 14 char label -> truncated to 12
        r = requests.put(f"{BASE_URL}/api/settings", headers=h,
                         json={"so_field1_label": "Customer Name!", "so_field2_label": "PO Reference"}, timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=15).json()
        assert me["so_field1_label"] == "Customer Nam", me["so_field1_label"]  # 12 chars
        assert me["so_field2_label"] == "PO Reference"
        # restore cleaner values for FE testing
        requests.put(f"{BASE_URL}/api/settings", headers=h,
                     json={"so_field1_label": "Customer", "so_field2_label": "PO Ref"}, timeout=15)
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=15).json()
        assert me["so_field1_label"] == "Customer"
        assert me["so_field2_label"] == "PO Ref"
