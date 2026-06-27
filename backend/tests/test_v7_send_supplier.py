"""V7 — Send-to-supplier (mailto) + frontend-composed translated email regression.

Email is composed client-side now, so backend tests verify:
- PO list/detail responses still carry the fields the FE needs to compose:
  supplier_email, supplier_name, warehouse_id, warehouse_name, items[{name, sku, qty, ...}], status
- PUT /purchase-orders/{id}/sent flips draft → sent (this is what 'Send to supplier' calls after Linking.openURL)
- Supplier without email still produces a usable PO (supplier_email may be empty string or absent)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://warehouse-tracker-103.preview.emergentagent.com").rstrip("/")
EMAIL = "warehouse@test.com"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _make_supplier(h, with_email=True):
    payload = {"name": f"TEST_v7_sup_{uuid.uuid4().hex[:8]}"}
    if with_email:
        payload["email"] = f"sup_{uuid.uuid4().hex[:6]}@test.local"
    r = requests.post(f"{BASE_URL}/api/suppliers", json=payload, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _make_wh(h):
    payload = {
        "name": f"TEST_v7_wh_{uuid.uuid4().hex[:8]}",
        "street1": "Storgatan", "number": "1", "postcode": "11122", "city": "Stockholm", "state": "Stockholm", "county": "SE",
    }
    r = requests.post(f"{BASE_URL}/api/warehouses", json=payload, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _make_product(h, supplier_id, wh_id, qty=0, threshold=5):
    payload = {
        "name": f"TEST_v7_p_{uuid.uuid4().hex[:8]}",
        "sku": f"V7-{uuid.uuid4().hex[:6]}",
        "category_id": None,
        "supplier_id": supplier_id,
        "cost": 10, "price": 20,
        "low_stock_threshold": threshold,
        "stock": {wh_id: qty},
    }
    r = requests.post(f"{BASE_URL}/api/products", json=payload, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _make_po(h, product_ids, supplier_id, wh_id):
    r = requests.post(
        f"{BASE_URL}/api/purchase-orders",
        json={"product_ids": product_ids, "supplier_id": supplier_id, "warehouse_id": wh_id},
        headers=h, timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---- Tests ----

def test_po_response_includes_fields_for_frontend_compose(h):
    sup = _make_supplier(h, with_email=True)
    wh = _make_wh(h)
    prod = _make_product(h, sup["id"], wh["id"], qty=0, threshold=5)
    po = _make_po(h, [prod["id"]], sup["id"], wh["id"])

    # required fields for FE to compose mailto subject/body
    assert po.get("supplier_email") == sup["email"]
    assert po.get("supplier_name") == sup["name"]
    assert po.get("warehouse_id") == wh["id"]
    assert po.get("warehouse_name") == wh["name"]
    assert po.get("status") == "draft"
    assert isinstance(po.get("items"), list) and len(po["items"]) >= 1
    item = po["items"][0]
    for k in ("product_id", "name", "qty"):
        assert k in item, f"missing item field {k}: {item}"


def test_po_response_when_supplier_has_no_email(h):
    sup = _make_supplier(h, with_email=False)
    wh = _make_wh(h)
    prod = _make_product(h, sup["id"], wh["id"], qty=0, threshold=5)
    po = _make_po(h, [prod["id"]], sup["id"], wh["id"])

    # FE expects either missing or empty string — both render the 'no supplier email' hint
    email_val = po.get("supplier_email", "")
    assert email_val in (None, "", )


def test_put_sent_flips_draft_to_sent(h):
    sup = _make_supplier(h, with_email=True)
    wh = _make_wh(h)
    prod = _make_product(h, sup["id"], wh["id"], qty=0, threshold=5)
    po = _make_po(h, [prod["id"]], sup["id"], wh["id"])
    assert po["status"] == "draft"

    r = requests.put(f"{BASE_URL}/api/purchase-orders/{po['id']}/sent", headers=h, timeout=15)
    assert r.status_code == 200, r.text

    # GET to verify persistence
    pos = requests.get(f"{BASE_URL}/api/purchase-orders", headers=h, timeout=15).json()
    found = [p for p in pos if p["id"] == po["id"]]
    assert found and found[0]["status"] == "sent"


def test_put_sent_is_idempotent(h):
    sup = _make_supplier(h, with_email=True)
    wh = _make_wh(h)
    prod = _make_product(h, sup["id"], wh["id"], qty=0, threshold=5)
    po = _make_po(h, [prod["id"]], sup["id"], wh["id"])

    r1 = requests.put(f"{BASE_URL}/api/purchase-orders/{po['id']}/sent", headers=h, timeout=15)
    r2 = requests.put(f"{BASE_URL}/api/purchase-orders/{po['id']}/sent", headers=h, timeout=15)
    assert r1.status_code == 200
    assert r2.status_code in (200, 204)  # second call should not 500


def test_put_items_recomputes_total(h):
    sup = _make_supplier(h, with_email=True)
    wh = _make_wh(h)
    prod = _make_product(h, sup["id"], wh["id"], qty=0, threshold=5)
    po = _make_po(h, [prod["id"]], sup["id"], wh["id"])

    orig_total = po["total"]
    # bump qty by +3
    new_qty = po["items"][0]["qty"] + 3
    r = requests.put(
        f"{BASE_URL}/api/purchase-orders/{po['id']}",
        json={"items": [{"product_id": prod["id"], "qty": new_qty}]},
        headers=h, timeout=15,
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["items"][0]["qty"] == new_qty
    assert updated["total"] != orig_total
    assert abs(updated["total"] - new_qty * prod["cost"]) < 0.01


def test_language_is_client_side_only(h):
    """Language is stored in frontend AsyncStorage, not backend.
    Verify that PUT /settings ignores `language` gracefully (no 500)."""
    r = requests.put(f"{BASE_URL}/api/settings", json={"language": "sv"}, headers=h, timeout=15)
    # backend SettingsUpdate model ignores unknown fields → 200 (or 422 strict). Either way, never 5xx.
    assert r.status_code < 500, r.text
