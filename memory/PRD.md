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

## Implemented (2026-06-26 — Update 2)
- PDF stock report (expo-print + expo-sharing) with date, total value, current inventory table, and 15-month stock-value SVG line chart
- Monthly stock-value snapshots (stock_snapshots collection); GET /api/reports/stock-history returns 15 months with carry-forward
- On-screen 15-month line chart on Orders tab (react-native-svg)
- Currency selection in Settings (SEK/DKK/EUR/GBP); applied app-wide via money() formatter; PUT /api/settings + currency on /auth/me
- Warehouse address field; shown in Settings and used as delivery address in PO emails
- Warehouse selection ("Deliver to") when drafting purchase orders
- New-product form auto-fills purchase/received date with today (editable)
- AI insight (Claude) now returns live output after key recharge
- Verified: 29/29 backend tests passed (13 new + 16 regression)

## Implemented (2026-06-26 — Update 3)
- Low-stock handling changed from automated email to an in-app WARNING (per user request): prominent warning banner on Dashboard when items are at/below threshold; movement API returns a `low_stock` flag
- Removed Resend email integration, the alert-email setting, and the send-alert endpoint (no automated emails)
- Purchase Order history: POs are persisted (`/api/purchase-orders`) as draft on creation, with "Mark as Sent" (`/sent`) and a status-badged ORDER HISTORY list on the Orders tab

## Backlog
- P1: Per-warehouse stock quantities (currently product-level), image upload/capture for products
- P1: Native date pickers for purchase/best-before (currently text YYYY-MM-DD)
- P2: Mark PO as sent / order history, CSV export of stock report
- P2: Surface `degraded` flag when AI falls back to rule-based
- P2: Return 404 on DELETE when no doc matches; pin bcrypt<4 to silence startup warning

## Next Tasks
- Add product image capture via expo-camera/image-picker
- Per-warehouse inventory tracking
