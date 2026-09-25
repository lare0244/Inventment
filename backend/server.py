from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Query, Request, UploadFile, File
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
from pymongo import ReturnDocument
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import jwt as pyjwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# ---------------- Object Storage (Emergent managed) ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
STORAGE_APP = "inventment"
_storage_key = None


async def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY})
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
    return _storage_key


async def storage_put(path: str, data: bytes, content_type: str):
    global _storage_key
    key = await init_storage()
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        if r.status_code == 503:
            _storage_key = None
            key = await init_storage()
            r = await c.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        r.raise_for_status()
        return r.json()


async def storage_get(path: str):
    global _storage_key
    key = await init_storage()
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        if r.status_code == 503:
            _storage_key = None
            key = await init_storage()
            r = await c.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")

# Social auth config
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
APPLE_AUDIENCES = [a.strip() for a in os.environ.get('APPLE_AUDIENCES', '').split(',') if a.strip()]
APPLE_ISSUER = "https://appleid.apple.com"
_apple_jwks = pyjwt.PyJWKClient("https://appleid.apple.com/auth/keys")

from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
PRO_PRICE_AMOUNT = 6.99       # EUR per month
PRO_PRICE_CURRENCY = "eur"
PRO_PERIOD_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Models ----------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionRequest(BaseModel):
    session_id: str


class AppleAuthRequest(BaseModel):
    identity_token: str
    name: Optional[str] = None
    email: Optional[str] = None


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    currency: str = "SEK"
    plan: str = "free"
    low_stock_alert_email: Optional[str] = None
    company: Optional[dict] = None
    company_code: Optional[str] = None
    company_connected: bool = False
    is_company_master: bool = False
    is_company_owner: bool = False
    so_field1_label: Optional[str] = None
    so_field2_label: Optional[str] = None


class CompanyCreate(BaseModel):
    code: str = Field(min_length=4, max_length=32)


class CompanyJoin(BaseModel):
    code: str


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_master: Optional[bool] = None


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    low_stock_alert_email: Optional[str] = None
    company: Optional[dict] = None
    so_field1_label: Optional[str] = None
    so_field2_label: Optional[str] = None


class Warehouse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    location: Optional[str] = None
    address: Optional[str] = None
    street1: Optional[str] = None
    street2: Optional[str] = None
    number: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    county: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None


class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: Optional[str] = "#FF5722"


class Supplier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    street1: Optional[str] = None
    street2: Optional[str] = None
    number: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    county: Optional[str] = None
    contact_person: Optional[str] = None


class ProductIn(BaseModel):
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    brand: Optional[str] = None
    image: Optional[str] = None
    price: float = 0.0
    cost: float = 0.0
    quantity: int = 0
    low_stock_threshold: int = 5
    category_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_date: Optional[str] = None
    best_before_date: Optional[str] = None
    measure_value: Optional[float] = None
    measure_unit: Optional[str] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    is_production_unit: bool = False
    bom: List[dict] = []


class StockMovementIn(BaseModel):
    product_id: str
    type: str  # 'receive' | 'adjust' | 'remove'
    quantity: int
    warehouse_id: Optional[str] = None
    best_before_date: Optional[str] = None
    note: Optional[str] = None


def product_total(p: dict) -> int:
    stock = p.get("stock") or {}
    if stock:
        return sum(int(v) for v in stock.values())
    return int(p.get("quantity", 0))


def format_address(o: dict) -> str:
    if not o:
        return ""
    parts = []
    line1 = " ".join(x for x in [o.get("street1"), o.get("number")] if x)
    if line1:
        parts.append(line1)
    if o.get("street2"):
        parts.append(o["street2"])
    citypc = " ".join(x for x in [o.get("postcode"), o.get("city")] if x)
    if citypc:
        parts.append(citypc)
    region = ", ".join(x for x in [o.get("state"), o.get("county")] if x)
    if region:
        parts.append(region)
    addr = "\n".join(parts)
    return addr or (o.get("address") or o.get("location") or "")


# ---------------- Auth helpers ----------------
def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": subject, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    cred_exc = HTTPException(status_code=401, detail="Could not validate credentials",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub")
        if not uid:
            raise cred_exc
    except JWTError:
        raise cred_exc
    user = await db.users.find_one({"id": uid})
    if not user:
        raise cred_exc
    cid = user.get("company_id")
    if cid:
        members = await db.users.find({"company_id": cid}).to_list(100)
        user["_scope"] = [m["id"] for m in members] or [user["id"]]
    else:
        user["_scope"] = [user["id"]]
    return user


# ---------------- Auth routes ----------------
@api_router.post("/auth/register", response_model=Token)
async def register(body: UserCreate):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "name": body.name or body.email.split("@")[0],
        "hashed_password": pwd_context.hash(body.password),
        "currency": "SEK",
        "plan": "free",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    # seed a default warehouse
    await db.warehouses.insert_one({**Warehouse(name="Main Warehouse", location="Default").dict(), "owner_id": uid})
    return Token(access_token=create_access_token(uid))


@api_router.post("/auth/login", response_model=Token)
async def login(body: LoginRequest):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("hashed_password") or not pwd_context.verify(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user["id"]))


async def _upsert_social_user(email: Optional[str], name: Optional[str], *, provider: str, match: dict) -> str:
    """Find or create a user for a social login. Returns the app user id."""
    user = await db.users.find_one(match)
    if not user and email:
        user = await db.users.find_one({"email": email})
    if user:
        # Persist provider identifiers / name if we learned them this time.
        patch = {k: v for k, v in match.items() if v and not user.get(k)}
        if name and not user.get("name"):
            patch["name"] = name
        if email and not user.get("email"):
            patch["email"] = email
        if patch:
            await db.users.update_one({"id": user["id"]}, {"$set": patch})
        return user["id"]
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": (email or f"{uid}@{provider}.local").lower(),
        "name": name or (email.split("@")[0] if email else provider.capitalize() + " User"),
        "hashed_password": None,
        "auth_provider": provider,
        "currency": "SEK",
        "plan": "free",
        "created_at": now_iso(),
        **match,
    }
    await db.users.insert_one(doc)
    await db.warehouses.insert_one({**Warehouse(name="Main Warehouse", location="Default").dict(), "owner_id": uid})
    return uid


@api_router.post("/auth/session", response_model=Token)
async def google_session(body: SessionRequest):
    """Emergent-managed Google login: exchange one-time session_id for an app token."""
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    except Exception:
        raise HTTPException(status_code=401, detail="Could not verify session")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email returned from provider")
    uid = await _upsert_social_user(email, data.get("name"), provider="google", match={"email": email})
    return Token(access_token=create_access_token(uid))


@api_router.post("/auth/apple", response_model=Token)
async def apple_auth(body: AppleAuthRequest):
    """Sign in with Apple (iOS): verify identity token against Apple JWKS."""
    if not APPLE_AUDIENCES:
        raise HTTPException(status_code=500, detail="Apple sign-in not configured")
    try:
        signing_key = _apple_jwks.get_signing_key_from_jwt(body.identity_token)
        claims = pyjwt.decode(
            body.identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=APPLE_AUDIENCES,
            issuer=APPLE_ISSUER,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")
    email = (body.email or claims.get("email") or "").lower() or None
    uid = await _upsert_social_user(email, body.name, provider="apple", match={"apple_sub": apple_sub})
    return Token(access_token=create_access_token(uid))


def _public_user(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], name=user.get("name"),
                      currency=user.get("currency", "SEK"),
                      plan=user.get("plan", "free"),
                      low_stock_alert_email=user.get("low_stock_alert_email"),
                      company=user.get("company"),
                      company_code=user.get("company_code"),
                      company_connected=bool(user.get("company_id")),
                      is_company_master=bool(user.get("is_company_master")),
                      is_company_owner=bool(user.get("is_company_owner")),
                      so_field1_label=user.get("so_field1_label") or "Field 1",
                      so_field2_label=user.get("so_field2_label") or "Field 2")


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return _public_user(user)


@api_router.put("/settings", response_model=UserPublic)
async def update_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    updates = {}
    if body.currency is not None:
        if body.currency not in ("SEK", "DKK", "NOK", "EUR", "GBP", "USD", "AUD"):
            raise HTTPException(status_code=400, detail="Unsupported currency")
        updates["currency"] = body.currency
    if body.low_stock_alert_email is not None:
        updates["low_stock_alert_email"] = body.low_stock_alert_email.strip() or None
    if body.company is not None:
        allowed = ("company_name", "street1", "street2", "postcode", "city", "state", "county")
        updates["company"] = {k: (str(body.company.get(k) or "").strip()) for k in allowed}
    if body.so_field1_label is not None:
        updates["so_field1_label"] = (body.so_field1_label or "").strip()[:12] or "Field 1"
    if body.so_field2_label is not None:
        updates["so_field2_label"] = (body.so_field2_label or "").strip()[:12] or "Field 2"
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user = {**user, **updates}
    return _public_user(user)


async def record_snapshot(user_id: str):
    products = await db.products.find({"owner_id": user_id}).to_list(5000)
    value = sum(float(p.get("cost", 0)) * int(p.get("quantity", 0)) for p in products)
    ym = datetime.now(timezone.utc).strftime("%Y-%m")
    await db.stock_snapshots.update_one(
        {"owner_id": user_id, "ym": ym},
        {"$set": {"owner_id": user_id, "ym": ym, "value": round(value, 2), "updated_at": now_iso()}},
        upsert=True,
    )


# ---------------- Generic CRUD helpers ----------------
PRO_LIMITS = {"products": 9999, "categories": 99, "warehouses": 19, "suppliers": 9999}
FREE_LIMITS = {"products": 9, "categories": 9, "warehouses": 2, "suppliers": 9}


def limits_for(user: dict) -> dict:
    return PRO_LIMITS if user.get("plan") == "pro" else FREE_LIMITS


async def enforce_limit(user: dict, kind: str, collection):
    cap = limits_for(user)[kind]
    count = await collection.count_documents({"owner_id": user["id"]})
    if count >= cap:
        plan = user.get("plan", "free")
        raise HTTPException(status_code=403, detail=f"limit_reached:{kind}:{cap}:{plan}")


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("owner_id", None)
    return doc


# Warehouses
@api_router.get("/warehouses")
async def list_warehouses(user: dict = Depends(get_current_user)):
    items = await db.warehouses.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)
    return [clean(i) for i in items]


@api_router.post("/warehouses")
async def create_warehouse(body: Warehouse, user: dict = Depends(get_current_user)):
    await enforce_limit(user, "warehouses", db.warehouses)
    doc = {**body.dict(), "owner_id": user["id"]}
    await db.warehouses.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.put("/warehouses/{wid}")
async def update_warehouse(wid: str, body: Warehouse, user: dict = Depends(get_current_user)):
    upd = body.dict(); upd["id"] = wid
    await db.warehouses.update_one({"id": wid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/warehouses/{wid}")
async def delete_warehouse(wid: str, user: dict = Depends(get_current_user)):
    await db.warehouses.delete_one({"id": wid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# Categories
@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    items = await db.categories.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)
    return [clean(i) for i in items]


@api_router.post("/categories")
async def create_category(body: Category, user: dict = Depends(get_current_user)):
    await enforce_limit(user, "categories", db.categories)
    doc = {**body.dict(), "owner_id": user["id"]}
    await db.categories.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.put("/categories/{cid}")
async def update_category(cid: str, body: Category, user: dict = Depends(get_current_user)):
    upd = body.dict(); upd["id"] = cid
    await db.categories.update_one({"id": cid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/categories/{cid}")
async def delete_category(cid: str, user: dict = Depends(get_current_user)):
    await db.categories.delete_one({"id": cid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# Suppliers
@api_router.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user)):
    items = await db.suppliers.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)
    return [clean(i) for i in items]


@api_router.post("/suppliers")
async def create_supplier(body: Supplier, user: dict = Depends(get_current_user)):
    await enforce_limit(user, "suppliers", db.suppliers)
    doc = {**body.dict(), "owner_id": user["id"]}
    await db.suppliers.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: Supplier, user: dict = Depends(get_current_user)):
    upd = body.dict()
    upd["id"] = sid
    await db.suppliers.update_one({"id": sid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user: dict = Depends(get_current_user)):
    await db.suppliers.delete_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# Products
@api_router.get("/products")
async def list_products(user: dict = Depends(get_current_user),
                        warehouse_id: Optional[str] = None,
                        category_id: Optional[str] = None,
                        search: Optional[str] = None):
    q = {"owner_id": {"$in": user["_scope"]}}
    if warehouse_id:
        q[f"stock.{warehouse_id}"] = {"$exists": True}
    if category_id:
        q["category_id"] = category_id
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    items = await db.products.find(q).sort("name", 1).to_list(2000)
    out = []
    for i in items:
        c = clean(i)
        c["stock"] = c.get("stock") or {}
        if warehouse_id:
            c["quantity"] = int(c["stock"].get(warehouse_id, 0))
        else:
            c["quantity"] = product_total(i)
        out.append(c)
    return out


@api_router.get("/products/by-barcode/{barcode}")
async def product_by_barcode(barcode: str, user: dict = Depends(get_current_user)):
    item = await db.products.find_one({"owner_id": {"$in": user["_scope"]}, "barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    c = clean(item)
    c["stock"] = c.get("stock") or {}
    c["quantity"] = product_total(item)
    return c


@api_router.get("/products/{pid}")
async def get_product(pid: str, user: dict = Depends(get_current_user)):
    item = await db.products.find_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    c = clean(item)
    c["stock"] = c.get("stock") or {}
    c["quantity"] = product_total(item)
    return c


@api_router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(get_current_user)):
    await enforce_limit(user, "products", db.products)
    data = body.dict()
    qty = int(data.get("quantity", 0))
    wid = data.get("warehouse_id")
    stock = {wid: qty} if wid else {}
    doc = {**data, "stock": stock, "quantity": qty if wid else qty,
           "id": str(uuid.uuid4()), "owner_id": user["id"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.products.insert_one(dict(doc))
    await record_snapshot(user["id"])
    c = clean(dict(doc)); c["quantity"] = product_total(doc)
    return c


@api_router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user: dict = Depends(get_current_user)):
    existing = await db.products.find_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    upd = body.dict()
    qty = int(upd.get("quantity", 0))
    wid = upd.get("warehouse_id")
    stock = dict(existing.get("stock") or {})
    if wid:
        stock[wid] = qty
    upd["stock"] = stock
    upd["quantity"] = sum(int(v) for v in stock.values()) if stock else qty
    upd["updated_at"] = now_iso()
    await db.products.update_one({"id": pid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    item = await db.products.find_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
    await record_snapshot(user["id"])
    c = clean(item); c["stock"] = c.get("stock") or {}; c["quantity"] = product_total(item)
    return c


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
    await db.products.delete_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
    await record_snapshot(user["id"])
    return {"ok": True}


# ---------------- Stock movements ----------------
@api_router.post("/movements")
async def create_movement(body: StockMovementIn, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": body.product_id, "owner_id": {"$in": user["_scope"]}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    threshold = int(product.get("low_stock_threshold", 5))
    stock = dict(product.get("stock") or {})
    # resolve target warehouse: explicit -> product's primary -> first existing stock key
    wid = body.warehouse_id or product.get("warehouse_id") or (next(iter(stock), None))
    prev_wh_qty = int(stock.get(wid, 0)) if wid else product_total(product)
    if body.type == "receive":
        new_wh_qty = prev_wh_qty + body.quantity
    elif body.type == "remove":
        new_wh_qty = max(0, prev_wh_qty - body.quantity)
    elif body.type == "adjust":
        new_wh_qty = body.quantity
    else:
        new_wh_qty = prev_wh_qty
    if wid:
        stock[wid] = new_wh_qty
        total = sum(int(v) for v in stock.values())
    else:
        total = new_wh_qty
    update = {"stock": stock, "quantity": total, "updated_at": now_iso()}
    if body.best_before_date:
        update["best_before_date"] = body.best_before_date
    await db.products.update_one({"id": body.product_id, "owner_id": {"$in": user["_scope"]}}, {"$set": update})
    wh = await db.warehouses.find_one({"id": wid, "owner_id": {"$in": user["_scope"]}}) if wid else None
    mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": body.product_id,
          "product_name": product.get("name"), "type": body.type, "quantity": body.quantity,
          "warehouse_id": wid, "warehouse_name": wh.get("name") if wh else None,
          "prev_qty": prev_wh_qty,
          "resulting_qty": new_wh_qty, "resulting_total": total, "note": body.note, "created_at": now_iso()}
    await db.movements.insert_one(dict(mv))
    await record_snapshot(user["id"])
    result = clean(dict(mv))
    result["low_stock"] = new_wh_qty <= threshold
    result["threshold"] = threshold
    return result


@api_router.get("/movements")
async def list_movements(user: dict = Depends(get_current_user), limit: int = 200,
                         warehouse_id: Optional[str] = None, type: Optional[str] = None):
    q = {"owner_id": {"$in": user["_scope"]}}
    if warehouse_id:
        q["$or"] = [{"warehouse_id": warehouse_id}, {"from_warehouse_id": warehouse_id}]
    if type:
        q["type"] = type
    items = await db.movements.find(q).sort("created_at", -1).to_list(limit)
    return [clean(i) for i in items]


class TransferIn(BaseModel):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: int
    note: Optional[str] = None


@api_router.post("/transfers")
async def transfer_stock(body: TransferIn, user: dict = Depends(get_current_user)):
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination must differ")
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    product = await db.products.find_one({"id": body.product_id, "owner_id": {"$in": user["_scope"]}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    wh_ids = {w["id"] for w in await db.warehouses.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}
    if body.from_warehouse_id not in wh_ids or body.to_warehouse_id not in wh_ids:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    stock = dict(product.get("stock") or {})
    from_qty = int(stock.get(body.from_warehouse_id, 0))
    if body.quantity > from_qty:
        raise HTTPException(status_code=400, detail="Not enough stock in source warehouse")
    stock[body.from_warehouse_id] = from_qty - body.quantity
    stock[body.to_warehouse_id] = int(stock.get(body.to_warehouse_id, 0)) + body.quantity
    total = sum(int(v) for v in stock.values())
    await db.products.update_one({"id": body.product_id, "owner_id": {"$in": user["_scope"]}},
                                 {"$set": {"stock": stock, "quantity": total, "updated_at": now_iso()}})
    whs = {w["id"]: w for w in await db.warehouses.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}
    fname = whs.get(body.from_warehouse_id, {}).get("name")
    tname = whs.get(body.to_warehouse_id, {}).get("name")
    mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": body.product_id,
          "product_name": product.get("name"), "type": "transfer", "quantity": body.quantity,
          "warehouse_id": body.to_warehouse_id, "warehouse_name": tname,
          "from_warehouse_id": body.from_warehouse_id, "from_warehouse_name": fname,
          "resulting_qty": stock[body.to_warehouse_id], "from_resulting_qty": stock[body.from_warehouse_id],
          "resulting_total": total,
          "note": body.note, "created_at": now_iso()}
    await db.movements.insert_one(dict(mv))
    await record_snapshot(user["id"])
    return {"ok": True, "stock": stock, "quantity": total}


# ---------------- Barcode lookup (Open Food Facts) ----------------
@api_router.get("/barcode-lookup/{code}")
async def barcode_lookup(code: str, user: dict = Depends(get_current_user)):
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,brands,image_url"
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(url, headers={"User-Agent": "StockMaster/1.0"})
            data = r.json()
        if data.get("status") == 1 or data.get("product"):
            p = data.get("product", {})
            return {"found": True, "name": p.get("product_name") or "",
                    "brand": p.get("brands") or "", "image": p.get("image_url") or ""}
    except Exception as e:
        logger.warning(f"barcode lookup failed: {e}")
    return {"found": False, "name": "", "brand": "", "image": ""}


# ---------------- Dashboard & reports ----------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user), warehouse_id: Optional[str] = None):
    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    await record_snapshot(user["id"])
    warehouses = {w["id"]: w for w in await db.warehouses.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}

    def wh_name(wid):
        w = warehouses.get(wid)
        return w.get("name") if w else None

    total_value = 0.0
    retail_value = 0.0
    total_units = 0
    low_stock = []
    for p in products:
        cost = float(p.get("cost", 0)); price = float(p.get("price", 0))
        threshold = int(p.get("low_stock_threshold", 5))
        stock = p.get("stock") or {}
        if warehouse_id:
            qty = int(stock.get(warehouse_id, 0))
            if warehouse_id not in stock:
                continue
            total_units += qty
            total_value += cost * qty
            retail_value += price * qty
            if qty <= threshold:
                row = clean(dict(p)); row["quantity"] = qty
                row["warehouse_name"] = wh_name(warehouse_id)
                low_stock.append(row)
        else:
            qty_total = product_total(p)
            total_units += qty_total
            total_value += cost * qty_total
            retail_value += price * qty_total
            # per-warehouse low alerts
            if stock:
                for wid, q in stock.items():
                    if int(q) <= threshold:
                        row = clean(dict(p)); row["quantity"] = int(q)
                        row["warehouse_name"] = wh_name(wid)
                        row["id"] = f"{p['id']}:{wid}"
                        low_stock.append(row)
            elif qty_total <= threshold:
                row = clean(dict(p)); row["quantity"] = qty_total
                low_stock.append(row)
    # expiring within 30 days (product-level)
    expiring = []
    soon = datetime.now(timezone.utc) + timedelta(days=30)
    for p in products:
        bb = p.get("best_before_date")
        if bb:
            try:
                d = datetime.fromisoformat(bb.replace("Z", "+00:00"))
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                if d <= soon:
                    row = clean(dict(p)); row["quantity"] = product_total(p)
                    expiring.append(row)
            except Exception:
                pass
    recent = await db.movements.find({"owner_id": {"$in": user["_scope"]}}).sort("created_at", -1).to_list(8)
    return {
        "total_products": len(products) if not warehouse_id else len([p for p in products if warehouse_id in (p.get("stock") or {})]),
        "total_units": total_units,
        "stock_value": round(total_value, 2),
        "retail_value": round(retail_value, 2),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:30],
        "expiring_count": len(expiring),
        "expiring_items": expiring[:20],
        "recent_movements": [clean(m) for m in recent],
    }


@api_router.get("/reports/stock-history")
async def stock_history(user: dict = Depends(get_current_user), warehouse_id: Optional[str] = None,
                        end: Optional[str] = None, metric: Optional[str] = None):
    now = datetime.now(timezone.utc)
    # Anchor month: the chosen `end` date if provided, otherwise today.
    end_cutoff: Optional[str] = None
    if end:
        try:
            ed = datetime.fromisoformat(end[:10])
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid end date, expected YYYY-MM-DD")
        anchor_y, anchor_m = ed.year, ed.month
        end_cutoff = ed.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc).isoformat()
    else:
        anchor_y, anchor_m = now.year, now.month

    seq = []
    for i in range(14, -1, -1):
        mm = anchor_m - i
        yy = anchor_y
        while mm <= 0:
            mm += 12
            yy -= 1
        seq.append(f"{yy:04d}-{mm:02d}")

    # Fast path: total value up to today via monthly snapshots.
    if not warehouse_id and not end and metric != "units" and len(user.get("_scope", [user["id"]])) == 1:
        await record_snapshot(user["id"])
        snaps = {s["ym"]: s["value"] for s in await db.stock_snapshots.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}
        last = 0.0
        result = []
        for ym in seq:
            if ym in snaps:
                last = snaps[ym]
            result.append({"month": ym, "value": last})
        return {"history": result}

    # Reconstruction path (per-warehouse and/or limited to a chosen end date):
    # anchor on current stock and reverse every movement after the cutoff.
    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    movements = await (db.movements.find({"owner_id": {"$in": user["_scope"]}})
                       .sort("created_at", 1).to_list(50000))
    mv_by_prod: dict = {}
    for m in movements:
        mv_by_prod.setdefault(m["product_id"], []).append(m)

    def month_end_iso(ym: str) -> str:
        y, mo = int(ym[:4]), int(ym[5:7])
        nm, ny = (mo + 1, y) if mo < 12 else (1, y + 1)
        last_day = datetime(ny, nm, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
        return last_day.isoformat()

    def value_at(cutoff: str) -> float:
        total = 0.0
        for p in products:
            created = p.get("created_at") or ""
            if created and created > cutoff:
                continue
            stock = p.get("stock") or {}
            qty = int(stock.get(warehouse_id, 0)) if warehouse_id else sum(int(v) for v in stock.values())
            for m in mv_by_prod.get(p["id"], []):
                if (m.get("created_at") or "") <= cutoff:
                    continue
                q = int(m.get("quantity", 0))
                if m.get("type") == "transfer":
                    if warehouse_id:
                        if m.get("from_warehouse_id") == warehouse_id:
                            qty += q
                        elif m.get("warehouse_id") == warehouse_id:
                            qty -= q
                    # transfers do not change the total across all warehouses
                else:
                    if warehouse_id is None or m.get("warehouse_id") == warehouse_id:
                        if m.get("prev_qty") is not None and m.get("resulting_qty") is not None:
                            qty -= (int(m["resulting_qty"]) - int(m["prev_qty"]))
                        elif m.get("type") == "receive":
                            qty -= q
                        elif m.get("type") == "remove":
                            qty += q
            total += (max(0, qty) if metric == "units" else float(p.get("cost", 0)) * max(0, qty))
        return round(total, 2)

    last_idx = len(seq) - 1
    result = []
    for idx, ym in enumerate(seq):
        cutoff = end_cutoff if (end_cutoff and idx == last_idx) else month_end_iso(ym)
        result.append({"month": ym, "value": value_at(cutoff)})
    return {"history": result}


@api_router.get("/reports/stock-at-date")
async def stock_at_date(date: str, user: dict = Depends(get_current_user)):
    """Reconstruct per-product / per-warehouse stock quantities as of the end of `date`
    (YYYY-MM-DD). Anchors on the current (true) stock and reverses every movement that
    happened AFTER the target date. Quantities are valued at current product cost
    (cost history is not tracked)."""
    try:
        d = datetime.fromisoformat(date[:10])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date, expected YYYY-MM-DD")
    end = d.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc).isoformat()

    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    # movements AFTER the target date are the ones we need to undo
    future_mvs = await (db.movements.find({"owner_id": {"$in": user["_scope"]}, "created_at": {"$gt": end}})
                        .sort("created_at", -1).to_list(50000))
    by_prod: dict = {}
    for m in future_mvs:
        by_prod.setdefault(m["product_id"], []).append(m)

    out = []
    total_value = 0.0
    for p in products:
        created = p.get("created_at") or ""
        if created and created > end:
            continue  # product did not exist yet
        hist = {k: int(v) for k, v in (p.get("stock") or {}).items()}
        for m in by_prod.get(p["id"], []):
            qty = int(m.get("quantity", 0))
            if m.get("type") == "transfer":
                fw, tw = m.get("from_warehouse_id"), m.get("warehouse_id")
                if fw is not None:
                    hist[fw] = hist.get(fw, 0) + qty
                if tw is not None:
                    hist[tw] = hist.get(tw, 0) - qty
            else:
                wid = m.get("warehouse_id")
                if wid is None:
                    continue
                if m.get("prev_qty") is not None and m.get("resulting_qty") is not None:
                    delta = int(m["resulting_qty"]) - int(m["prev_qty"])
                elif m.get("type") == "receive":
                    delta = qty
                elif m.get("type") == "remove":
                    delta = -qty
                else:  # legacy adjust without prev_qty -> cannot reverse precisely
                    delta = 0
                hist[wid] = hist.get(wid, 0) - delta
        hist = {k: max(0, v) for k, v in hist.items() if (max(0, v) > 0 or k in (p.get("stock") or {}))}
        c = clean(dict(p))
        c["stock"] = hist
        c["quantity"] = sum(hist.values())
        total_value += float(p.get("cost", 0)) * c["quantity"]
        out.append(c)

    return {"date": date[:10], "products": out, "stock_value": round(total_value, 2)}


@api_router.get("/reports/reorder-suggestions")
async def reorder_suggestions(user: dict = Depends(get_current_user)):
    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    suppliers = {s["id"]: s for s in await db.suppliers.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}
    suggestions = []
    for p in products:
        qty = int(p.get("quantity", 0))
        threshold = int(p.get("low_stock_threshold", 5))
        if qty <= threshold:
            reorder_qty = max(threshold * 2 - qty, threshold)
            sup = suppliers.get(p.get("supplier_id"))
            suggestions.append({
                "product_id": p["id"],
                "name": p.get("name"),
                "current_qty": qty,
                "threshold": threshold,
                "suggested_qty": reorder_qty,
                "cost": float(p.get("cost", 0)),
                "estimated_cost": round(float(p.get("cost", 0)) * reorder_qty, 2),
                "supplier_id": p.get("supplier_id"),
                "supplier_name": sup.get("name") if sup else None,
                "supplier_email": sup.get("email") if sup else None,
            })
    return {"suggestions": suggestions, "total_estimated_cost": round(sum(s["estimated_cost"] for s in suggestions), 2)}


@api_router.get("/reports/ai-insights")
async def ai_insights(user: dict = Depends(get_current_user), lang: Optional[str] = None, currency: Optional[str] = None):
    cur = currency or user.get("currency", "SEK")
    lc = (lang or "en").lower()
    lang_name = {"sv": "Swedish", "en": "English", "da": "Danish", "nl": "Dutch",
                 "fr": "French", "de": "German", "es": "Spanish", "it": "Italian",
                 "pl": "Polish"}.get(lc, "English")
    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    if not products:
        msg = {
            "en": "No products yet. Add and scan products to get AI-powered restocking insights.",
            "sv": "Inga produkter än. Lägg till och skanna produkter för att få AI-drivna påfyllningsförslag.",
            "da": "Ingen produkter endnu. Tilføj og scan produkter for at få AI-drevne genbestillingsforslag.",
            "nl": "Nog geen producten. Voeg producten toe en scan ze voor AI-aanbevelingen voor herbevoorrading.",
            "fr": "Aucun produit pour l'instant. Ajoutez et scannez des produits pour obtenir des recommandations de réapprovisionnement par IA.",
            "de": "Noch keine Produkte. Füge Produkte hinzu und scanne sie, um KI-gestützte Nachbestellvorschläge zu erhalten.",
            "es": "Aún no hay productos. Añade y escanea productos para obtener recomendaciones de reabastecimiento con IA.",
            "it": "Ancora nessun prodotto. Aggiungi e scansiona prodotti per ottenere consigli di riassortimento basati su IA.",
            "pl": "Brak produktów. Dodaj i zeskanuj produkty, aby otrzymać oparte na AI propozycje uzupełnienia zapasów.",
        }
        return {"insight": msg.get(lc, msg["en"])}
    low = [p for p in products if int(p.get("quantity", 0)) <= int(p.get("low_stock_threshold", 5))]
    lines = []
    for p in products[:60]:
        lines.append(f"- {p.get('name')}: qty={p.get('quantity',0)}, threshold={p.get('low_stock_threshold',5)}, "
                     f"cost={p.get('cost',0)}, best_before={p.get('best_before_date') or 'n/a'}")
    prompt = (
        "You are a warehouse inventory analyst. Based on this stock data, give a concise, "
        "actionable purchase-order recommendation. Prioritise items below threshold and items expiring soon. "
        "Keep it under 150 words, use short bullet points, no markdown headers.\n"
        f"IMPORTANT: Write your entire response in {lang_name}. "
        f"Express all monetary amounts in {cur} (use the currency code {cur}).\n\n"
        f"Stock value items below threshold: {len(low)}\n\nInventory:\n" + "\n".join(lines)
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"insights-{user['id']}",
                       system_message=f"You are a precise warehouse inventory analyst. Always respond in {lang_name} and use {cur} for currency.").with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        return {"insight": text.strip()}
    except Exception as e:
        logger.warning(f"AI insight failed: {e}")
        unavailable = {
            "en": "AI insights are temporarily unavailable. Rule-based suggestions are available in the reorder list.",
            "sv": "AI-insikter är tillfälligt otillgängliga. Regelbaserade förslag finns i påfyllningslistan.",
            "da": "AI-indsigter er midlertidigt utilgængelige. Regelbaserede forslag findes i genbestillingslisten.",
            "nl": "AI-inzichten zijn tijdelijk niet beschikbaar. Op regels gebaseerde suggesties staan in de bestellijst.",
            "fr": "Les analyses IA sont temporairement indisponibles. Des suggestions basées sur des règles sont disponibles dans la liste de réapprovisionnement.",
            "de": "KI-Einblicke sind vorübergehend nicht verfügbar. Regelbasierte Vorschläge findest du in der Nachbestellliste.",
            "es": "Los análisis de IA no están disponibles temporalmente. Hay sugerencias basadas en reglas en la lista de reabastecimiento.",
            "it": "Le analisi IA sono temporaneamente non disponibili. Suggerimenti basati su regole sono disponibili nell'elenco di riassortimento.",
            "pl": "Analizy AI są chwilowo niedostępne. Propozycje oparte na regułach są dostępne na liście uzupełnień.",
        }
        return {"insight": unavailable.get(lc, unavailable["en"])}


class POEmailRequest(BaseModel):
    supplier_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    product_ids: List[str]


@api_router.post("/reports/po-email")
async def po_email(body: POEmailRequest, user: dict = Depends(get_current_user)):
    products = await db.products.find({"id": {"$in": body.product_ids}, "owner_id": {"$in": user["_scope"]}}).to_list(1000)
    supplier = None
    if body.supplier_id:
        supplier = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": {"$in": user["_scope"]}})
    warehouse = None
    if body.warehouse_id:
        warehouse = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}})
    lines = []
    for p in products:
        qty = int(p.get("quantity", 0))
        threshold = int(p.get("low_stock_threshold", 5))
        reorder = max(threshold * 2 - qty, threshold)
        lines.append(f"- {p.get('name')} (SKU: {p.get('sku') or p.get('barcode') or 'N/A'}) — Qty: {reorder}")
    sup_name = supplier.get("name") if supplier else "Supplier"
    delivery = ""
    if warehouse:
        addr = warehouse.get("address") or warehouse.get("location") or ""
        delivery = f"\n\nDeliver to:\n{warehouse.get('name')}" + (f"\n{addr}" if addr else "")
    body_text = (
        f"Dear {sup_name},\n\n"
        f"We would like to place the following purchase order:\n\n"
        + "\n".join(lines)
        + delivery
        + f"\n\nPlease confirm availability, pricing, and expected delivery date.\n\n"
        f"Best regards,\n{user.get('name')}"
    )
    return {
        "to": supplier.get("email") if supplier else "",
        "subject": f"Purchase Order from {user.get('name')}",
        "body": body_text,
    }


# ---------------- Purchase Orders (history) ----------------
class POItemIn(BaseModel):
    product_id: str
    qty: int


class POCreate(BaseModel):
    product_ids: Optional[List[str]] = None
    items: Optional[List[POItemIn]] = None
    supplier_id: Optional[str] = None
    warehouse_id: Optional[str] = None


class POUpdate(BaseModel):
    items: List[POItemIn]


class POReceive(BaseModel):
    warehouse_id: Optional[str] = None


def _suggest_qty(p: dict) -> int:
    qty = product_total(p)
    threshold = int(p.get("low_stock_threshold", 5))
    return max(threshold * 2 - qty, threshold)


async def _build_po_doc(user: dict, qty_map: dict, supplier: Optional[dict], warehouse: Optional[dict]):
    products = await db.products.find({"id": {"$in": list(qty_map.keys())}, "owner_id": {"$in": user["_scope"]}}).to_list(1000)
    items, total, lines = [], 0.0, []
    for p in products:
        q = int(qty_map.get(p["id"], 0))
        cost = float(p.get("cost", 0))
        total += cost * q
        items.append({"product_id": p["id"], "name": p.get("name"),
                      "sku": p.get("sku") or p.get("barcode"), "qty": q, "cost": cost})
        lines.append(f"- {p.get('name')} (SKU: {p.get('sku') or p.get('barcode') or 'N/A'}) — Qty: {q}")
    sup_name = supplier.get("name") if supplier else "Supplier"
    delivery = ""
    if warehouse:
        addr = format_address(warehouse)
        delivery = f"\n\nDeliver to:\n{warehouse.get('name')}" + (f"\n{addr}" if addr else "")
    email_body = (f"Dear {sup_name},\n\nWe would like to place the following purchase order:\n\n"
                  + "\n".join(lines) + delivery
                  + f"\n\nPlease confirm availability, pricing, and expected delivery date.\n\nBest regards,\n{user.get('name')}")
    return {"id": str(uuid.uuid4()), "owner_id": user["id"], "status": "draft",
            "supplier_id": supplier.get("id") if supplier else None,
            "supplier_name": supplier.get("name") if supplier else None,
            "supplier_email": supplier.get("email") if supplier else None,
            "warehouse_id": warehouse.get("id") if warehouse else None,
            "warehouse_name": warehouse.get("name") if warehouse else None,
            "items": items, "total": round(total, 2),
            "email_subject": f"Purchase Order from {user.get('name')}",
            "email_body": email_body, "created_at": now_iso(), "sent_at": None}


@api_router.post("/purchase-orders")
async def create_purchase_order(body: POCreate, user: dict = Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": {"$in": user["_scope"]}}) if body.supplier_id else None
    warehouse = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}}) if body.warehouse_id else None
    qty_map = {}
    if body.items:
        qty_map = {it.product_id: it.qty for it in body.items}
    else:
        ids = body.product_ids or []
        prods = await db.products.find({"id": {"$in": ids}, "owner_id": {"$in": user["_scope"]}}).to_list(1000)
        qty_map = {p["id"]: _suggest_qty(p) for p in prods}
    po = await _build_po_doc(user, qty_map, supplier, warehouse)
    await db.purchase_orders.insert_one(dict(po))
    return clean(dict(po))


@api_router.post("/purchase-orders/auto")
async def auto_purchase_orders(user: dict = Depends(get_current_user)):
    products = await db.products.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    low = [p for p in products if product_total(p) <= int(p.get("low_stock_threshold", 5))]
    if not low:
        return {"created": [], "count": 0}
    suppliers = {s["id"]: s for s in await db.suppliers.find({"owner_id": {"$in": user["_scope"]}}).to_list(1000)}
    groups: dict = {}
    for p in low:
        sid = p.get("supplier_id") or "__none__"
        groups.setdefault(sid, {})[p["id"]] = _suggest_qty(p)
    created = []
    for sid, qty_map in groups.items():
        supplier = suppliers.get(sid) if sid != "__none__" else None
        po = await _build_po_doc(user, qty_map, supplier, None)
        await db.purchase_orders.insert_one(dict(po))
        created.append(clean(dict(po)))
    return {"created": created, "count": len(created)}


@api_router.get("/purchase-orders")
async def list_purchase_orders(user: dict = Depends(get_current_user)):
    items = await db.purchase_orders.find({"owner_id": {"$in": user["_scope"]}}).sort("created_at", -1).to_list(200)
    return [clean(i) for i in items]


@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, body: POUpdate, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") in ("delivered", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot edit a " + po["status"] + " order")
    supplier = await db.suppliers.find_one({"id": po.get("supplier_id"), "owner_id": {"$in": user["_scope"]}}) if po.get("supplier_id") else None
    warehouse = await db.warehouses.find_one({"id": po.get("warehouse_id"), "owner_id": {"$in": user["_scope"]}}) if po.get("warehouse_id") else None
    qty_map = {it.product_id: it.qty for it in body.items if it.qty > 0}
    rebuilt = await _build_po_doc(user, qty_map, supplier, warehouse)
    upd = {"items": rebuilt["items"], "total": rebuilt["total"], "email_body": rebuilt["email_body"]}
    await db.purchase_orders.update_one({"id": po_id, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    return clean(po)


@api_router.put("/purchase-orders/{po_id}/sent")
async def mark_po_sent(po_id: str, user: dict = Depends(get_current_user)):
    res = await db.purchase_orders.update_one(
        {"id": po_id, "owner_id": {"$in": user["_scope"]}},
        {"$set": {"status": "sent", "sent_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    return clean(po)


@api_router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return clean(po)


@api_router.put("/purchase-orders/{po_id}/received")
async def receive_purchase_order(po_id: str, body: POReceive, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") in ("delivered", "cancelled"):
        raise HTTPException(status_code=400, detail="Order already " + po["status"])
    wid = body.warehouse_id or po.get("warehouse_id")
    if not wid:
        raise HTTPException(status_code=400, detail="warehouse_required")
    wh = await db.warehouses.find_one({"id": wid, "owner_id": {"$in": user["_scope"]}})
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for it in po.get("items", []):
        product = await db.products.find_one({"id": it["product_id"], "owner_id": {"$in": user["_scope"]}})
        if not product:
            continue
        qty = int(it.get("qty", 0))
        if qty <= 0:
            continue
        stock = dict(product.get("stock") or {})
        prev = int(stock.get(wid, 0))
        stock[wid] = prev + qty
        total = sum(int(v) for v in stock.values())
        await db.products.update_one({"id": product["id"], "owner_id": {"$in": user["_scope"]}},
                                     {"$set": {"stock": stock, "quantity": total, "updated_at": now_iso()}})
        mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": product["id"],
              "product_name": product.get("name"), "type": "receive", "quantity": qty,
              "warehouse_id": wid, "warehouse_name": wh.get("name"), "prev_qty": prev,
              "resulting_qty": stock[wid], "resulting_total": total,
              "note": f"PO {po.get('id', '')[:8]} delivered", "created_at": now_iso()}
        await db.movements.insert_one(dict(mv))
    await db.purchase_orders.update_one(
        {"id": po_id, "owner_id": {"$in": user["_scope"]}},
        {"$set": {"status": "delivered", "delivered_at": now_iso(), "warehouse_id": wid, "warehouse_name": wh.get("name")}})
    await record_snapshot(user["id"])
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    return clean(po)


@api_router.put("/purchase-orders/{po_id}/cancelled")
async def cancel_purchase_order(po_id: str, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Cannot cancel a delivered order")
    await db.purchase_orders.update_one(
        {"id": po_id, "owner_id": {"$in": user["_scope"]}},
        {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    return clean(po)


@api_router.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, user: dict = Depends(get_current_user)):
    await db.purchase_orders.delete_one({"id": po_id, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# ---------------- Billing (Stripe PRO) ----------------
class CheckoutRequest(BaseModel):
    origin_url: str


def _pro_active(user: dict) -> bool:
    if user.get("plan") != "pro":
        return False
    exp = user.get("plan_expires_at")
    if not exp:
        return True
    try:
        d = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d > datetime.now(timezone.utc)
    except Exception:
        return True


@api_router.get("/billing/plan")
async def billing_plan(user: dict = Depends(get_current_user)):
    plan = "pro" if _pro_active(user) else "free"
    lim = PRO_LIMITS if plan == "pro" else FREE_LIMITS
    usage = {
        "products": await db.products.count_documents({"owner_id": user["id"]}),
        "categories": await db.categories.count_documents({"owner_id": user["id"]}),
        "warehouses": await db.warehouses.count_documents({"owner_id": user["id"]}),
        "suppliers": await db.suppliers.count_documents({"owner_id": user["id"]}),
    }
    return {"plan": plan, "limits": lim, "pro_limits": PRO_LIMITS, "usage": usage,
            "plan_expires_at": user.get("plan_expires_at"),
            "price": {"amount": PRO_PRICE_AMOUNT, "currency": PRO_PRICE_CURRENCY.upper(), "interval": "month"}}


@api_router.post("/billing/checkout")
async def billing_checkout(body: CheckoutRequest, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    origin = body.origin_url.rstrip("/")
    sc = StripeCheckout(api_key=STRIPE_API_KEY)
    req = CheckoutSessionRequest(
        amount=PRO_PRICE_AMOUNT,
        currency=PRO_PRICE_CURRENCY,
        success_url=f"{origin}/billing-return?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/billing-return?canceled=1",
        metadata={"user_id": user["id"], "plan": "pro", "type": "pro_monthly"},
    )
    try:
        session = await sc.create_checkout_session(req)
    except Exception as e:
        logger.warning(f"Stripe checkout failed: {e}")
        raise HTTPException(status_code=500, detail="Could not create checkout session")
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()), "session_id": session.session_id, "user_id": user["id"],
        "amount": PRO_PRICE_AMOUNT, "currency": PRO_PRICE_CURRENCY,
        "plan": "pro", "payment_status": "initiated", "status": "open", "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    sc = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        st = await sc.get_checkout_status(session_id)
    except Exception as e:
        logger.warning(f"Stripe status failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid session")
    paid = st.payment_status == "paid"
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]})
    if paid and (not tx or tx.get("payment_status") != "paid"):
        expires = (datetime.now(timezone.utc) + timedelta(days=PRO_PERIOD_DAYS)).isoformat()
        await db.users.update_one({"id": user["id"]}, {"$set": {"plan": "pro", "plan_expires_at": expires}})
        await db.payment_transactions.update_one(
            {"session_id": session_id, "user_id": user["id"]},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now_iso()}})
    fresh = await db.users.find_one({"id": user["id"]})
    plan = "pro" if _pro_active(fresh) else "free"
    return {"payment_status": st.payment_status, "status": st.status, "plan": plan}


# ---------------- Company sharing (PRO) ----------------
MAX_COMPANY_MEMBERS = 50
MAX_ASSIGNED_MASTERS = 2  # in addition to the owner


def _norm_code(code: str) -> str:
    return re.sub(r"\s+", "", (code or "")).upper()


async def _company_members(cid: str):
    return await db.users.find({"company_id": cid}).to_list(MAX_COMPANY_MEMBERS + 10)


def _member_public(u: dict, owner_id: str) -> dict:
    return {"id": u["id"], "name": u.get("name") or u.get("email"), "email": u["email"],
            "is_master": bool(u.get("is_company_master")), "is_owner": u["id"] == owner_id}


@api_router.get("/company")
async def get_company(user: dict = Depends(get_current_user)):
    cid = user.get("company_id")
    if not cid:
        return {"connected": False, "is_pro": _pro_active(user)}
    comp = await db.companies.find_one({"id": cid})
    owner_id = comp.get("owner_user_id") if comp else None
    members = await _company_members(cid)
    is_master = bool(user.get("is_company_master"))
    out = {"connected": True, "code": user.get("company_code") or (comp or {}).get("code"),
           "is_owner": user["id"] == owner_id, "is_master": is_master,
           "member_count": len(members), "max_members": MAX_COMPANY_MEMBERS, "members": []}
    if is_master:
        ms = [_member_public(m, owner_id) for m in members]
        ms.sort(key=lambda x: (x["name"] or "").lower())
        out["members"] = ms
    return out


@api_router.post("/company/create")
async def create_company(body: CompanyCreate, user: dict = Depends(get_current_user)):
    if not _pro_active(user):
        raise HTTPException(status_code=403, detail="pro_required")
    if user.get("company_id"):
        raise HTTPException(status_code=400, detail="already_in_company")
    code = _norm_code(body.code)
    if len(code) < 4:
        raise HTTPException(status_code=400, detail="code_too_short")
    if await db.companies.find_one({"code": code}):
        raise HTTPException(status_code=409, detail="code_taken")
    cid = str(uuid.uuid4())
    await db.companies.insert_one({"id": cid, "code": code, "owner_user_id": user["id"], "created_at": now_iso()})
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "company_id": cid, "company_code": code, "is_company_master": True, "is_company_owner": True}})
    return {"ok": True, "code": code}


@api_router.post("/company/join")
async def join_company(body: CompanyJoin, user: dict = Depends(get_current_user)):
    if not _pro_active(user):
        raise HTTPException(status_code=403, detail="pro_required")
    if user.get("company_id"):
        raise HTTPException(status_code=400, detail="already_in_company")
    code = _norm_code(body.code)
    comp = await db.companies.find_one({"code": code})
    if not comp:
        raise HTTPException(status_code=404, detail="company_not_found")
    members = await _company_members(comp["id"])
    if len(members) >= MAX_COMPANY_MEMBERS:
        raise HTTPException(status_code=403, detail="company_full")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "company_id": comp["id"], "company_code": code, "is_company_master": False, "is_company_owner": False}})
    return {"ok": True, "code": code}


@api_router.post("/company/leave")
async def leave_company(user: dict = Depends(get_current_user)):
    cid = user.get("company_id")
    if not cid:
        return {"ok": True}
    comp = await db.companies.find_one({"id": cid})
    if comp and comp.get("owner_user_id") == user["id"]:
        await db.users.update_many({"company_id": cid}, {"$set": {
            "company_id": None, "company_code": None, "is_company_master": False, "is_company_owner": False}})
        await db.companies.delete_one({"id": cid})
        return {"ok": True, "dissolved": True}
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "company_id": None, "company_code": None, "is_company_master": False, "is_company_owner": False}})
    return {"ok": True}


@api_router.put("/company/members/{uid}")
async def update_member(uid: str, body: MemberUpdate, user: dict = Depends(get_current_user)):
    cid = user.get("company_id")
    if not cid or not user.get("is_company_master"):
        raise HTTPException(status_code=403, detail="master_required")
    comp = await db.companies.find_one({"id": cid})
    owner_id = comp.get("owner_user_id") if comp else None
    target = await db.users.find_one({"id": uid, "company_id": cid})
    if not target:
        raise HTTPException(status_code=404, detail="member_not_found")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip() or target.get("name")
    if body.email is not None:
        new_email = str(body.email).lower()
        if new_email != target["email"]:
            if await db.users.find_one({"email": new_email}):
                raise HTTPException(status_code=409, detail="email_taken")
            updates["email"] = new_email
    if body.is_master is not None:
        if uid == owner_id:
            raise HTTPException(status_code=400, detail="owner_is_always_master")
        if body.is_master and not target.get("is_company_master"):
            assigned = [m for m in await _company_members(cid)
                        if m.get("is_company_master") and m["id"] != owner_id]
            if len(assigned) >= MAX_ASSIGNED_MASTERS:
                raise HTTPException(status_code=403, detail="master_limit")
        updates["is_company_master"] = bool(body.is_master)
    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})
    return {"ok": True}


@api_router.delete("/company/members/{uid}")
async def remove_member(uid: str, user: dict = Depends(get_current_user)):
    cid = user.get("company_id")
    if not cid or not user.get("is_company_master"):
        raise HTTPException(status_code=403, detail="master_required")
    comp = await db.companies.find_one({"id": cid})
    if comp and comp.get("owner_user_id") == uid:
        raise HTTPException(status_code=400, detail="cannot_remove_owner")
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="use_leave_instead")
    await db.users.update_one({"id": uid, "company_id": cid}, {"$set": {
        "company_id": None, "company_code": None, "is_company_master": False, "is_company_owner": False}})
    return {"ok": True}


@api_router.delete("/account")
async def delete_account(user: dict = Depends(get_current_user)):
    uid = user["id"]
    cid = user.get("company_id")
    # If part of a company: owner dissolves it, member just detaches (handled by user deletion)
    if cid:
        comp = await db.companies.find_one({"id": cid})
        if comp and comp.get("owner_user_id") == uid:
            await db.users.update_many({"company_id": cid}, {"$set": {
                "company_id": None, "company_code": None, "is_company_master": False, "is_company_owner": False}})
            await db.companies.delete_one({"id": cid})
    # Delete all data owned by this user
    for coll in ("warehouses", "categories", "suppliers", "products", "movements",
                 "purchase_orders", "sales_orders", "stocktakes", "production_orders", "stock_snapshots"):
        await db[coll].delete_many({"owner_id": uid})
    await db.so_counters.delete_many({"key": uid})
    # Finally delete the user account itself
    await db.users.delete_one({"id": uid})
    return {"ok": True, "deleted": True}



@api_router.post("/billing/activate-test")
async def activate_test_pro(user: dict = Depends(get_current_user)):
    expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"plan": "pro", "plan_expires_at": expires}})
    return {"ok": True, "plan": "pro"}


# ---------------- RevenueCat native IAP ----------------
REVENUECAT_SECRET_KEY = os.environ.get("REVENUECAT_SECRET_KEY", "")
REVENUECAT_WEBHOOK_SECRET = os.environ.get("REVENUECAT_WEBHOOK_SECRET", "")
RC_ENTITLEMENT = os.environ.get("RC_ENTITLEMENT", "pro")
RC_BASE = "https://api.revenuecat.com/v1"


async def _rc_fetch_subscriber(app_user_id: str) -> Optional[dict]:
    if not REVENUECAT_SECRET_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.get(f"{RC_BASE}/subscribers/{app_user_id}",
                               headers={"Authorization": f"Bearer {REVENUECAT_SECRET_KEY}"})
    except Exception as e:
        logger.warning(f"RevenueCat fetch failed: {e}")
        return None
    if r.status_code != 200:
        return None
    return r.json().get("subscriber")


def _rc_entitlement_patch(subscriber: dict) -> dict:
    ent = (subscriber.get("entitlements") or {}).get(RC_ENTITLEMENT)
    if not ent:
        return {"plan": "free", "plan_expires_at": None, "billing_provider": "revenuecat"}
    expires = ent.get("expires_date")
    active = True
    if expires:
        try:
            d = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            active = d > datetime.now(timezone.utc)
        except Exception:
            active = True
    return {"plan": "pro" if active else "free", "plan_expires_at": expires, "billing_provider": "revenuecat"}


async def _rc_sync_user(user_id: str) -> dict:
    sub = await _rc_fetch_subscriber(user_id)
    if sub is None:
        u = await db.users.find_one({"id": user_id})
        return {"plan": "pro" if _pro_active(u or {}) else "free"}
    patch = _rc_entitlement_patch(sub)
    patch["billing_synced_at"] = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": patch})
    return {"plan": patch["plan"], "plan_expires_at": patch.get("plan_expires_at")}


@api_router.post("/billing/revenuecat/sync")
async def revenuecat_sync(user: dict = Depends(get_current_user)):
    """Called by the app right after a successful purchase to verify server-side."""
    return await _rc_sync_user(user["id"])


@api_router.post("/billing/revenuecat/webhook")
async def revenuecat_webhook(request: Request):
    """RevenueCat -> our backend. Authorized via the shared Authorization header
    configured in the RevenueCat dashboard. Idempotent on event id."""
    auth = request.headers.get("Authorization", "")
    if REVENUECAT_WEBHOOK_SECRET and auth != f"Bearer {REVENUECAT_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="invalid signature")
    payload = await request.json()
    event = payload.get("event") or {}
    event_id = event.get("id")
    app_user_id = event.get("app_user_id")
    if event_id:
        res = await db.billing_events.update_one(
            {"event_id": event_id},
            {"$setOnInsert": {"event_id": event_id, "received_at": now_iso()}}, upsert=True)
        if res.upserted_id is None:
            return {"ok": True, "duplicate": True}
    if app_user_id:
        await _rc_sync_user(app_user_id)
    return {"ok": True}


# ---------------- Sales Orders ----------------
SO_STATUSES = ["saved", "picked", "shipped", "returned"]
SO_ALLOWED = {"saved": {"picked", "shipped"}, "picked": {"shipped"}, "shipped": {"returned"}, "returned": set()}


class SOItem(BaseModel):
    product_id: str
    name: Optional[str] = None
    quantity: int = 1
    picked: int = 0


class SalesOrderIn(BaseModel):
    field1: Optional[str] = ""
    field2: Optional[str] = ""
    comment: Optional[str] = ""
    shipping_ref: Optional[str] = ""
    order_date: Optional[str] = None
    warehouse_id: Optional[str] = None
    items: List[SOItem] = []


class SOStatusUpdate(BaseModel):
    status: str
    warehouse_id: Optional[str] = None


def _so_counter_key(user: dict) -> str:
    return user.get("company_id") or user["id"]


async def _gen_order_number(user: dict) -> str:
    now = datetime.now(timezone.utc)
    period = now.strftime("%y%m")  # e.g. 2601
    doc = await db.so_counters.find_one_and_update(
        {"key": _so_counter_key(user), "period": period},
        {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    n = int(doc["seq"])  # starts at 1
    letter = chr(ord("A") + ((n - 1) // 1_000_000) % 26)
    digits = ((n - 1) % 1_000_000) + 1
    return f"{period}{letter}{digits:06d}"


async def _apply_so_stock(user: dict, items: list, warehouse_id: Optional[str], sign: int, note: str):
    for it in items:
        pid = it.get("product_id")
        qty = int(it.get("quantity", 0) or 0)
        if not pid or qty <= 0:
            continue
        product = await db.products.find_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
        if not product:
            continue
        stock = dict(product.get("stock") or {})
        wid = warehouse_id or product.get("warehouse_id") or next(iter(stock), None)
        prev = int(stock.get(wid, 0)) if wid else product_total(product)
        new = max(0, prev + sign * qty)
        if wid:
            stock[wid] = new
            total = sum(int(v) for v in stock.values())
        else:
            total = new
        await db.products.update_one({"id": pid, "owner_id": {"$in": user["_scope"]}},
                                     {"$set": {"stock": stock, "quantity": total, "updated_at": now_iso()}})
        wh = await db.warehouses.find_one({"id": wid, "owner_id": {"$in": user["_scope"]}}) if wid else None
        mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": pid,
              "product_name": product.get("name"), "type": "remove" if sign < 0 else "receive",
              "quantity": qty, "warehouse_id": wid, "warehouse_name": wh.get("name") if wh else None,
              "prev_qty": prev, "resulting_qty": new, "resulting_total": total,
              "note": note, "created_at": now_iso()}
        await db.movements.insert_one(dict(mv))
    await record_snapshot(user["id"])


@api_router.post("/sales-orders")
async def create_sales_order(body: SalesOrderIn, user: dict = Depends(get_current_user)):
    if not body.warehouse_id or not await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}}):
        raise HTTPException(status_code=400, detail="warehouse_required")
    num = await _gen_order_number(user)
    order_date = body.order_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = {"id": str(uuid.uuid4()), "owner_id": user["id"], "order_number": num,
           "field1": (body.field1 or "").strip(), "field2": (body.field2 or "").strip(),
           "comment": (body.comment or "").strip(), "shipping_ref": (body.shipping_ref or "").strip(),
           "order_date": order_date, "warehouse_id": body.warehouse_id,
           "items": [it.dict() for it in body.items], "status": "saved",
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.sales_orders.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.get("/sales-orders/chart")
async def sales_orders_chart(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    months = []
    for i in range(14, -1, -1):
        mm = now.month - i
        yy = now.year
        while mm <= 0:
            mm += 12
            yy -= 1
        months.append(f"{yy:04d}-{mm:02d}")
    orders = await db.sales_orders.find({"owner_id": {"$in": user["_scope"]}}).to_list(5000)
    series = {s: {ym: 0 for ym in months} for s in SO_STATUSES}
    for o in orders:
        ym = (o.get("order_date") or "")[:7]
        st = o.get("status", "saved")
        if st in series and ym in series[st]:
            series[st][ym] += 1
    return {"months": months, "series": {s: [series[s][ym] for ym in months] for s in SO_STATUSES}}


@api_router.get("/sales-orders")
async def list_sales_orders(user: dict = Depends(get_current_user), status_filter: Optional[str] = Query(None, alias="status"),
                            q: Optional[str] = None, sort: str = "date"):
    query = {"owner_id": {"$in": user["_scope"]}}
    if status_filter:
        query["status"] = status_filter
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"order_number": rx}, {"field1": rx}, {"field2": rx},
                        {"comment": rx}, {"shipping_ref": rx}, {"order_date": rx}]
    items = await db.sales_orders.find(query).to_list(2000)
    if sort == "order_number":
        items.sort(key=lambda o: o.get("order_number", ""))
    elif sort in ("field1", "field2"):
        items.sort(key=lambda o: (str(o.get(sort, "")).lower(), o.get("order_date", ""), o.get("order_number", "")))
    else:
        items.sort(key=lambda o: (o.get("order_date", ""), o.get("order_number", "")), reverse=True)
    return [clean(i) for i in items]


@api_router.get("/sales-orders/{oid}")
async def get_sales_order(oid: str, user: dict = Depends(get_current_user)):
    o = await db.sales_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(o)


@api_router.put("/sales-orders/{oid}")
async def update_sales_order(oid: str, body: SalesOrderIn, user: dict = Depends(get_current_user)):
    o = await db.sales_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    if o.get("status") in ("shipped", "returned"):
        raise HTTPException(status_code=400, detail="locked_after_shipped")
    upd = {"field1": (body.field1 or "").strip(), "field2": (body.field2 or "").strip(),
           "comment": (body.comment or "").strip(), "shipping_ref": (body.shipping_ref or "").strip(),
           "order_date": body.order_date or o.get("order_date"),
           "warehouse_id": body.warehouse_id if body.warehouse_id is not None else o.get("warehouse_id"),
           "items": [it.dict() for it in body.items], "updated_at": now_iso()}
    await db.sales_orders.update_one({"id": oid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**o, **upd})


@api_router.post("/sales-orders/{oid}/status")
async def set_sales_order_status(oid: str, body: SOStatusUpdate, user: dict = Depends(get_current_user)):
    o = await db.sales_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    new = body.status
    if new not in SO_STATUSES:
        raise HTTPException(status_code=400, detail="bad_status")
    cur = o.get("status", "saved")
    if new not in SO_ALLOWED.get(cur, set()):
        raise HTTPException(status_code=400, detail="invalid_transition")
    items = o.get("items") or []
    wid = o.get("warehouse_id")
    extra = {}
    if new == "shipped":
        await _apply_so_stock(user, items, wid, -1, f"Sales order {o.get('order_number')} shipped")
    elif new == "returned":
        ret_wid = body.warehouse_id or wid
        if ret_wid and not await db.warehouses.find_one({"id": ret_wid, "owner_id": {"$in": user["_scope"]}}):
            ret_wid = wid
        extra["return_warehouse_id"] = ret_wid
        await _apply_so_stock(user, items, ret_wid, +1, f"Sales order {o.get('order_number')} returned")
    await db.sales_orders.update_one({"id": oid, "owner_id": {"$in": user["_scope"]}},
                                     {"$set": {"status": new, "updated_at": now_iso(), **extra}})
    return clean({**o, "status": new, **extra})


@api_router.delete("/sales-orders/{oid}")
async def delete_sales_order(oid: str, user: dict = Depends(get_current_user)):
    await db.sales_orders.delete_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# ---------------- Stocktakes (Inventering) ----------------
class StockTakeCreate(BaseModel):
    warehouse_id: str
    date: Optional[str] = None


class StockTakeItemUpdate(BaseModel):
    product_id: str
    counted_qty: Optional[int] = None
    needs_recount: Optional[bool] = None


class StockTakeUpdate(BaseModel):
    date: Optional[str] = None
    items: List[StockTakeItemUpdate] = []
    mark_done: bool = True


async def _gen_stocktake_number(user: dict) -> str:
    now = datetime.now(timezone.utc)
    period = now.strftime("%y%m")
    doc = await db.st_counters.find_one_and_update(
        {"key": _so_counter_key(user), "period": period},
        {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    n = int(doc["seq"])
    return f"INV{period}{n:04d}"


@api_router.post("/stocktakes")
async def create_stocktake(body: StockTakeCreate, user: dict = Depends(get_current_user)):
    wh = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}})
    if not wh:
        raise HTTPException(status_code=400, detail="warehouse_required")
    wid = body.warehouse_id
    products = await db.products.find({
        "owner_id": {"$in": user["_scope"]},
        "$or": [{f"stock.{wid}": {"$exists": True}}, {"warehouse_id": wid}],
    }).sort("name", 1).to_list(5000)
    items = []
    for p in products:
        stock = p.get("stock") or {}
        sys_qty = int(stock.get(wid, 0)) if stock else int(p.get("quantity", 0))
        items.append({
            "product_id": p["id"], "name": p.get("name"),
            "sku": p.get("sku") or "", "barcode": p.get("barcode") or "",
            "image": p.get("image") or "",
            "location": p.get("location") or "",
            "system_qty": sys_qty, "counted_qty": sys_qty, "counted_done": False, "needs_recount": False,
            "assigned_to": None, "assigned_name": None,
        })
    num = await _gen_stocktake_number(user)
    date = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = {"id": str(uuid.uuid4()), "owner_id": user["id"], "number": num,
           "warehouse_id": wid, "warehouse_name": wh.get("name"),
           "date": date, "status": "open", "items": items,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.stocktakes.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.get("/stocktakes")
async def list_stocktakes(user: dict = Depends(get_current_user)):
    items = await db.stocktakes.find({"owner_id": {"$in": user["_scope"]}}).to_list(2000)
    items.sort(key=lambda s: (s.get("date", ""), s.get("created_at", "")), reverse=True)
    return [clean(i) for i in items]


@api_router.get("/stocktakes/{sid}")
async def get_stocktake(sid: str, user: dict = Depends(get_current_user)):
    s = await db.stocktakes.find_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(s)


@api_router.put("/stocktakes/{sid}")
async def update_stocktake(sid: str, body: StockTakeUpdate, user: dict = Depends(get_current_user)):
    s = await db.stocktakes.find_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    if s.get("status") == "completed":
        raise HTTPException(status_code=400, detail="stocktake_completed")
    counts = {i.product_id: i for i in body.items}
    items = []
    for it in (s.get("items") or []):
        it = dict(it)
        upd = counts.get(it["product_id"])
        if upd:
            if upd.counted_qty is not None:
                it["counted_qty"] = max(0, int(upd.counted_qty))
                if body.mark_done:
                    it["counted_done"] = True
            if upd.needs_recount is not None:
                it["needs_recount"] = bool(upd.needs_recount)
        items.append(it)
    upd = {"items": items, "updated_at": now_iso()}
    if body.date:
        upd["date"] = body.date
    await db.stocktakes.update_one({"id": sid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**s, **upd})


@api_router.post("/stocktakes/{sid}/complete")
async def complete_stocktake(sid: str, user: dict = Depends(get_current_user)):
    s = await db.stocktakes.find_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    if s.get("status") == "completed":
        raise HTTPException(status_code=400, detail="stocktake_completed")
    wid = s.get("warehouse_id")
    wh = await db.warehouses.find_one({"id": wid, "owner_id": {"$in": user["_scope"]}})
    wh_name = wh.get("name") if wh else None
    adjusted = 0
    for it in (s.get("items") or []):
        pid = it.get("product_id")
        counted = int(it.get("counted_qty", 0))
        product = await db.products.find_one({"id": pid, "owner_id": {"$in": user["_scope"]}})
        if not product:
            continue
        stock = dict(product.get("stock") or {})
        prev = int(stock.get(wid, 0)) if wid else product_total(product)
        if prev == counted:
            continue
        if wid:
            stock[wid] = counted
            total = sum(int(v) for v in stock.values())
        else:
            total = counted
        await db.products.update_one({"id": pid, "owner_id": {"$in": user["_scope"]}},
                                     {"$set": {"stock": stock, "quantity": total, "updated_at": now_iso()}})
        mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": pid,
              "product_name": product.get("name"), "type": "adjust", "quantity": counted,
              "warehouse_id": wid, "warehouse_name": wh_name,
              "prev_qty": prev, "resulting_qty": counted, "resulting_total": total,
              "note": f"Stocktake {s.get('number')}", "created_at": now_iso()}
        await db.movements.insert_one(dict(mv))
        adjusted += 1
    await db.stocktakes.update_one({"id": sid, "owner_id": {"$in": user["_scope"]}},
                                   {"$set": {"status": "completed", "completed_at": now_iso(), "updated_at": now_iso()}})
    await record_snapshot(user["id"])
    s = await db.stocktakes.find_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True, "adjusted": adjusted, "stocktake": clean(s)}


@api_router.delete("/stocktakes/{sid}")
async def delete_stocktake(sid: str, user: dict = Depends(get_current_user)):
    await db.stocktakes.delete_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


class StockTakeAssign(BaseModel):
    product_id: str
    assigned_to: Optional[str] = None  # user id, or null/"" to unassign


@api_router.post("/stocktakes/{sid}/assign")
async def assign_stocktake_item(sid: str, body: StockTakeAssign, user: dict = Depends(get_current_user)):
    if not user.get("is_company_master"):
        raise HTTPException(status_code=403, detail="master_required")
    s = await db.stocktakes.find_one({"id": sid, "owner_id": {"$in": user["_scope"]}})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    assigned_name = None
    if body.assigned_to:
        member = await db.users.find_one({"id": body.assigned_to, "company_id": user.get("company_id")})
        if not member:
            raise HTTPException(status_code=400, detail="member_not_found")
        assigned_name = member.get("name") or member.get("email")
    items = []
    for it in (s.get("items") or []):
        it = dict(it)
        if it["product_id"] == body.product_id:
            it["assigned_to"] = body.assigned_to or None
            it["assigned_name"] = assigned_name
        items.append(it)
    await db.stocktakes.update_one({"id": sid, "owner_id": {"$in": user["_scope"]}},
                                   {"$set": {"items": items, "updated_at": now_iso()}})
    return clean({**s, "items": items})


# ---------------- Production Orders ----------------
class ProdItemIn(BaseModel):
    product_id: str
    quantity: int = 1
    batch_number: Optional[str] = None
    best_before_date: Optional[str] = None


class ProdOrderCreate(BaseModel):
    warehouse_id: str
    items: List[ProdItemIn] = []


class ProdOrderUpdate(BaseModel):
    warehouse_id: Optional[str] = None
    items: Optional[List[ProdItemIn]] = None


async def _gen_production_number(user: dict) -> str:
    period = datetime.now(timezone.utc).strftime("%y%m")
    doc = await db.production_order_counters.find_one_and_update(
        {"key": _so_counter_key(user), "period": period},
        {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"PRD{period}{int(doc['seq']):04d}"


async def _build_prod_items(user: dict, items: List[ProdItemIn]) -> List[dict]:
    out = []
    for it in items:
        p = await db.products.find_one({"id": it.product_id, "owner_id": {"$in": user["_scope"]}})
        if not p:
            continue
        out.append({
            "product_id": it.product_id, "name": p.get("name"),
            "quantity": max(1, int(it.quantity)),
            "batch_number": it.batch_number or "",
            "best_before_date": it.best_before_date or "",
        })
    return out


@api_router.post("/production-orders")
async def create_production_order(body: ProdOrderCreate, user: dict = Depends(get_current_user)):
    wh = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}})
    if not wh:
        raise HTTPException(status_code=400, detail="warehouse_required")
    items = await _build_prod_items(user, body.items)
    num = await _gen_production_number(user)
    doc = {"id": str(uuid.uuid4()), "owner_id": user["id"], "number": num,
           "warehouse_id": body.warehouse_id, "warehouse_name": wh.get("name"),
           "status": "draft", "items": items,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.production_orders.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.get("/production-orders")
async def list_production_orders(user: dict = Depends(get_current_user)):
    items = await db.production_orders.find({"owner_id": {"$in": user["_scope"]}}).sort("created_at", -1).to_list(2000)
    return [clean(i) for i in items]


@api_router.get("/production-orders/{oid}")
async def get_production_order(oid: str, user: dict = Depends(get_current_user)):
    o = await db.production_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(o)


@api_router.put("/production-orders/{oid}")
async def update_production_order(oid: str, body: ProdOrderUpdate, user: dict = Depends(get_current_user)):
    o = await db.production_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    if o.get("status") != "draft":
        raise HTTPException(status_code=400, detail="not_draft")
    upd = {"updated_at": now_iso()}
    if body.warehouse_id:
        wh = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": {"$in": user["_scope"]}})
        if not wh:
            raise HTTPException(status_code=400, detail="warehouse_required")
        upd["warehouse_id"] = body.warehouse_id
        upd["warehouse_name"] = wh.get("name")
    if body.items is not None:
        upd["items"] = await _build_prod_items(user, body.items)
    await db.production_orders.update_one({"id": oid, "owner_id": {"$in": user["_scope"]}}, {"$set": upd})
    return clean({**o, **upd})


async def _mutate_stock(user: dict, product: dict, wid: str, delta: int, mtype: str, note: str, best_before: str = None):
    stock = dict(product.get("stock") or {})
    prev = int(stock.get(wid, 0))
    newv = prev + delta
    stock[wid] = newv
    total = sum(int(v) for v in stock.values())
    setv = {"stock": stock, "quantity": total, "updated_at": now_iso()}
    if best_before:
        setv["best_before_date"] = best_before
    await db.products.update_one({"id": product["id"], "owner_id": {"$in": user["_scope"]}}, {"$set": setv})
    mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": product["id"],
          "product_name": product.get("name"), "type": mtype, "quantity": abs(delta),
          "warehouse_id": wid, "warehouse_name": None,
          "prev_qty": prev, "resulting_qty": newv, "resulting_total": total,
          "note": note, "created_at": now_iso()}
    await db.movements.insert_one(dict(mv))
    return newv


@api_router.post("/production-orders/{oid}/complete")
async def complete_production_order(oid: str, user: dict = Depends(get_current_user)):
    o = await db.production_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    if o.get("status") == "completed":
        raise HTTPException(status_code=400, detail="already_completed")
    wid = o.get("warehouse_id")
    warnings = []
    for it in (o.get("items") or []):
        prod = await db.products.find_one({"id": it["product_id"], "owner_id": {"$in": user["_scope"]}})
        if not prod:
            continue
        q = int(it.get("quantity", 0))
        batch = it.get("batch_number") or ""
        note = f"Production {o.get('number')}" + (f" · {batch}" if batch else "")
        # produce finished units (+)
        await _mutate_stock(user, prod, wid, q, "receive", note, it.get("best_before_date") or None)
        # consume parts (-)
        for part in (prod.get("bom") or []):
            pp = await db.products.find_one({"id": part.get("product_id"), "owner_id": {"$in": user["_scope"]}})
            if not pp:
                continue
            need = q * int(part.get("qty", 0) or 0)
            if need <= 0:
                continue
            newv = await _mutate_stock(user, pp, wid, -need, "remove", note)
            if newv < 0:
                warnings.append(pp.get("name"))
    await db.production_orders.update_one({"id": oid, "owner_id": {"$in": user["_scope"]}},
                                          {"$set": {"status": "completed", "completed_at": now_iso(), "updated_at": now_iso()}})
    await record_snapshot(user["id"])
    o = await db.production_orders.find_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True, "warnings": warnings, "production_order": clean(o)}


@api_router.delete("/production-orders/{oid}")
async def delete_production_order(oid: str, user: dict = Depends(get_current_user)):
    await db.production_orders.delete_one({"id": oid, "owner_id": {"$in": user["_scope"]}})
    return {"ok": True}


# ---------------- File upload / serving (product photos) ----------------
_IMG_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif", "gif"}


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file_too_large")
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    if ext not in _IMG_EXT:
        ext = "jpg"
    path = f"{STORAGE_APP}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        await storage_put(path, data, file.content_type or "image/jpeg")
    except httpx.HTTPStatusError as e:
        code = e.response.status_code if e.response is not None else 0
        if code == 402:
            raise HTTPException(status_code=402, detail="storage_quota")
        raise HTTPException(status_code=502, detail="upload_failed")
    except Exception:
        raise HTTPException(status_code=502, detail="upload_failed")
    return {"path": path}


@api_router.get("/files/{path:path}")
async def get_file(path: str, request: Request, token: Optional[str] = None):
    tok = token
    if not tok:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            tok = auth[7:]
    if not tok:
        raise HTTPException(status_code=401, detail="auth_required")
    try:
        payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="bad_token")
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(status_code=401, detail="bad_token")
    cid = user.get("company_id")
    if cid:
        scope = [m["id"] for m in await db.users.find({"company_id": cid}).to_list(100)] or [uid]
    else:
        scope = [uid]
    parts = path.split("/")
    owner_seg = parts[-2] if len(parts) >= 2 else None
    if owner_seg and owner_seg not in scope:
        raise HTTPException(status_code=403, detail="forbidden")
    try:
        content, ctype = await storage_get(path)
    except Exception:
        raise HTTPException(status_code=404, detail="not_found")
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})



app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def migrate_stock():
    try:
        cursor = db.products.find({"stock": {"$exists": False}})
        async for p in cursor:
            wid = p.get("warehouse_id")
            qty = int(p.get("quantity", 0))
            stock = {wid: qty} if wid else {}
            await db.products.update_one(
                {"_id": p["_id"]},
                {"$set": {"stock": stock, "quantity": sum(stock.values()) if stock else qty}},
            )
        logger.info("Stock migration complete")
    except Exception as e:
        logger.warning(f"Stock migration skipped: {e}")
    try:
        await db.billing_events.create_index("event_id", unique=True)
    except Exception as e:
        logger.warning(f"billing_events index skipped: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
