"""Backend tests for v3 features:
- PUT /api/warehouses/{id}
- PUT /api/categories/{id}
- PUT /api/suppliers/{id}
- POST /api/purchase-orders with {product_ids, warehouse_id}
- GET/DELETE/PUT(sent) /api/purchase-orders
"""
import os
import uuid
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://warehouse-tracker-103.preview.emergentagent.com",
).rstrip("/")


# ---------------- Settings CRUD edits ----------------
class TestWarehouseEdit:
    def test_put_warehouse_updates_name_and_address(self, base_url, auth_a):
        # create
        r = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                          json={"name": f"TEST_WH_{uuid.uuid4().hex[:6]}",
                                "address": "Old Addr 1"}, timeout=15)
        assert r.status_code == 200
        wid = r.json()["id"]
        try:
            new_name = f"TEST_WH_UPD_{uuid.uuid4().hex[:6]}"
            new_addr = "New Addr 22, 41501 Göteborg"
            pr = requests.put(f"{base_url}/api/warehouses/{wid}", headers=auth_a,
                              json={"name": new_name, "address": new_addr}, timeout=15)
            assert pr.status_code == 200, pr.text
            data = pr.json()
            assert data["id"] == wid
            assert data["name"] == new_name
            assert data.get("address") == new_addr
            # verify via GET list
            lst = requests.get(f"{base_url}/api/warehouses", headers=auth_a, timeout=15).json()
            match = [w for w in lst if w["id"] == wid]
            assert len(match) == 1
            assert match[0]["name"] == new_name
            assert match[0].get("address") == new_addr
        finally:
            requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)

    def test_put_warehouse_isolation(self, base_url, auth_a, auth_b):
        # A creates warehouse; B tries to PUT — should silently no-op (not modify A's)
        cr = requests.post(f"{base_url}/api/warehouses", headers=auth_a,
                          json={"name": "TEST_WH_ISO", "address": "Secret"}, timeout=15)
        wid = cr.json()["id"]
        try:
            requests.put(f"{base_url}/api/warehouses/{wid}", headers=auth_b,
                         json={"name": "HACKED", "address": "h4ck"}, timeout=15)
            lst = requests.get(f"{base_url}/api/warehouses", headers=auth_a, timeout=15).json()
            mine = [w for w in lst if w["id"] == wid][0]
            assert mine["name"] == "TEST_WH_ISO"
            assert mine.get("address") == "Secret"
        finally:
            requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth_a, timeout=15)


class TestCategoryEdit:
    def test_put_category_updates_name(self, base_url, auth_a):
        r = requests.post(f"{base_url}/api/categories", headers=auth_a,
                          json={"name": "TEST_CAT_OLD"}, timeout=15)
        cid = r.json()["id"]
        try:
            pr = requests.put(f"{base_url}/api/categories/{cid}", headers=auth_a,
                              json={"name": "TEST_CAT_NEW"}, timeout=15)
            assert pr.status_code == 200
            assert pr.json()["name"] == "TEST_CAT_NEW"
            assert pr.json()["id"] == cid
            lst = requests.get(f"{base_url}/api/categories", headers=auth_a, timeout=15).json()
            match = [c for c in lst if c["id"] == cid][0]
            assert match["name"] == "TEST_CAT_NEW"
        finally:
            requests.delete(f"{base_url}/api/categories/{cid}", headers=auth_a, timeout=15)


class TestSupplierEdit:
    def test_put_supplier_updates_name_and_email(self, base_url, auth_a):
        r = requests.post(f"{base_url}/api/suppliers", headers=auth_a,
                          json={"name": "TEST_SUP_OLD", "email": "old@x.com"}, timeout=15)
        sid = r.json()["id"]
        try:
            pr = requests.put(f"{base_url}/api/suppliers/{sid}", headers=auth_a,
                              json={"name": "TEST_SUP_NEW", "email": "new@x.com"}, timeout=15)
            assert pr.status_code == 200
            assert pr.json()["name"] == "TEST_SUP_NEW"
            assert pr.json()["email"] == "new@x.com"
            assert pr.json()["id"] == sid
            lst = requests.get(f"{base_url}/api/suppliers", headers=auth_a, timeout=15).json()
            match = [s for s in lst if s["id"] == sid][0]
            assert match["email"] == "new@x.com"
        finally:
            requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth_a, timeout=15)


# ---------------- Purchase order creation flow ----------------
class TestPurchaseOrderCreate:
    def _setup(self, base_url, auth):
        wr = requests.post(f"{base_url}/api/warehouses", headers=auth,
                           json={"name": "TEST_PO_WH", "address": "PO Addr 1"}, timeout=15)
        wid = wr.json()["id"]
        sr = requests.post(f"{base_url}/api/suppliers", headers=auth,
                           json={"name": "TEST_PO_SUP", "email": "po@x.com"}, timeout=15)
        sid = sr.json()["id"]
        pr = requests.post(f"{base_url}/api/products", headers=auth,
                           json={"name": f"TEST_PO_PROD_{uuid.uuid4().hex[:6]}",
                                 "cost": 3.0, "price": 6.0, "quantity": 0,
                                 "low_stock_threshold": 5,
                                 "supplier_id": sid, "warehouse_id": wid}, timeout=15)
        pid = pr.json()["id"]
        return wid, sid, pid

    def _cleanup(self, base_url, auth, wid, sid, pid, po_id=None):
        if po_id:
            requests.delete(f"{base_url}/api/purchase-orders/{po_id}", headers=auth, timeout=15)
        requests.delete(f"{base_url}/api/products/{pid}", headers=auth, timeout=15)
        requests.delete(f"{base_url}/api/suppliers/{sid}", headers=auth, timeout=15)
        requests.delete(f"{base_url}/api/warehouses/{wid}", headers=auth, timeout=15)

    def test_create_po_with_product_and_warehouse(self, base_url, auth_a):
        wid, sid, pid = self._setup(base_url, auth_a)
        po_id = None
        try:
            r = requests.post(f"{base_url}/api/purchase-orders", headers=auth_a,
                              json={"product_ids": [pid], "warehouse_id": wid,
                                    "supplier_id": sid}, timeout=20)
            assert r.status_code == 200, r.text
            po = r.json()
            assert "id" in po
            po_id = po["id"]
            assert po["status"] == "draft"
            assert po["warehouse_id"] == wid
            assert po["warehouse_name"] == "TEST_PO_WH"
            assert po["supplier_id"] == sid
            assert po["supplier_name"] == "TEST_PO_SUP"
            assert po["supplier_email"] == "po@x.com"
            assert isinstance(po["items"], list) and len(po["items"]) == 1
            it = po["items"][0]
            assert it["product_id"] == pid
            # qty=0, threshold=5 -> reorder = max(10-0, 5) = 10
            assert it["qty"] == 10
            assert abs(it["cost"] - 3.0) < 0.01
            # total = 10 * 3 = 30
            assert abs(po["total"] - 30.0) < 0.01
            assert "Deliver to:" in po["email_body"]
            assert "TEST_PO_WH" in po["email_body"]
            assert "PO Addr 1" in po["email_body"]
            assert po.get("sent_at") is None
            assert "_id" not in po

            # GET list contains the PO
            lst = requests.get(f"{base_url}/api/purchase-orders", headers=auth_a, timeout=15).json()
            assert any(x["id"] == po_id for x in lst)

            # mark sent
            mr = requests.put(f"{base_url}/api/purchase-orders/{po_id}/sent", headers=auth_a, timeout=15)
            assert mr.status_code == 200
            assert mr.json()["status"] == "sent"
            assert mr.json()["sent_at"] is not None
        finally:
            self._cleanup(base_url, auth_a, wid, sid, pid, po_id)

    def test_create_po_warehouse_only_no_supplier(self, base_url, auth_a):
        # mirrors what place-order.tsx sends: only product_ids + warehouse_id
        wid, sid, pid = self._setup(base_url, auth_a)
        po_id = None
        try:
            r = requests.post(f"{base_url}/api/purchase-orders", headers=auth_a,
                              json={"product_ids": [pid], "warehouse_id": wid}, timeout=20)
            assert r.status_code == 200, r.text
            po = r.json()
            po_id = po["id"]
            assert po["supplier_id"] is None
            assert po["supplier_name"] is None
            assert po["warehouse_id"] == wid
            assert len(po["items"]) == 1
        finally:
            self._cleanup(base_url, auth_a, wid, sid, pid, po_id)

    def test_po_isolation(self, base_url, auth_a, auth_b):
        # A creates a PO; B's list must not include it
        wid, sid, pid = self._setup(base_url, auth_a)
        po_id = None
        try:
            r = requests.post(f"{base_url}/api/purchase-orders", headers=auth_a,
                              json={"product_ids": [pid], "warehouse_id": wid,
                                    "supplier_id": sid}, timeout=20)
            po_id = r.json()["id"]
            lst_b = requests.get(f"{base_url}/api/purchase-orders", headers=auth_b, timeout=15).json()
            assert not any(x["id"] == po_id for x in lst_b)
        finally:
            self._cleanup(base_url, auth_a, wid, sid, pid, po_id)
