"""Backend tests for v4 PER-WAREHOUSE STOCK feature:
- product.stock = {warehouse_id: qty}, product.quantity = sum
- GET /products?warehouse_id filter + per-warehouse qty
- POST /movements updates only target warehouse; total recomputed; low_stock based on that wh
- POST /products initializes stock; PUT /products updates one warehouse without clobbering others
- GET /dashboard low_stock_items per (product,warehouse) with warehouse_name; ?warehouse_id scopes totals
- Migration: existing products have stock backfilled
"""
import os
import uuid
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://warehouse-tracker-103.preview.emergentagent.com",
).rstrip("/")


# ---------- Helpers ----------
def _mk_wh(base_url, auth, name):
    r = requests.post(f"{base_url}/api/warehouses", headers=auth,
                      json={"name": name, "address": ""}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _mk_product(base_url, auth, name, wid, qty=0, threshold=5, cost=2.0, price=5.0):
    r = requests.post(f"{base_url}/api/products", headers=auth,
                      json={"name": name, "cost": cost, "price": price,
                            "quantity": qty, "low_stock_threshold": threshold,
                            "warehouse_id": wid}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _del_product(base_url, auth, pid):
    requests.delete(f"{base_url}/api/products/{pid}", headers=auth, timeout=15)


def _del_wh(base_url, auth, wid):
    requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth, timeout=15)


# ---------- Tests ----------
class TestProductsListStock:
    """GET /api/products returns stock dict + quantity total; ?warehouse_id scopes."""

    def test_create_initializes_stock_and_total(self, base_url, auth_a):
        wid = _mk_wh(base_url, auth_a, f"TEST_WH_A_{uuid.uuid4().hex[:6]}")
        try:
            p = _mk_product(base_url, auth_a, f"TEST_P_{uuid.uuid4().hex[:6]}", wid, qty=7)
            assert isinstance(p.get("stock"), dict)
            assert int(p["stock"].get(wid, 0)) == 7
            assert int(p["quantity"]) == 7
            _del_product(base_url, auth_a, p["id"])
        finally:
            _del_wh(base_url, auth_a, wid)

    def test_list_returns_total_quantity_across_warehouses(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_WH1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_WH2_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_MULTI_{uuid.uuid4().hex[:6]}", w1, qty=3)
        pid = p["id"]
        try:
            # add 5 to w2 via movement
            mv = requests.post(f"{base_url}/api/movements", headers=auth_a,
                               json={"product_id": pid, "type": "receive",
                                     "quantity": 5, "warehouse_id": w2}, timeout=15)
            assert mv.status_code == 200, mv.text
            # GET /products (no filter) should show total 8
            lst = requests.get(f"{base_url}/api/products", headers=auth_a, timeout=15).json()
            row = [x for x in lst if x["id"] == pid][0]
            assert row["quantity"] == 8
            assert int(row["stock"][w1]) == 3
            assert int(row["stock"][w2]) == 5
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)

    def test_list_with_warehouse_filter_returns_per_wh_qty(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_WH1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_WH2_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_FILTER_{uuid.uuid4().hex[:6]}", w1, qty=4)
        pid = p["id"]
        try:
            requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "receive",
                                "quantity": 9, "warehouse_id": w2}, timeout=15)
            # Filter by w1 -> quantity == 4
            lst1 = requests.get(f"{base_url}/api/products?warehouse_id={w1}", headers=auth_a, timeout=15).json()
            row1 = [x for x in lst1 if x["id"] == pid]
            assert len(row1) == 1
            assert row1[0]["quantity"] == 4
            # Filter by w2 -> quantity == 9
            lst2 = requests.get(f"{base_url}/api/products?warehouse_id={w2}", headers=auth_a, timeout=15).json()
            row2 = [x for x in lst2 if x["id"] == pid]
            assert len(row2) == 1
            assert row2[0]["quantity"] == 9
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)

    def test_list_with_warehouse_filter_excludes_products_not_stocked_there(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_WHA_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_WHB_{uuid.uuid4().hex[:6]}")
        p_only_w1 = _mk_product(base_url, auth_a, f"TEST_ONLY1_{uuid.uuid4().hex[:6]}", w1, qty=2)
        try:
            lst = requests.get(f"{base_url}/api/products?warehouse_id={w2}",
                               headers=auth_a, timeout=15).json()
            assert not any(x["id"] == p_only_w1["id"] for x in lst), \
                "Product stocked only in w1 must not appear when filtering by w2"
        finally:
            _del_product(base_url, auth_a, p_only_w1["id"])
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)


class TestMovementsPerWarehouse:
    """POST /api/movements updates only the target warehouse stock."""

    def test_receive_into_specific_wh_only_updates_that_wh(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_MV_W1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_MV_W2_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_MV_{uuid.uuid4().hex[:6]}", w1, qty=10)
        pid = p["id"]
        try:
            r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                              json={"product_id": pid, "type": "receive",
                                    "quantity": 6, "warehouse_id": w2}, timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["warehouse_id"] == w2
            assert body["resulting_qty"] == 6
            assert body["resulting_total"] == 16
            assert "low_stock" in body
            # GET product confirms both buckets
            got = requests.get(f"{base_url}/api/products/{pid}", headers=auth_a, timeout=15).json()
            assert int(got["stock"][w1]) == 10
            assert int(got["stock"][w2]) == 6
            assert got["quantity"] == 16
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)

    def test_low_stock_flag_is_per_warehouse(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_LS_W1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_LS_W2_{uuid.uuid4().hex[:6]}")
        # threshold=5; w1 has 100, w2 receives 2 -> w2 is low even though total > threshold
        p = _mk_product(base_url, auth_a, f"TEST_LS_{uuid.uuid4().hex[:6]}", w1, qty=100, threshold=5)
        pid = p["id"]
        try:
            r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                              json={"product_id": pid, "type": "receive",
                                    "quantity": 2, "warehouse_id": w2}, timeout=15)
            body = r.json()
            assert body["resulting_qty"] == 2
            assert body["resulting_total"] == 102
            assert body["low_stock"] is True, "low_stock must reflect the TARGET warehouse, not the total"
            assert body["threshold"] == 5
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)

    def test_remove_does_not_go_negative_per_wh(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_REM_W_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_REM_{uuid.uuid4().hex[:6]}", w1, qty=3)
        pid = p["id"]
        try:
            r = requests.post(f"{base_url}/api/movements", headers=auth_a,
                              json={"product_id": pid, "type": "remove",
                                    "quantity": 10, "warehouse_id": w1}, timeout=15)
            assert r.status_code == 200
            assert r.json()["resulting_qty"] == 0
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)


class TestProductPutPreservesOtherWarehouses:
    def test_put_only_updates_targeted_warehouse(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_PUT_W1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_PUT_W2_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_PUT_{uuid.uuid4().hex[:6]}", w1, qty=11)
        pid = p["id"]
        try:
            # Seed some stock in w2 too
            requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "receive",
                                "quantity": 4, "warehouse_id": w2}, timeout=15)
            # PUT targeting w2 -> only w2 changes
            pr = requests.put(f"{base_url}/api/products/{pid}", headers=auth_a,
                              json={"name": p["name"], "cost": 2.0, "price": 5.0,
                                    "quantity": 20, "low_stock_threshold": 5,
                                    "warehouse_id": w2}, timeout=15)
            assert pr.status_code == 200, pr.text
            body = pr.json()
            assert int(body["stock"][w1]) == 11, "w1 must be preserved"
            assert int(body["stock"][w2]) == 20, "w2 must be updated to new value"
            assert int(body["quantity"]) == 31
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)


class TestDashboardPerWarehouse:
    def test_dashboard_no_filter_lists_per_wh_low_stock(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_D_W1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_D_W2_{uuid.uuid4().hex[:6]}")
        # w1 stock = 1 (low), w2 receives 50 (not low)
        p = _mk_product(base_url, auth_a, f"TEST_D_{uuid.uuid4().hex[:6]}", w1, qty=1, threshold=5)
        pid = p["id"]
        try:
            requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "receive",
                                "quantity": 50, "warehouse_id": w2}, timeout=15)
            dash = requests.get(f"{base_url}/api/dashboard", headers=auth_a, timeout=15).json()
            # low_stock rows for our product
            mine = [r for r in dash["low_stock_items"]
                    if r.get("id", "").startswith(pid)]
            # Only w1 should be flagged low
            low_whs = [r.get("warehouse_name") for r in mine]
            assert any(r.get("quantity") == 1 for r in mine), f"expected qty=1 row, got {mine}"
            # warehouse_name should be present
            assert all(r.get("warehouse_name") for r in mine), \
                f"warehouse_name missing on low_stock rows: {mine}"
            # totals include both warehouses
            assert dash["total_units"] >= 51
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)

    def test_dashboard_warehouse_filter_scopes_totals(self, base_url, auth_a):
        w1 = _mk_wh(base_url, auth_a, f"TEST_DF_W1_{uuid.uuid4().hex[:6]}")
        w2 = _mk_wh(base_url, auth_a, f"TEST_DF_W2_{uuid.uuid4().hex[:6]}")
        p = _mk_product(base_url, auth_a, f"TEST_DF_{uuid.uuid4().hex[:6]}",
                        w1, qty=2, threshold=5, cost=10.0, price=20.0)
        pid = p["id"]
        try:
            requests.post(f"{base_url}/api/movements", headers=auth_a,
                          json={"product_id": pid, "type": "receive",
                                "quantity": 7, "warehouse_id": w2}, timeout=15)
            d1 = requests.get(f"{base_url}/api/dashboard?warehouse_id={w1}",
                              headers=auth_a, timeout=15).json()
            d2 = requests.get(f"{base_url}/api/dashboard?warehouse_id={w2}",
                              headers=auth_a, timeout=15).json()
            # w1 scope: qty=2 of our product
            assert d1["total_units"] >= 2
            # low stock in w1 (2 <= 5)
            mine1 = [r for r in d1["low_stock_items"] if r.get("name") == p["name"]]
            assert any(r["quantity"] == 2 for r in mine1)
            # w2 scope: qty=7 of our product, not low
            mine2 = [r for r in d2["low_stock_items"] if r.get("name") == p["name"]]
            assert not mine2, "product with qty 7 must not appear in w2 low list"
        finally:
            _del_product(base_url, auth_a, pid)
            _del_wh(base_url, auth_a, w1)
            _del_wh(base_url, auth_a, w2)


class TestMigrationBackfill:
    def test_existing_products_have_stock_dict(self, base_url, auth_a):
        # Every product returned from /products must have a stock dict (possibly empty)
        lst = requests.get(f"{base_url}/api/products", headers=auth_a, timeout=15).json()
        for row in lst:
            assert "stock" in row and isinstance(row["stock"], dict), \
                f"Product {row.get('id')} missing stock dict: {row}"
            # quantity must equal sum(stock) when stock present
            if row["stock"]:
                assert row["quantity"] == sum(int(v) for v in row["stock"].values()), \
                    f"quantity != sum(stock) for {row.get('id')}: {row}"
