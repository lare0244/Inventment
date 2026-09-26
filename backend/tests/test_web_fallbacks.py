"""Backend regression for web-fallback launch:
- DELETE /api/account (throwaway user)
- Barcode lookup used by web manual entry: /products/by-barcode/{code}, /barcode-lookup/{code}
- Basic health / login regression
"""
import os
import uuid
import time
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
       os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL (or EXPO_BACKEND_URL) must be set"
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def pro_headers():
    r = requests.post(f"{API}/auth/login", json={"email": "warehouse@test.com", "password": "test123"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _register(email: str, password: str = "throwaway123", name: str = "Throwaway"):
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "name": name})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------------- Health / login regression ----------------
class TestHealthLogin:
    def test_login_pro_ok(self, pro_headers):
        r = requests.get(f"{API}/auth/me", headers=pro_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "warehouse@test.com"


# ---------------- Barcode lookup (used by Scan tab web fallback) ----------------
class TestBarcodeLookup:
    def test_lookup_existing_product_by_barcode(self, pro_headers):
        # find any product that has a barcode; if none, create one
        prods = requests.get(f"{API}/products", headers=pro_headers).json()
        target = next((p for p in prods if p.get("barcode")), None)
        created_id = None
        if not target:
            # need a warehouse
            whs = requests.get(f"{API}/warehouses", headers=pro_headers).json()
            wid = whs[0]["id"] if whs else \
                  requests.post(f"{API}/warehouses", headers=pro_headers,
                                json={"name": "TEST_wh_bc"}).json()["id"]
            barcode = f"TEST{int(time.time())}"
            r = requests.post(f"{API}/products", headers=pro_headers,
                              json={"name": "TEST_bc_prod", "barcode": barcode,
                                    "quantity": 1, "warehouse_id": wid})
            assert r.status_code == 200, r.text
            target = r.json()
            created_id = target["id"]
        r = requests.get(f"{API}/products/by-barcode/{target['barcode']}", headers=pro_headers)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == target["id"]
        if created_id:
            requests.delete(f"{API}/products/{created_id}", headers=pro_headers)

    def test_lookup_unknown_returns_404(self, pro_headers):
        r = requests.get(f"{API}/products/by-barcode/TESTZZZ_does_not_exist_xyz",
                         headers=pro_headers)
        assert r.status_code == 404

    def test_barcode_lookup_external_never_500s(self, pro_headers):
        # OpenFoodFacts / external — must return 200 with {found: bool}
        r = requests.get(f"{API}/barcode-lookup/0000000000000", headers=pro_headers)
        assert r.status_code in (200, 404), r.status_code
        if r.status_code == 200:
            data = r.json()
            assert "found" in data


# ---------------- Delete account flow ----------------
class TestDeleteAccount:
    def test_register_delete_relogin_fails(self):
        email = f"test_del_{uuid.uuid4().hex[:8]}@test.com"
        tok = _register(email)
        h = {"Authorization": f"Bearer {tok}"}

        # sanity: authenticated
        me = requests.get(f"{API}/auth/me", headers=h)
        assert me.status_code == 200
        assert me.json()["email"] == email

        # create some owned data so we exercise the cascading cleanup
        w = requests.post(f"{API}/warehouses", headers=h, json={"name": "TEST_del_wh"})
        assert w.status_code == 200
        wid = w.json()["id"]
        p = requests.post(f"{API}/products", headers=h,
                          json={"name": "TEST_del_prod", "quantity": 2, "warehouse_id": wid})
        assert p.status_code == 200

        # delete account
        d = requests.delete(f"{API}/account", headers=h)
        assert d.status_code == 200, d.text
        body = d.json()
        assert body.get("ok") is True and body.get("deleted") is True

        # old token must no longer work
        me2 = requests.get(f"{API}/auth/me", headers=h)
        assert me2.status_code == 401

        # cannot login with same email/password
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": "throwaway123"})
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/account")
        assert r.status_code in (401, 403)
