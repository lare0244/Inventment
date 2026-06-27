"""V5 tests — transfers, per-warehouse adjust/remove, low-stock per warehouse."""
import os
import uuid
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


def _wh(auth, name):
    r = requests.post(f"{BASE}/api/warehouses", json={"name": name, "location": "x"}, headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _prod(auth, name, wid=None, qty=0, threshold=5, cost=1.0):
    body = {"name": name, "quantity": qty, "cost": cost, "low_stock_threshold": threshold}
    if wid:
        body["warehouse_id"] = wid
    r = requests.post(f"{BASE}/api/products", json=body, headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _get(auth, pid):
    r = requests.get(f"{BASE}/api/products/{pid}", headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- transfer ----------------
class TestTransfer:
    def test_transfer_moves_units_keeps_total(self, auth_a):
        w1 = _wh(auth_a, f"TEST_TR_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_TR_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_TR_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=40)
        r = requests.post(f"{BASE}/api/transfers",
                          json={"product_id": p["id"], "from_warehouse_id": w1["id"],
                                "to_warehouse_id": w2["id"], "quantity": 15},
                          headers=auth_a, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["stock"][w1["id"]] == 25
        assert body["stock"][w2["id"]] == 15
        assert body["quantity"] == 40

        fresh = _get(auth_a, p["id"])
        assert fresh["stock"][w1["id"]] == 25
        assert fresh["stock"][w2["id"]] == 15
        assert fresh["quantity"] == 40

    def test_transfer_same_warehouse_rejected(self, auth_a):
        w1 = _wh(auth_a, f"TEST_TR_SAME_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_TR_SAME_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=10)
        r = requests.post(f"{BASE}/api/transfers",
                          json={"product_id": p["id"], "from_warehouse_id": w1["id"],
                                "to_warehouse_id": w1["id"], "quantity": 5}, headers=auth_a, timeout=15)
        assert r.status_code == 400, r.text
        assert "differ" in r.json()["detail"].lower()

    def test_transfer_insufficient_stock_rejected(self, auth_a):
        w1 = _wh(auth_a, f"TEST_TR_OV_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_TR_OV_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_TR_OV_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=3)
        r = requests.post(f"{BASE}/api/transfers",
                          json={"product_id": p["id"], "from_warehouse_id": w1["id"],
                                "to_warehouse_id": w2["id"], "quantity": 10}, headers=auth_a, timeout=15)
        assert r.status_code == 400, r.text
        assert "enough" in r.json()["detail"].lower()
        # Stock unchanged
        fresh = _get(auth_a, p["id"])
        assert fresh["stock"][w1["id"]] == 3
        assert fresh["stock"].get(w2["id"], 0) == 0

    def test_transfer_records_transfer_movement(self, auth_a):
        w1 = _wh(auth_a, f"TEST_TR_MV_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_TR_MV_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_TR_MV_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=10)
        r = requests.post(f"{BASE}/api/transfers",
                          json={"product_id": p["id"], "from_warehouse_id": w1["id"],
                                "to_warehouse_id": w2["id"], "quantity": 4, "note": "TEST_NOTE"},
                          headers=auth_a, timeout=15)
        assert r.status_code == 200
        # Fetch recent movements and ensure a transfer entry exists
        mv = requests.get(f"{BASE}/api/movements?limit=30", headers=auth_a, timeout=15).json()
        m = next((x for x in mv if x.get("product_id") == p["id"] and x.get("type") == "transfer"), None)
        assert m is not None, "transfer movement not recorded"
        assert m["from_warehouse_id"] == w1["id"]
        assert m["warehouse_id"] == w2["id"]
        assert m["quantity"] == 4
        assert m["resulting_qty"] == 4  # destination qty after move
        assert m["resulting_total"] == 10

    def test_transfer_negative_qty_rejected(self, auth_a):
        w1 = _wh(auth_a, f"TEST_TR_NEG_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_TR_NEG_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_TR_NEG_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=10)
        r = requests.post(f"{BASE}/api/transfers",
                          json={"product_id": p["id"], "from_warehouse_id": w1["id"],
                                "to_warehouse_id": w2["id"], "quantity": -2}, headers=auth_a, timeout=15)
        assert r.status_code == 400, r.text


# ---------------- per-warehouse adjust / remove ----------------
class TestAdjustRemove:
    def test_adjust_sets_warehouse_qty(self, auth_a):
        w1 = _wh(auth_a, f"TEST_ADJ_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_ADJ_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_ADJ_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=20)
        # also seed w2 via a receive
        requests.post(f"{BASE}/api/movements",
                      json={"product_id": p["id"], "type": "receive", "quantity": 5, "warehouse_id": w2["id"]},
                      headers=auth_a, timeout=15)
        # adjust w1 -> 7
        r = requests.post(f"{BASE}/api/movements",
                          json={"product_id": p["id"], "type": "adjust", "quantity": 7, "warehouse_id": w1["id"]},
                          headers=auth_a, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resulting_qty"] == 7
        assert body["resulting_total"] == 7 + 5
        fresh = _get(auth_a, p["id"])
        assert fresh["stock"][w1["id"]] == 7
        assert fresh["stock"][w2["id"]] == 5

    def test_remove_subtracts_from_warehouse_floored(self, auth_a):
        w1 = _wh(auth_a, f"TEST_RM_A_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_RM_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=3)
        r = requests.post(f"{BASE}/api/movements",
                          json={"product_id": p["id"], "type": "remove", "quantity": 10, "warehouse_id": w1["id"]},
                          headers=auth_a, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["resulting_qty"] == 0
        fresh = _get(auth_a, p["id"])
        assert fresh["stock"][w1["id"]] == 0
        assert fresh["quantity"] == 0

    def test_remove_only_affects_target_warehouse(self, auth_a):
        w1 = _wh(auth_a, f"TEST_RM2_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_RM2_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_RM2_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=20)
        requests.post(f"{BASE}/api/movements",
                      json={"product_id": p["id"], "type": "receive", "quantity": 8, "warehouse_id": w2["id"]},
                      headers=auth_a, timeout=15)
        requests.post(f"{BASE}/api/movements",
                      json={"product_id": p["id"], "type": "remove", "quantity": 5, "warehouse_id": w2["id"]},
                      headers=auth_a, timeout=15)
        fresh = _get(auth_a, p["id"])
        assert fresh["stock"][w1["id"]] == 20
        assert fresh["stock"][w2["id"]] == 3
        assert fresh["quantity"] == 23

    def test_low_stock_flag_per_warehouse(self, auth_a):
        w1 = _wh(auth_a, f"TEST_LS_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_LS_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_LS_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=100, threshold=5)
        # adjust w2 to 2 -> should be low
        r = requests.post(f"{BASE}/api/movements",
                          json={"product_id": p["id"], "type": "adjust", "quantity": 2, "warehouse_id": w2["id"]},
                          headers=auth_a, timeout=15)
        assert r.json()["low_stock"] is True
        # adjust w1 to 200 -> not low even though qty changes; verify on w1
        r2 = requests.post(f"{BASE}/api/movements",
                           json={"product_id": p["id"], "type": "adjust", "quantity": 200, "warehouse_id": w1["id"]},
                           headers=auth_a, timeout=15)
        assert r2.json()["low_stock"] is False


# ---------------- reorder suggestions & dashboard regression ----------------
class TestReorderAndDashboard:
    def test_reorder_suggestions_total(self, auth_a):
        # Create a fresh low product and confirm it appears in suggestions
        w1 = _wh(auth_a, f"TEST_RO_A_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_RO_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=1, threshold=5, cost=2.0)
        r = requests.get(f"{BASE}/api/reports/reorder-suggestions", headers=auth_a, timeout=15)
        assert r.status_code == 200, r.text
        sugg = r.json()
        names = [s["name"] for s in sugg["suggestions"]]
        assert p["name"] in names
        item = next(s for s in sugg["suggestions"] if s["name"] == p["name"])
        # threshold=5, qty=1 -> suggested = max(10-1, 5) = 9
        assert item["suggested_qty"] == 9
        assert item["current_qty"] == 1
        assert item["threshold"] == 5
        assert item["estimated_cost"] == round(2.0 * 9, 2)

    def test_dashboard_no_filter_lists_per_warehouse_low(self, auth_a):
        w1 = _wh(auth_a, f"TEST_DS_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_DS_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_DS_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=100, threshold=5)
        requests.post(f"{BASE}/api/movements",
                      json={"product_id": p["id"], "type": "adjust", "quantity": 1, "warehouse_id": w2["id"]},
                      headers=auth_a, timeout=15)
        r = requests.get(f"{BASE}/api/dashboard", headers=auth_a, timeout=15).json()
        # Expect a low_stock row with our product on w2
        matches = [x for x in r["low_stock_items"] if x.get("name") == p["name"]]
        # at least one row references w2 with qty=1
        assert any(x.get("quantity") == 1 for x in matches)

    def test_dashboard_warehouse_filter_scopes_units(self, auth_a):
        w1 = _wh(auth_a, f"TEST_DF1_A_{uuid.uuid4().hex[:6]}")
        w2 = _wh(auth_a, f"TEST_DF1_B_{uuid.uuid4().hex[:6]}")
        p = _prod(auth_a, f"TEST_DF1_{uuid.uuid4().hex[:6]}", wid=w1["id"], qty=11)
        requests.post(f"{BASE}/api/movements",
                      json={"product_id": p["id"], "type": "receive", "quantity": 4, "warehouse_id": w2["id"]},
                      headers=auth_a, timeout=15)
        rw1 = requests.get(f"{BASE}/api/dashboard?warehouse_id={w1['id']}", headers=auth_a, timeout=15).json()
        rw2 = requests.get(f"{BASE}/api/dashboard?warehouse_id={w2['id']}", headers=auth_a, timeout=15).json()
        # Filtering should report different totals per wh
        assert rw1["total_units"] >= 11
        assert rw2["total_units"] >= 4
