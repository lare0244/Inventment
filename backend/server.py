from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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


class Warehouse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    location: Optional[str] = None


class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: Optional[str] = "#FF5722"


class Supplier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None


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
    notes: Optional[str] = None


class StockMovementIn(BaseModel):
    product_id: str
    type: str  # 'receive' | 'adjust' | 'remove'
    quantity: int
    best_before_date: Optional[str] = None
    note: Optional[str] = None


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


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return UserPublic(id=user["id"], email=user["email"], name=user.get("name"))


# ---------------- Generic CRUD helpers ----------------
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
    doc = {**body.dict(), "owner_id": user["id"]}
    await db.warehouses.insert_one(dict(doc))
    return clean(dict(doc))


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
    doc = {**body.dict(), "owner_id": user["id"]}
    await db.categories.insert_one(dict(doc))
    return clean(dict(doc))


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
        q["warehouse_id"] = warehouse_id
    if category_id:
        q["category_id"] = category_id
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    items = await db.products.find(q).sort("name", 1).to_list(2000)
    return [clean(i) for i in items]


@api_router.get("/products/by-barcode/{barcode}")
async def product_by_barcode(barcode: str, user: dict = Depends(get_current_user)):
    item = await db.products.find_one({"owner_id": user["id"], "barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(item)


@api_router.get("/products/{pid}")
async def get_product(pid: str, user: dict = Depends(get_current_user)):
    item = await db.products.find_one({"id": pid, "owner_id": user["id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(item)


@api_router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(get_current_user)):
    doc = {**body.dict(), "id": str(uuid.uuid4()), "owner_id": user["id"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.products.insert_one(dict(doc))
    return clean(dict(doc))


@api_router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user: dict = Depends(get_current_user)):
    upd = body.dict()
    upd["updated_at"] = now_iso()
    res = await db.products.update_one({"id": pid, "owner_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    item = await db.products.find_one({"id": pid, "owner_id": user["id"]})
    return clean(item)


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
    await db.products.delete_one({"id": pid, "owner_id": user["id"]})
    return {"ok": True}


# ---------------- Stock movements ----------------
@api_router.post("/movements")
async def create_movement(body: StockMovementIn, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": body.product_id, "owner_id": user["id"]})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    qty = int(product.get("quantity", 0))
    if body.type == "receive":
        qty += body.quantity
    elif body.type == "remove":
        qty = max(0, qty - body.quantity)
    elif body.type == "adjust":
        qty = body.quantity
    update = {"quantity": qty, "updated_at": now_iso()}
    if body.best_before_date:
        update["best_before_date"] = body.best_before_date
    await db.products.update_one({"id": body.product_id, "owner_id": user["id"]}, {"$set": update})
    mv = {"id": str(uuid.uuid4()), "owner_id": user["id"], "product_id": body.product_id,
          "product_name": product.get("name"), "type": body.type, "quantity": body.quantity,
          "resulting_qty": qty, "note": body.note, "created_at": now_iso()}
    await db.movements.insert_one(dict(mv))
    return clean(dict(mv))


@api_router.get("/movements")
async def list_movements(user: dict = Depends(get_current_user), limit: int = 30):
    items = await db.movements.find({"owner_id": user["id"]}).sort("created_at", -1).to_list(limit)
    return [clean(i) for i in items]


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
async def dashboard(user: dict = Depends(get_current_user)):
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    total_value = sum(float(p.get("cost", 0)) * int(p.get("quantity", 0)) for p in products)
    retail_value = sum(float(p.get("price", 0)) * int(p.get("quantity", 0)) for p in products)
    total_units = sum(int(p.get("quantity", 0)) for p in products)
    low_stock = [clean(p) for p in products if int(p.get("quantity", 0)) <= int(p.get("low_stock_threshold", 5))]
    # expiring within 30 days
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
                    expiring.append(clean(dict(p)))
            except Exception:
                pass
    recent = await db.movements.find({"owner_id": user["id"]}).sort("created_at", -1).to_list(8)
    return {
        "total_products": len(products),
        "total_units": total_units,
        "stock_value": round(total_value, 2),
        "retail_value": round(retail_value, 2),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:20],
        "expiring_count": len(expiring),
        "expiring_items": expiring[:20],
        "recent_movements": [clean(m) for m in recent],
    }


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
async def ai_insights(user: dict = Depends(get_current_user)):
    products = await db.products.find({"owner_id": user["id"]}).to_list(5000)
    if not products:
        return {"insight": "No products yet. Add and scan products to get AI-powered restocking insights."}
    low = [p for p in products if int(p.get("quantity", 0)) <= int(p.get("low_stock_threshold", 5))]
    lines = []
    for p in products[:60]:
        lines.append(f"- {p.get('name')}: qty={p.get('quantity',0)}, threshold={p.get('low_stock_threshold',5)}, "
                     f"cost={p.get('cost',0)}, best_before={p.get('best_before_date') or 'n/a'}")
    prompt = (
        "You are a warehouse inventory analyst. Based on this stock data, give a concise, "
        "actionable purchase-order recommendation. Prioritise items below threshold and items expiring soon. "
        "Keep it under 150 words, use short bullet points, no markdown headers.\n\n"
        f"Stock value items below threshold: {len(low)}\n\nInventory:\n" + "\n".join(lines)
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"insights-{user['id']}",
                       system_message="You are a precise warehouse inventory analyst.").with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        return {"insight": text.strip()}
    except Exception as e:
        logger.warning(f"AI insight failed: {e}")
        return {"insight": "AI insights are temporarily unavailable. Rule-based suggestions are available in the reorder list."}


class POEmailRequest(BaseModel):
    supplier_id: Optional[str] = None
    product_ids: List[str]


@api_router.post("/reports/po-email")
async def po_email(body: POEmailRequest, user: dict = Depends(get_current_user)):
    products = await db.products.find({"id": {"$in": body.product_ids}, "owner_id": user["id"]}).to_list(1000)
    supplier = None
    if body.supplier_id:
        supplier = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": user["id"]})
    lines = []
    for p in products:
        qty = int(p.get("quantity", 0))
        threshold = int(p.get("low_stock_threshold", 5))
        reorder = max(threshold * 2 - qty, threshold)
        lines.append(f"- {p.get('name')} (SKU: {p.get('sku') or p.get('barcode') or 'N/A'}) — Qty: {reorder}")
    sup_name = supplier.get("name") if supplier else "Supplier"
    body_text = (
        f"Dear {sup_name},\n\n"
        f"We would like to place the following purchase order:\n\n"
        + "\n".join(lines)
        + f"\n\nPlease confirm availability, pricing, and expected delivery date.\n\n"
        f"Best regards,\n{user.get('name')}"
    )
    return {
        "to": supplier.get("email") if supplier else "",
        "subject": f"Purchase Order from {user.get('name')}",
        "body": body_text,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
