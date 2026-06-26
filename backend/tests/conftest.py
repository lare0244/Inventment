import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _ensure_user(email, password, name="Test"):
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": name}, timeout=15)
    if r.status_code == 200:
        return r.json()["access_token"]
    # login
    r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r2.status_code == 200, f"login failed: {r2.status_code} {r2.text}"
    return r2.json()["access_token"]


@pytest.fixture(scope="session")
def token_a():
    return _ensure_user("warehouse@test.com", "test123", "Warehouse A")


@pytest.fixture(scope="session")
def token_b():
    # second user for isolation testing
    import uuid
    email = f"TEST_iso_{uuid.uuid4().hex[:8]}@test.com"
    return _ensure_user(email, "test123", "Warehouse B")


@pytest.fixture
def auth_a(token_a):
    return {"Authorization": f"Bearer {token_a}", "Content-Type": "application/json"}


@pytest.fixture
def auth_b(token_b):
    return {"Authorization": f"Bearer {token_b}", "Content-Type": "application/json"}
