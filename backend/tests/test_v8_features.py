"""
Tests for v8 batch of INVENTMENT features:
- AI insights honors lang & currency (English/Swedish)
- Entity limits (warehouses 19, categories 99) - 400 with message
- Limit-guard code path exists for products 9999 / suppliers 9999 (do NOT actually create 9999)
- Draft PO create via items[] + warehouse_id (Save order draft path)
- Draft PO delete (trash icon)
- Sent PO cannot be deleted indirectly (FE rule) — backend just exposes DELETE; we verify deleting a draft works
- Regression spot-checks: list endpoints respond, /products supports ?search= (name match)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


# ---------------- Helpers ----------------
def _hdrs(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _new_user():
    """Create a fresh isolated user so limit tests don't pollute warehouse@test.com."""
    email = f"TEST_v8_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "test123", "name": "v8"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ---------------- AI insights / language / currency ----------------
class TestAIInsightsI18n:
    def test_ai_insights_swedish(self, auth_a):
        r = requests.get(f"{BASE_URL}/api/reports/ai-insights?lang=sv&currency=DKK", headers=auth_a, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "insight" in body and isinstance(body["insight"], str) and body["insight"].strip()
        text = body["insight"].lower()
        # Swedish hints: presence of typical Swedish letters or words
        swedish_hits = sum(1 for w in ["å", "ä", "ö", "och", "för", "lager", "inköp", "tröskel", "produkter"] if w in text)
        # Tolerant: at least one Swedish marker OR rule-based Swedish fallback string
        assert swedish_hits >= 1 or "ai-insikter" in text or "påfyllningslistan" in text, f"Not Swedish: {body['insight'][:300]}"

    def test_ai_insights_english(self, auth_a):
        r = requests.get(f"{BASE_URL}/api/reports/ai-insights?lang=en&currency=GBP", headers=auth_a, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("insight", "").strip()
        # English markers
        text = body["insight"].lower()
        english_markers = ["the", "stock", "reorder", "low", "items", "threshold", "purchase"]
        assert any(m in text for m in english_markers), f"Not English: {body['insight'][:300]}"


# ---------------- Entity limits ----------------
class TestEntityLimits:
    """Use a fresh user so we can hit limits without polluting other accounts."""

    @pytest.fixture(scope="class")
    def token(self):
        return _new_user()

    @pytest.fixture(scope="class")
    def headers(self, token):
        return _hdrs(token)

    def test_warehouse_limit_19(self, headers):
        # Default register seeds 1 warehouse ("Main Warehouse"). Create up to 19 total.
        # That's 18 more posts -> all 200; 20th -> 400.
        created = 0
        for i in range(25):
            r = requests.post(f"{BASE_URL}/api/warehouses", headers=headers,
                              json={"name": f"TEST_v8_wh_{i}", "location": "L"}, timeout=15)
            if r.status_code == 200:
                created += 1
                continue
            assert r.status_code == 400, f"expected 400 over-limit, got {r.status_code} {r.text}"
            msg = r.json().get("detail", "").lower()
            assert "warehouse" in msg and "limit" in msg, f"unexpected detail: {r.json()}"
            assert "19" in msg, f"limit value missing in message: {r.json()}"
            # Verify count is exactly 19
            lst = requests.get(f"{BASE_URL}/api/warehouses", headers=headers, timeout=15).json()
            assert len(lst) == 19, f"expected 19 warehouses at limit, got {len(lst)}"
            return
        pytest.fail("Never hit warehouse limit after 25 attempts")

    def test_category_limit_99(self, headers):
        # Fresh user starts with 0 categories
        last_status = None
        last_detail = None
        for i in range(120):
            r = requests.post(f"{BASE_URL}/api/categories", headers=headers,
                              json={"name": f"TEST_v8_cat_{i}", "color": "#FF5722"}, timeout=15)
            last_status = r.status_code
            if r.status_code == 200:
                continue
            assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
            last_detail = r.json().get("detail", "")
            msg = last_detail.lower()
            assert "category" in msg and "limit" in msg and "99" in msg, f"unexpected detail: {last_detail}"
            lst = requests.get(f"{BASE_URL}/api/categories", headers=headers, timeout=15).json()
            assert len(lst) == 99, f"expected 99 categories at limit, got {len(lst)}"
            return
        pytest.fail(f"Never hit category limit (last={last_status}, detail={last_detail})")

    def test_product_limit_guard_code_path_exists(self):
        """Verify the MAX_PRODUCTS=9999 constant exists in server.py without actually creating 9999."""
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        assert "MAX_PRODUCTS = 9999" in src
        assert "Product limit reached" in src
        # And the check is wired into POST /products
        assert "MAX_PRODUCTS" in src.split("create_product")[1].split("\n", 30)[0:30].__str__() or \
               "count_documents" in src.split("create_product")[1][:500]

    def test_supplier_limit_guard_code_path_exists(self):
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        assert "MAX_SUPPLIERS = 9999" in src
        assert "Supplier limit reached" in src


# ---------------- Draft PO create / delete ----------------
class TestDraftPO:
    @pytest.fixture(scope="class")
    def ctx(self):
        token = _new_user()
        h = _hdrs(token)
        # ensure default warehouse exists
        whs = requests.get(f"{BASE_URL}/api/warehouses", headers=h, timeout=15).json()
        assert whs, "no default warehouse seeded"
        wh_id = whs[0]["id"]
        # create a couple of products
        prods = []
        for i in range(2):
            r = requests.post(f"{BASE_URL}/api/products", headers=h, json={
                "name": f"TEST_v8_prod_{i}", "sku": f"V8-{i}", "price": 10.0, "cost": 5.0,
                "quantity": 2, "low_stock_threshold": 5, "warehouse_id": wh_id
            }, timeout=15)
            assert r.status_code == 200, r.text
            prods.append(r.json())
        return {"token": token, "headers": h, "wh_id": wh_id, "products": prods}

    def test_save_order_draft_via_items(self, ctx):
        h = ctx["headers"]; wh = ctx["wh_id"]; prods = ctx["products"]
        items = [{"product_id": prods[0]["id"], "qty": 7}, {"product_id": prods[1]["id"], "qty": 3}]
        r = requests.post(f"{BASE_URL}/api/purchase-orders", headers=h,
                          json={"items": items, "warehouse_id": wh}, timeout=20)
        assert r.status_code == 200, r.text
        po = r.json()
        assert po["status"] == "draft"
        assert po["warehouse_id"] == wh
        assert len(po["items"]) == 2
        qty_map = {it["product_id"]: it["qty"] for it in po["items"]}
        assert qty_map[prods[0]["id"]] == 7
        assert qty_map[prods[1]["id"]] == 3
        # total = 7*5 + 3*5 = 50
        assert abs(po["total"] - 50.0) < 0.01, po
        # GET /purchase-orders should include it
        lst = requests.get(f"{BASE_URL}/api/purchase-orders", headers=h, timeout=15).json()
        assert any(x["id"] == po["id"] for x in lst)
        ctx["po_id"] = po["id"]

    def test_delete_draft_po(self, ctx):
        h = ctx["headers"]
        # depends on previous test; if it didn't run, create one
        po_id = ctx.get("po_id")
        if not po_id:
            r = requests.post(f"{BASE_URL}/api/purchase-orders", headers=h,
                              json={"items": [{"product_id": ctx["products"][0]["id"], "qty": 1}],
                                    "warehouse_id": ctx["wh_id"]}, timeout=20)
            po_id = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=h, timeout=15)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True
        # verify gone
        lst = requests.get(f"{BASE_URL}/api/purchase-orders", headers=h, timeout=15).json()
        assert not any(x["id"] == po_id for x in lst), "PO still listed after DELETE"

    def test_sent_po_still_deletable_at_api_level_but_frontend_hides_trash(self, ctx):
        """Backend has no business-rule guard; FE-only restriction. We just confirm endpoint stable."""
        h = ctx["headers"]
        r = requests.post(f"{BASE_URL}/api/purchase-orders", headers=h,
                          json={"items": [{"product_id": ctx["products"][0]["id"], "qty": 1}],
                                "warehouse_id": ctx["wh_id"]}, timeout=20)
        assert r.status_code == 200
        po_id = r.json()["id"]
        s = requests.put(f"{BASE_URL}/api/purchase-orders/{po_id}/sent", headers=h, timeout=15)
        assert s.status_code == 200 and s.json()["status"] == "sent"
        # Backend permits DELETE (no rule) — FE just hides the icon for sent.
        d = requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=h, timeout=15)
        assert d.status_code == 200


# ---------------- Catalog search regression (backend matches name) ----------------
class TestCatalogSearchBackend:
    def test_products_search_name(self, auth_a):
        # Seed product with very unique name
        whs = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_a, timeout=15).json()
        wh_id = whs[0]["id"]
        uniq = f"TEST_v8_search_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/products", headers=auth_a, json={
            "name": uniq, "price": 1.0, "cost": 0.5, "quantity": 1, "low_stock_threshold": 5, "warehouse_id": wh_id
        }, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        s = requests.get(f"{BASE_URL}/api/products?search={uniq[:10]}", headers=auth_a, timeout=15)
        assert s.status_code == 200
        names = [p["name"] for p in s.json()]
        assert uniq in names, names
        # cleanup
        requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_a, timeout=15)
