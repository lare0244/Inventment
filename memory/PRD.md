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

## Implemented (2026-06-27 — Update 4)
- Renamed app to INVENTMENT (app.json + login brand)
- Catalog rows now show a "LOW"/"LÅG" badge (color-coded amber/red) when qty ≤ threshold
- Theme system: Dark / Light palettes via AppSettingsProvider + useColors(); selectable in Settings → Appearance; persisted on device; all screens refactored to dynamic makeStyles(palette)
- Full i18n (English/Swedish) via src/i18n.ts + useT(); language selector in Settings; every screen, tab label, button, placeholder and status translated; choice persisted
- StatusBar adapts to theme; both theme & language persist across restarts

## Implemented (2026-06-27 — Update 5)
- Place Order screen (/place-order): opened from Dashboard low-stock banner; products grouped Out of stock → Low stock → In stock; sort toggle (By stock / A–Z); multi-select → POST /api/purchase-orders → navigates to Orders
- Catalog: visible sort toggle (A–Z / By stock) added alongside category filter + search
- Settings: edit (pencil → prefilled modal → PUT) + delete for warehouses/categories/suppliers (in addition to add)
- Backend: PUT /api/warehouses/{id}, /api/categories/{id}, /api/suppliers/{id}
- i18n: device language auto-detected on first launch (expo-localization), user-overridable in Settings
- Verified: 36/36 backend tests pass; full frontend flows verified via Playwright

## Implemented (2026-06-27 — Update 6)
- CSV export of the stock report on the Orders tab (next to PDF): full inventory with category/supplier/warehouse names, qty, cost, price, stock value, dates; UTF-8 BOM, web download + native share via expo-file-system/legacy + expo-sharing
- Place Order footer now has a "DELIVER TO" warehouse picker (defaults to first warehouse, user-selectable), matching the Orders-tab PO draft
- i18n: added exportCsv (EN/SV)

## Implemented (2026-06-27 — Update 7)
- Per-warehouse stock: product.stock = {warehouse_id: qty}; product.quantity = total. Startup migration backfills existing products into their assigned warehouse.
- Movements take warehouse_id (sticky "active warehouse" persisted on device, changeable per receive); only that warehouse's stock mutates; low_stock flag is per warehouse. Fallback: stockless/legacy products operate on total.
- Dashboard & Catalog: "All warehouses" + per-warehouse filter chips; per-warehouse qty when scoped; dashboard low-stock rows show warehouse name (per product×warehouse alerts).
- ProductEditor: quantity field tied to selected warehouse; saving updates only that warehouse.
- Orders CSV/PDF export: warehouse + category filters; one row per (product, warehouse) with warehouse column.
- Verified: 47/47 backend tests pass (11 new per-warehouse); frontend flows verified.

## Implemented (2026-06-27 — Update 8)
- Stock transfer between warehouses: POST /api/transfers (validates both warehouses exist, source has enough; total unchanged; records 'transfer' movement). Product detail Transfer modal (From/To pickers, To excludes From, validation).
- Per-warehouse Adjust (set) + Remove actions on product detail via warehouse-scoped /movements.
- PDF report: "Needs Reordering" section — low (product×warehouse) rows with threshold + suggested order qty = max(threshold, 2*threshold-qty); honors warehouse+category filters.
- Verified: 59/59 backend tests (12 new transfer/adjust); frontend transfer/adjust/remove modals + PDF section verified.

## Implemented (2026-06-27 — Update 9)
- Movements history screen (/movements) with type + warehouse filters; reachable via "View all" on Dashboard Recent Activity. GET /movements supports type & warehouse_id filters.
- Auto-create POs grouped by supplier (POST /purchase-orders/auto; no-supplier bucket) via Orders-tab button.
- Editable unit quantities: qty steppers per product in Place Order (sends items[]); tap a draft PO in Orders → edit item quantities (PUT /purchase-orders/{id} recomputes total). POCreate now accepts items[] or legacy product_ids.
- Settings: language & currency are dropdown menus (new reusable Dropdown in ui.tsx).
- Warehouses & suppliers: full structured address (street1/2, number, postcode, city, state, county, contact_person, phone; supplier also email). PO delivery block uses formatted address.
- Verified: 17/17 new v6 tests + regression green (after cleaning TEST_ seed data). All UI flows verified.

## Implemented (2026-06-27 — Update 10)
- "Send to supplier": one-tap opens device email app pre-filled (mailto:) with PO subject+body to supplier email — no auto-send. Available in PO email modal and draft-PO edit modal; marks draft as sent after composing. Shows alert if supplier has no email.
- PO email subject+body now composed client-side and translated to active language (EN/SV) — always reflects current language setting (incl. delivery address from warehouse).
- Verified: 6/6 new v7 tests + regression green; EN & SV email previews confirmed. NOTE: actual native mail-app opening requires a device/native build to validate (mailto can't open in web preview).

## Implemented (2026-06-27 — Update 11)
- Catalog: search matches product OR category name; product sort by A–Z / stock / category / price; category filter shows top-5 (by product count) chips + a dropdown of all categories sortable by count or name (shown when >5).
- Place Order: button is "Save order draft" (saves draft with per-product quantities).
- Orders: draft POs deletable (trash icon + confirm; web uses window.confirm, native uses Alert).
- AI insights respond in the user's language + currency (ai-insights?lang=&currency=).
- Entity limits enforced (HTTP 400 + alert): products 9999, categories 99, warehouses 19, suppliers 9999.
- Verified: 10/10 new v8 tests; AI Swedish output + warehouse(19)/category(99) limits confirmed. (Regression failures seen are legacy tests spamming warehouses against the new 19 cap — test hygiene, not a code bug.)

## Implemented (2026-06-27 — Update 12)
- Product editor: added "Volume/Weight/Length" numeric field with a connected unit dropdown (ml, litre, g, kilo, mm, meter), plus Headline and Description fields. Backend ProductIn gained measure_value, measure_unit, headline, description; verified create+read round-trip.

## Implemented (2026-06-27 — Update 13)
- Product measure ("X unit") now shown on Catalog rows and added as a column in CSV + PDF exports.
- Free vs PRO tiers (publish-ready):
  - Free limits: 2 warehouses, 9 products, 9 categories, 9 suppliers. PRO: 19 / 9999 / 99 / 9999. Enforced server-side (HTTP 403 `limit_reached:<kind>:<cap>:<plan>`).
  - PRO upgrade via Stripe Checkout (6.99 EUR) through the Emergent Stripe proxy; implemented as a one-time 30-day PRO period (one-time payment — emergentintegrations StripeCheckout supports mode=payment only). True auto-renew subscription needs the user's own live Stripe Price at publish.
  - Plan card in Settings (current plan, live usage, Upgrade button); /billing-return screen polls status and activates PRO; auto upgrade-prompt when a Free user hits a limit (web + native).
  - STRIPE_API_KEY persisted in /app/backend/.env so it survives supervisor restarts.
- Verified: 11/11 v9 backend tests; end-to-end FE→BE→Stripe checkout page (€6.99 sandbox) reached; status polling does not upgrade until paid.

## Backlog
- At publish: switch to the user's live Stripe keys + a real recurring Price for true monthly auto-renewal (and/or app-store IAP for iOS/Android digital goods).
- Test hygiene: legacy suites spam entities against caps — migrate to fresh per-test users.
- Test hygiene: migrate legacy test suites (v3/v5/v6/v7) to fresh per-test users so the 19-warehouse cap doesn't block reruns.
- Idempotent PUT on warehouses/categories/suppliers returns 200 even when no doc matches (should be 404) — low priority carryover.
- P1: Per-warehouse stock quantities (currently product-level), image upload/capture for products
- P1: Native date pickers for purchase/best-before (currently text YYYY-MM-DD)
- P2: Mark PO as sent / order history, CSV export of stock report
- P2: Surface `degraded` flag when AI falls back to rule-based
- P2: Return 404 on DELETE when no doc matches; pin bcrypt<4 to silence startup warning

## Completed (latest)
- Branding/logo: company logo shown as a rounded banner on the login screen and embedded (base64) at the bottom of PDF reports (src/logoBase64.ts, assets/images/logo.png).
- Company Information: new Settings section + edit modal with company_name, street1, street2, postcode, city, state, county. Persisted via PUT /api/settings (company object on user; returned by /auth/me). Exposed through auth context (company). PDF reports now print the company name + address above the warehouse line. i18n companyInfo/companyName added to all 9 languages.
  • value → total stock value + value graph + warehouse chooser (no list)
  • units → total units + units-over-time graph (15mo) + product rows
  • products → total + top-5 category bar chart + product rows (per warehouse)
  • low → no graph, only low-stock product rows (qty ≤ threshold)
  All modes reflect the chosen warehouse. Backend GET /api/reports/stock-history gained metric=units (+ earlier end=, warehouse_id=).
- Fixed a stray duplicate `client.close()` line in server.py shutdown handler (was an IndentationError).
- StockLineChart enhanced with adaptive round-number horizontal gridlines (100s/1000s) + Y-axis value labels (showGrid/formatValue props).
- Backend GET /api/reports/stock-history now accepts optional warehouse_id and reconstructs per-warehouse monthly values from movements (anchored on current stock, valued at current cost).
- Currencies (7): SEK, DKK, NOK, EUR, GBP, USD, AUD. Languages (9): EN, SV, DA, NL, FR, DE, ES, IT, PL across UI + AI.

## Completed (2026-06-28)
- Stock Value report fully migrated from the Orders tab into the Dashboard → "Stock Value" drill-down (warehouse-overview.tsx, mode=value): 15-month stock-value graph, date selection (YYYY-MM-DD input + "Today" reset), warehouse + category filters, and Export PDF / Export CSV. Orders tab cleaned of all report code (now only AI insight, reorder suggestions, auto-create POs, PO history). Verified e2e by testing agent (iteration_10).
- Sign-out now redirects to the login screen: signOut() in src/auth.tsx calls router.replace('/(auth)/login') after clearing the token.

## Completed (2026-06-29)
- Products drill-down (Dashboard → Products) now has a sort toggle: A–Z, Stock low→high, Stock high→low.
- Company sharing / Master users (PRO): unique company code create + join; merged data so connected members share & co-manage all warehouses/products/stock. Master sees connected users (name+email, sorted A–Z), edits name/email, assigns up to 2 extra masters (3 total incl owner), and disconnects users. Max 50 members. Every connected user must be PRO. Owner-leave dissolves the company. New endpoints under /api/company + POST /api/billing/activate-test (test-only PRO activation). New screen /app/company.tsx + Settings "Company" card and "Activate PRO (test)" button. Verified: backend 20/20 pytest + frontend flows.

## Completed (2026-06-29) — Sales Orders module
- Orders tab now has a Purchase Orders / Sales Orders toggle (Purchase = existing content, unchanged).
- Sales Orders: "Create sales order" + "Orders". Orders have 4 statuses (Saved/Picked/Shipped/Returned) shown in a 15-month multi-line chart (colour per status).
- Orders contain product line items + ship-from warehouse; shipping deducts stock, returning restocks (records movements). Status is forward-only (saved→picked→shipped→returned) with a confirm popup each step; editing locks after shipped.
- Auto order number YYMM + letter + 6 digits (e.g. 2606A000001), company-scoped counter. Fields: order number, 2 user-named custom fields (Settings → Orders, max 12 chars), comment, shipping reference, date (with Today).
- Orders list per status: scrollable, sorted date→order number, with search bar + sort filters (date, order number, the 2 custom fields). Verified: backend 15/15 pytest + frontend flows.

## Completed (2026-06-29) — Sales order PDFs + return warehouse
- Picking List PDF on Saved orders; Packing Slip PDF on Shipped orders (expo-print, with company info + logo + items).
- Ship-from warehouse is required on create (backend rejects missing/invalid with 400 warehouse_required); shipping deducts from it.
- Return transition opens a warehouse picker so returned items restock into the chosen (possibly different) warehouse; return warehouse validated against the company's warehouses, persisted as return_warehouse_id. Verified: backend 4/4 pytest + frontend flows.

## Completed (2026-06-29) — Scan-to-pick on saved orders
- Saved sales order detail has a "Scan to pick" button: scanning a product barcode that matches an order line opens a popup showing the Demanded quantity and a picked-amount input; saving stores `picked` per item.
- Item rows show "Picked: X/Y" (green when fully picked). `picked` persists through PUT and status changes. Verified: backend 3/3 pytest + frontend UI. NOTE: live camera barcode scan is device-only (not testable in Expo Go/web).

## Completed (2026-06-29) — Sales tab layout polish
- "Scan to pick" moved into the order detail just above the product lines (below the ship-from warehouse selector).
- Sales Orders tab now shows the order content inline (status graph, search, status filters) — the separate "Orders" navigation button was removed. The list shows the 10 most recent orders with a "Show more" button that reveals 25 more at a time; pagination resets when status/search/sort changes. (Send-to-supplier remains only under Purchase Orders.) Verified by testing agent (iteration_15).

## Completed (2026-06-29) — Stocktaking (Inventering)
- Dashboard "Stocktaking" button opens a new Stocktakes area (/stocktakes). List shows previous stocktakes sorted by date desc with status badge, item count, and per-row PDF export.
- New stocktake: choose warehouse + date -> loads all products at that warehouse with the current per-warehouse qty prefilled as the counted amount.
- Detail: sort by name / quantity / article no (SKU) / EAN (barcode); per-item counted input persists on blur (PUT). "Scan to count" (device camera) matches a scanned barcode to a line and opens a count popup. "Finish stocktake" completes -> sets each product's stock[warehouse]=counted, records 'adjust' movements, marks completed & locks inputs. PDF export of the stocktake (company info + logo + system/counted/diff table).
- Backend: /api/stocktakes CRUD + /{id}/complete; auto number INV<yymm><seq>; owner/company scoped. i18n added to all 9 languages.
- Verified: backend 11/11 pytest + web frontend flow (testing agent iteration_19). NOTE: live camera barcode scan is device-only (not testable in Expo Go/web).

## Completed (2026-06-29) — Product Photos (Object Storage)
- Product editor: snap (camera) or upload (gallery) a product photo via expo-image-picker with contextual permission handling (Open Settings on denial). Photo preview + Remove.
- Images stored in Emergent Object Storage: POST /api/upload -> path inventment/uploads/{user}/{uuid}; product.image holds the path (legacy OFF http image URLs still pass through). GET /api/files/{path} serves bytes, auth via Bearer header or ?token= (for web <img>), owner-scope enforced (401/403).
- Thumbnails now show in the Catalog list, the product editor, and the Stocktake detail rows (backend adds image to stocktake items) so items are easy to recognise while counting.
- ProductImage component resolves the JWT once and renders a tokenized URL (works web + native). i18n added to all 9 languages; app.json got NSPhotoLibraryUsageDescription + expo-image-picker plugin.
- Verified: backend 11/11 pytest (upload/serve/401/403/persist) + web upload->preview->catalog thumbnail e2e (testing agent iteration_20). NOTE: 'Take photo' camera is device-only (not in Expo Go/web).

## Completed (2026-06-29) — Stocktake enhancements
- Count progress: stocktake items now track `counted_done` (set true on PUT/scan). Detail screen shows a PROGRESS bar (X / Y) that updates live as counts are entered (saved on input blur); the stocktakes list shows a mini progress bar per open count.
- Tap-to-enlarge: tapping a product thumbnail in a stocktake opens a full-screen image viewer (ProductImage now supports contentFit).
- Variance report PDF: "Variance report" button builds a PDF listing only products whose counted qty differs from the system qty (alerts "No discrepancies" if none). Product photos are intentionally NOT included in PDFs.
- Verified: backend counted_done curl-tested; web progress increment (0/5 -> 2/5) + variance button + thumbnails verified via screenshot.

## Completed (2026-06-29) — Stocktake count UX
- Search in count: a search box on the stocktake detail filters products live by name, barcode, or article no (SKU).
- Finish preview (adjust-only finish): "Finish stocktake" now opens a "Review changes" modal listing every product whose counted qty differs from system (system → counted with +/- diff) plus an "X to update · Y unchanged" summary; "Confirm & finish" then applies the stocktake. Replaces the old one-line confirm.
- Verified on web: search filters correctly; preview shows exact diffs (e.g. 2 to update · 3 unchanged) and Confirm completes the stocktake. Test data restored.

## Next Tasks
- Add product image capture via expo-camera/image-picker  <!-- DONE above -->

- Native App Store / Google Play PRO subscriptions (requires native build to QA)
- Android store config in app.json (package, versionCode, splash/icon)
