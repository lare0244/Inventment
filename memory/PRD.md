# StockMaster — Warehouse Stock Management App

## Original Problem Statement
Stock management app: scan product barcodes with phone; edit product info, prices, supplier, purchase date, best-before date; organize by categories/warehouses; purchase orders to suppliers via email draft; low-stock alerts; reports with stock values & reorder suggestions; scan incoming orders to add quantities + best-before date; inventory updates.

## User Choices
- Email to suppliers: generate draft (copy to clipboard), manual send
- Reorder suggestions: rule-based + AI-powered (Claude Sonnet 4.6 via EMERGENT_LLM_KEY)
- Auth: JWT email/password
- Barcode: auto-fetch product info from Open Food Facts
- Theme: dark warehouse style (Safety Orange #FF5722, Rajdhani + IBM Plex Sans)

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT auth (passlib bcrypt + python-jose), all routes under /api, per-user owner_id scoping
- Frontend: Expo Router (file-based), expo-camera scanner, expo-secure-store token, dark UI system in src/theme.ts
- Integrations: Open Food Facts barcode lookup (free), emergentintegrations LlmChat (Claude) for AI insights

## Implemented (2026-06-26)
- JWT register/login/me; default "Main Warehouse" seeded on signup
- Products CRUD + lookup by barcode; categories, warehouses, suppliers CRUD
- Barcode scanner (existing product → receive; unknown → auto-fill from OFF → add)
- Stock movements (receive/adjust/remove) with best-before capture; quick "Receive" on product screen
- Dashboard: stock value, units, low-stock alerts, expiring-soon, recent activity
- Reports: rule-based reorder suggestions + AI restock insight; PO email draft with copy-to-clipboard
- Settings: manage warehouses/categories/suppliers, sign out
- Verified: 16/16 backend tests passed; multi-tenant isolation solid

## Backlog
- P1: Per-warehouse stock quantities (currently product-level), image upload/capture for products
- P1: Native date pickers for purchase/best-before (currently text YYYY-MM-DD)
- P2: Mark PO as sent / order history, CSV export of stock report
- P2: Surface `degraded` flag when AI falls back to rule-based
- P2: Return 404 on DELETE when no doc matches; pin bcrypt<4 to silence startup warning

## Next Tasks
- Add product image capture via expo-camera/image-picker
- Per-warehouse inventory tracking
