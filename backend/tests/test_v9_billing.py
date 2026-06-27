"""
v9 — Free vs PRO billing, per-entity limits, plan in /auth/me, measure on products.
Uses a fresh isolated user for each limit test (warehouse@test.com is shared
and likely already near caps, so we don't use it for create-flows).
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _fresh_user():
    email = f"TEST_v9_{uuid.uuid4().hex[:10]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "v9"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return tok, email


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- /auth/me plan ----------------
class TestAuthMePlan:
    def test_new_user_has_free_plan(self):
        tok, email = _fresh_user()
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=20)
        assert me.status_code == 200
        body = me.json()
        assert body.get("plan") == "free", f"new user must be plan=free, got {body.get('plan')}"
        assert body.get("email", "").lower() == email.lower()


# ---------------- /billing/plan ----------------
class TestBillingPlan:
    def test_billing_plan_shape(self):
        tok, _ = _fresh_user()
        r = requests.get(f"{API}/billing/plan", headers=_h(tok), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert b["plan"] == "free"
        # limits per FREE tier
        assert b["limits"] == {"products": 9, "categories": 9, "warehouses": 2, "suppliers": 9}
        # usage keys present
        for k in ("products", "categories", "warehouses", "suppliers"):
            assert k in b["usage"]
            assert isinstance(b["usage"][k], int)
        # price shape
        assert b["price"]["amount"] == 6.99
        assert b["price"]["currency"] == "EUR"
        assert b["price"]["interval"] == "month"

    def test_billing_plan_usage_reflects_seed_warehouse(self):
        tok, _ = _fresh_user()
        b = requests.get(f"{API}/billing/plan", headers=_h(tok), timeout=20).json()
        # registration seeds 1 'Main Warehouse'
        assert b["usage"]["warehouses"] == 1


# ---------------- /billing/checkout ----------------
class TestBillingCheckout:
    def test_checkout_returns_real_stripe_url(self):
        tok, _ = _fresh_user()
        r = requests.post(f"{API}/billing/checkout", headers=_h(tok),
                          json={"origin_url": BASE}, timeout=30)
        assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text}"
        b = r.json()
        assert "url" in b and "session_id" in b
        assert b["url"].startswith("https://checkout.stripe.com/"), f"bad url: {b['url']}"
        assert b["session_id"].startswith("cs_"), f"bad session_id: {b['session_id']}"

    def test_status_unpaid_does_not_upgrade(self):
        tok, _ = _fresh_user()
        r = requests.post(f"{API}/billing/checkout", headers=_h(tok),
                          json={"origin_url": BASE}, timeout=30)
        sid = r.json()["session_id"]
        # Poll status - should be unpaid initially
        st = requests.get(f"{API}/billing/status/{sid}", headers=_h(tok), timeout=20)
        assert st.status_code == 200
        body = st.json()
        # payment_status should NOT be paid
        assert body["payment_status"] != "paid", f"unexpected paid: {body}"
        assert body["plan"] == "free", f"should not upgrade until paid: {body}"
        # /auth/me still free
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=20).json()
        assert me["plan"] == "free"

    def test_status_idempotent_double_poll(self):
        tok, _ = _fresh_user()
        sid = requests.post(f"{API}/billing/checkout", headers=_h(tok),
                            json={"origin_url": BASE}, timeout=30).json()["session_id"]
        a = requests.get(f"{API}/billing/status/{sid}", headers=_h(tok), timeout=20).json()
        b = requests.get(f"{API}/billing/status/{sid}", headers=_h(tok), timeout=20).json()
        # Both calls return free; no accidental upgrade
        assert a["plan"] == "free"
        assert b["plan"] == "free"


# ---------------- FREE limits (403 limit_reached) ----------------
class TestFreeLimits:
    def test_warehouse_limit_2(self):
        tok, _ = _fresh_user()
        # User starts with 1 (seed). Add 1 more → ok. Then 3rd → 403.
        r1 = requests.post(f"{API}/warehouses", headers=_h(tok), json={"name": "TEST_v9_wh2"}, timeout=20)
        assert r1.status_code == 200, f"2nd warehouse should be allowed: {r1.status_code} {r1.text}"
        r2 = requests.post(f"{API}/warehouses", headers=_h(tok), json={"name": "TEST_v9_wh3"}, timeout=20)
        assert r2.status_code == 403, f"3rd warehouse must hit 403, got {r2.status_code}: {r2.text}"
        detail = r2.json().get("detail", "")
        assert detail.startswith("limit_reached:"), f"bad detail: {detail}"
        assert "warehouses" in detail and ":2:" in detail and "free" in detail

    def test_category_limit_9(self):
        tok, _ = _fresh_user()
        for i in range(9):
            r = requests.post(f"{API}/categories", headers=_h(tok), json={"name": f"TEST_v9_cat{i}"}, timeout=20)
            assert r.status_code == 200, f"cat #{i+1} failed: {r.status_code} {r.text}"
        bad = requests.post(f"{API}/categories", headers=_h(tok), json={"name": "TEST_v9_cat10"}, timeout=20)
        assert bad.status_code == 403
        d = bad.json().get("detail", "")
        assert d.startswith("limit_reached:") and "categories" in d and ":9:" in d

    def test_supplier_limit_9(self):
        tok, _ = _fresh_user()
        for i in range(9):
            r = requests.post(f"{API}/suppliers", headers=_h(tok), json={"name": f"TEST_v9_sup{i}"}, timeout=20)
            assert r.status_code == 200, f"sup #{i+1} failed: {r.status_code} {r.text}"
        bad = requests.post(f"{API}/suppliers", headers=_h(tok), json={"name": "TEST_v9_sup10"}, timeout=20)
        assert bad.status_code == 403
        d = bad.json().get("detail", "")
        assert d.startswith("limit_reached:") and "suppliers" in d and ":9:" in d

    def test_product_limit_9(self):
        tok, _ = _fresh_user()
        # Need a warehouse to satisfy product create — fresh user has seeded one.
        whs = requests.get(f"{API}/warehouses", headers=_h(tok), timeout=20).json()
        assert len(whs) >= 1
        wid = whs[0]["id"]
        for i in range(9):
            r = requests.post(f"{API}/products", headers=_h(tok),
                              json={"name": f"TEST_v9_p{i}", "warehouse_id": wid,
                                    "price": 1, "cost": 0.5, "quantity": 0}, timeout=20)
            assert r.status_code == 200, f"product #{i+1} failed: {r.status_code} {r.text}"
        bad = requests.post(f"{API}/products", headers=_h(tok),
                            json={"name": "TEST_v9_p10", "warehouse_id": wid,
                                  "price": 1, "cost": 0.5, "quantity": 0}, timeout=20)
        assert bad.status_code == 403
        d = bad.json().get("detail", "")
        assert d.startswith("limit_reached:") and "products" in d and ":9:" in d


# ---------------- measure passthrough ----------------
class TestProductMeasure:
    def test_measure_persisted_on_product(self):
        tok, _ = _fresh_user()
        whs = requests.get(f"{API}/warehouses", headers=_h(tok), timeout=20).json()
        wid = whs[0]["id"]
        r = requests.post(f"{API}/products", headers=_h(tok), json={
            "name": "TEST_v9_measure", "warehouse_id": wid, "price": 2, "cost": 1,
            "quantity": 0, "measure_value": 500, "measure_unit": "ml",
        }, timeout=20)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        got = requests.get(f"{API}/products/{pid}", headers=_h(tok), timeout=20)
        assert got.status_code == 200
        body = got.json()
        assert body.get("measure_value") == 500
        assert body.get("measure_unit") == "ml"
