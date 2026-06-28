from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

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


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    currency: str = "SEK"
    plan: str = "free"
    low_stock_alert_email: Optional[str] = None


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    low_stock_alert_email: Optional[str] = None


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
    if not user or not pwd_context.verify(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user["id"]))


def _public_user(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], name=user.get("name"),
                      currency=user.get("currency", "SEK"),
                      plan=user.get("plan", "free"),
                      low_stock_alert_email=user.get("low_stock_alert_email"))


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
    items = await db.warehouses.find({"owner_id": user["id"]}).to_list(1000)
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
    await db.warehouses.update_one({"id": wid, "owner_id": user["id"]}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/warehouses/{wid}")
async def delete_warehouse(wid: str, user: dict = Depends(get_current_user)):
    await db.warehouses.delete_one({"id": wid, "owner_id": user["id"]})
    return {"ok": True}


# Categories
@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    items = await db.categories.find({"owner_id": user["id"]}).to_list(1000)
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
    await db.categories.update_one({"id": cid, "owner_id": user["id"]}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/categories/{cid}")
async def delete_category(cid: str, user: dict = Depends(get_current_user)):
    await db.categories.delete_one({"id": cid, "owner_id": user["id"]})
    return {"ok": True}


# Suppliers
@api_router.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user)):
    items = await db.suppliers.find({"owner_id": user["id"]}).to_list(1000)
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
    await db.suppliers.update_one({"id": sid, "owner_id": user["id"]}, {"$set": upd})
    return clean({**upd})


@api_router.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user: dict = Depends(get_current_user)):
    await db.suppliers.delete_one({"id": sid, "owner_id": user["id"]})
    return {"ok": True}


# Products
@api_router.get("/products")
async def list_products(user: dict = Depends(get_current_user),
                        warehouse_id: Optional[str] = None,
                        category_id: Optional[str] = None,
                        search: Optional[str] = None):
    q = {"owner_id": user["id"]}
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
    item = await db.products.find_one({"owner_id": user["id"], "barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    c = clean(item)
    c["stock"] = c.get("stock") or {}
    c["quantity"] = product_total(item)
    return c


@api_router.get("/products/{pid}")
async def get_product(pid: str, user: dict = Depends(get_current_user)):
    item = await db.products.find_one({"id": pid, "owner_id": user["id"]})
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
    existing = await db.products.find_one({"id": pid, "owner_id": user["id"]})
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
    await db.products.update_one({"id": pid, "owner_id": user["id"]}, {"$set": upd})
    item = await db.products.find_one({"id": pid, "owner_id": user["id"]})
    await record_snapshot(user["id"])
    c = clean(item); c["stock"] = c.get("stock") or {}; c["quantity"] = product_total(item)
    return c


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
    await db.products.delete_one({"id": pid, "owner_id": user["id"]})
    await record_snapshot(user["id"])
    return {"ok": True}


# ---------------- Stock movements ----------------
@api_router.post("/movements")
async def create_movement(body: StockMovementIn, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": body.product_id, "owner_id": user["id"]})
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
    await db.products.update_one({"id": body.product_id, "owner_id": user["id"]}, {"$set": update})
    wh = await db.warehouses.find_one({"id": wid, "owner_id": user["id"]}) if wid else None
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
    q = {"owner_id": user["id"]}
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
    product = await db.products.find_one({"id": body.product_id, "owner_id": user["id"]})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    wh_ids = {w["id"] for w in await db.warehouses.find({"owner_id": user["id"]}).to_list(1000)}
    if body.from_warehouse_id not in wh_ids or body.to_warehouse_id not in wh_ids:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    stock = dict(product.get("stock") or {})
    from_qty = int(stock.get(body.from_warehouse_id, 0))
    if body.quantity > from_qty:
        raise HTTPException(status_code=400, detail="Not enough stock in source warehouse")
    stock[body.from_warehouse_id] = from_qty - body.quantity
    stock[body.to_warehouse_id] = int(stock.get(body.to_warehouse_id, 0)) + body.quantity
    total = sum(int(v) for v in stock.values())
    await db.products.update_one({"id": body.product_id, "owner_id": user["id"]},
                                 {"$set": {"stock": stock, "quantity": total, "updated_at": now_iso()}})
    whs = {w["id"]: w for w in await db.warehouses.find({"owner_id": user["id"]}).to_list(1000)}
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
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    await record_snapshot(user["id"])
    warehouses = {w["id"]: w for w in await db.warehouses.find({"owner_id": user["id"]}).to_list(1000)}

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
    recent = await db.movements.find({"owner_id": user["id"]}).sort("created_at", -1).to_list(8)
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
async def stock_history(user: dict = Depends(get_current_user)):
    await record_snapshot(user["id"])
    snaps = {s["ym"]: s["value"] for s in await db.stock_snapshots.find({"owner_id": user["id"]}).to_list(1000)}
    now = datetime.now(timezone.utc)
    seq = []
    for i in range(14, -1, -1):
        mm = now.month - i
        yy = now.year
        while mm <= 0:
            mm += 12
            yy -= 1
        seq.append(f"{yy:04d}-{mm:02d}")
    last = 0.0
    result = []
    for ym in seq:
        if ym in snaps:
            last = snaps[ym]
        result.append({"month": ym, "value": last})
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

    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    # movements AFTER the target date are the ones we need to undo
    future_mvs = await (db.movements.find({"owner_id": user["id"], "created_at": {"$gt": end}})
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
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    suppliers = {s["id"]: s for s in await db.suppliers.find({"owner_id": user["id"]}).to_list(1000)}
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
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
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
    products = await db.products.find({"id": {"$in": body.product_ids}, "owner_id": user["id"]}).to_list(1000)
    supplier = None
    if body.supplier_id:
        supplier = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": user["id"]})
    warehouse = None
    if body.warehouse_id:
        warehouse = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": user["id"]})
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


def _suggest_qty(p: dict) -> int:
    qty = product_total(p)
    threshold = int(p.get("low_stock_threshold", 5))
    return max(threshold * 2 - qty, threshold)


async def _build_po_doc(user: dict, qty_map: dict, supplier: Optional[dict], warehouse: Optional[dict]):
    products = await db.products.find({"id": {"$in": list(qty_map.keys())}, "owner_id": user["id"]}).to_list(1000)
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
    supplier = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": user["id"]}) if body.supplier_id else None
    warehouse = await db.warehouses.find_one({"id": body.warehouse_id, "owner_id": user["id"]}) if body.warehouse_id else None
    qty_map = {}
    if body.items:
        qty_map = {it.product_id: it.qty for it in body.items}
    else:
        ids = body.product_ids or []
        prods = await db.products.find({"id": {"$in": ids}, "owner_id": user["id"]}).to_list(1000)
        qty_map = {p["id"]: _suggest_qty(p) for p in prods}
    po = await _build_po_doc(user, qty_map, supplier, warehouse)
    await db.purchase_orders.insert_one(dict(po))
    return clean(dict(po))


@api_router.post("/purchase-orders/auto")
async def auto_purchase_orders(user: dict = Depends(get_current_user)):
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    low = [p for p in products if product_total(p) <= int(p.get("low_stock_threshold", 5))]
    if not low:
        return {"created": [], "count": 0}
    suppliers = {s["id"]: s for s in await db.suppliers.find({"owner_id": user["id"]}).to_list(1000)}
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
    items = await db.purchase_orders.find({"owner_id": user["id"]}).sort("created_at", -1).to_list(200)
    return [clean(i) for i in items]


@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, body: POUpdate, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": user["id"]})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    supplier = await db.suppliers.find_one({"id": po.get("supplier_id"), "owner_id": user["id"]}) if po.get("supplier_id") else None
    warehouse = await db.warehouses.find_one({"id": po.get("warehouse_id"), "owner_id": user["id"]}) if po.get("warehouse_id") else None
    qty_map = {it.product_id: it.qty for it in body.items if it.qty > 0}
    rebuilt = await _build_po_doc(user, qty_map, supplier, warehouse)
    upd = {"items": rebuilt["items"], "total": rebuilt["total"], "email_body": rebuilt["email_body"]}
    await db.purchase_orders.update_one({"id": po_id, "owner_id": user["id"]}, {"$set": upd})
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": user["id"]})
    return clean(po)


@api_router.put("/purchase-orders/{po_id}/sent")
async def mark_po_sent(po_id: str, user: dict = Depends(get_current_user)):
    res = await db.purchase_orders.update_one(
        {"id": po_id, "owner_id": user["id"]},
        {"$set": {"status": "sent", "sent_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po = await db.purchase_orders.find_one({"id": po_id, "owner_id": user["id"]})
    return clean(po)


@api_router.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, user: dict = Depends(get_current_user)):
    await db.purchase_orders.delete_one({"id": po_id, "owner_id": user["id"]})
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
    return {"plan": plan, "limits": lim, "usage": usage,
            "plan_expires_at": user.get("plan_expires_at"),
            "price": {"amount": PRO_PRICE_AMOUNT, "currency": PRO_PRICE_CURRENCY.upper(), "interval": "month"}}


@api_router.post("/billing/checkout")
async def billing_checkout(body: CheckoutRequest, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    origin = body.origin_url.rstrip("/")
    host_url = str(api_router.prefix)  # unused; webhook url not required for polling
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
