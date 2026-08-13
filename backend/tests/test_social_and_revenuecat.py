"""Tests for new session features:
- Existing email/password login regression
- Google (Emergent) session login: POST /api/auth/session
- Apple sign-in: POST /api/auth/apple
- Billing plan: GET /api/billing/plan (must include pro_limits)
- RevenueCat sync (auth): POST /api/billing/revenuecat/sync
- RevenueCat webhook (public + idempotent): POST /api/billing/revenuecat/webhook
- Regression: GET /api/sales-orders?status=saved
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://warehouse-tracker-103.preview.emergentagent.com",
).rstrip("/")


# --------------- Email/password auth regression ---------------
class TestEmailPasswordAuth:
    def test_login_success_warehouse(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "warehouse@test.com", "password": "test123"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and body["access_token"]
        assert body.get("token_type") == "bearer"

    def test_login_wrong_password_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "warehouse@test.com", "password": "wrongpass"},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_login_unknown_user_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": f"nobody_{uuid.uuid4().hex[:8]}@test.com", "password": "x"},
            timeout=15,
        )
        assert r.status_code == 401, r.text


# --------------- Google session login ---------------
class TestGoogleSession:
    def test_bogus_session_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "bogus"},
            timeout=20,
        )
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        # must not 500
        assert r.status_code != 500


# --------------- Apple sign-in ---------------
class TestAppleAuth:
    def test_bogus_identity_token_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/apple",
            json={"identity_token": "bogus"},
            timeout=15,
        )
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        assert r.status_code != 500


# --------------- Billing plan ---------------
class TestBillingPlan:
    @pytest.fixture(scope="class")
    def token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "warehouse@test.com", "password": "test123"},
            timeout=15,
        )
        assert r.status_code == 200
        return r.json()["access_token"]

    def test_plan_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/billing/plan", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_plan_shape(self, token):
        r = requests.get(
            f"{BASE_URL}/api/billing/plan",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("plan", "limits", "pro_limits", "usage", "price"):
            assert key in body, f"missing key {key} in {body}"
        pro = body["pro_limits"]
        # exact values per spec
        assert pro == {"products": 9999, "categories": 99, "warehouses": 19, "suppliers": 9999}, pro
        # usage should have all 4 counters
        for k in ("products", "categories", "warehouses", "suppliers"):
            assert k in body["usage"]
        # limits reflect free/pro
        assert body["plan"] in ("free", "pro")


# --------------- RevenueCat sync ---------------
class TestRevenueCatSync:
    @pytest.fixture(scope="class")
    def token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "warehouse@test.com", "password": "test123"},
            timeout=15,
        )
        assert r.status_code == 200
        return r.json()["access_token"]

    def test_sync_unauth_401(self):
        r = requests.post(f"{BASE_URL}/api/billing/revenuecat/sync", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_sync_no_rc_configured_returns_plan_ok(self, token):
        r = requests.post(
            f"{BASE_URL}/api/billing/revenuecat/sync",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        # Even without RevenueCat secret configured, must not 500
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert "plan" in body
        assert body["plan"] in ("free", "pro")


# --------------- RevenueCat webhook (idempotent) ---------------
class TestRevenueCatWebhook:
    def test_webhook_first_and_duplicate(self):
        event_id = f"evt_test_{uuid.uuid4().hex[:12]}"
        payload = {"event": {"id": event_id, "app_user_id": "nobody"}}

        r1 = requests.post(
            f"{BASE_URL}/api/billing/revenuecat/webhook",
            json=payload,
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("ok") is True
        assert not b1.get("duplicate"), f"first call should not be duplicate: {b1}"

        # Same event id -> duplicate:true
        r2 = requests.post(
            f"{BASE_URL}/api/billing/revenuecat/webhook",
            json=payload,
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert b2.get("ok") is True
        assert b2.get("duplicate") is True, f"second call should be duplicate: {b2}"


# --------------- Regression: sales-orders status filter ---------------
class TestSalesOrdersStatusFilter:
    @pytest.fixture(scope="class")
    def token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "warehouse@test.com", "password": "test123"},
            timeout=15,
        )
        assert r.status_code == 200
        return r.json()["access_token"]

    def test_list_status_saved(self, token):
        r = requests.get(
            f"{BASE_URL}/api/sales-orders",
            params={"status": "saved"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # all returned items must have status=saved (if any exist)
        for item in data:
            assert item.get("status") == "saved", item
