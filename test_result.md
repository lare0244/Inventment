#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Current Test Cycle (Stock Value report migration + sign-out)

frontend:
  - task: "Stock Value report under Dashboard drill-down"
    file: "/app/frontend/app/warehouse-overview.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Migrated the full Stock Value report (date selection input + Today reset, category filter chips, Export PDF, Export CSV) from orders.tsx into the Dashboard -> Stock Value overview (mode=value). Warehouse filter chips already at top. Removed all dead report code from orders.tsx. Lint clean. Need e2e verification that Export PDF and Export CSV trigger from the new location and that picking a past date updates the graph."

  - task: "Sign-out redirects to login"
    file: "/app/frontend/src/auth.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "signOut() now calls router.replace('/(auth)/login') after clearing the token so the user lands on the login screen instead of a blank tab."

metadata:
  created_by: "main_agent"
  test_sequence: 1

test_plan:
  current_focus:
    - "Stock Value report under Dashboard drill-down"
    - "Sign-out redirects to login"
  stuck_tasks: []
  test_all: false

agent_communication:
  - agent: "main"
    message: "Please test FRONTEND only. Login warehouse@test.com / test123. (1) From Dashboard tap the 'Stock Value' KPI box -> verify overview opens with the graph, an 'Export filters' card containing a date input (YYYY-MM-DD), a 'Today' button, and 'Export PDF' + 'Export CSV' buttons. Tapping export buttons should not crash (on web CSV downloads, PDF opens print). (2) Verify the Orders tab no longer shows any stock-value graph/date/export UI (only AI insight, reorder suggestions, PO history). (3) Sign out from Settings -> verify it navigates to the login screen."

## Test Cycle 2 (Product sort + Company sharing / Master users)

backend:
  - task: "Company sharing API (create/join/leave, members, PRO gating, merged data scope)"
    file: "/app/backend/server.py"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New endpoints: GET/POST /api/company, /company/create, /company/join, /company/leave, PUT+DELETE /api/company/members/{id}, POST /api/billing/activate-test. Data scoping changed: all reads/updates/deletes now use owner_id IN scope (all company member ids) so connected members share & co-manage warehouses/products/stock (merge). Inserts keep owner_id=self. PRO required to create or join. Max 50 members, max 2 assigned masters (+owner). Owner cannot be demoted/removed; owner leaving dissolves company. Verified via curl already."

frontend:
  - task: "Products drill-down sort toggle (A-Z / Stock low->high / high->low)"
    file: "/app/frontend/app/warehouse-overview.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added a 3-way sort toggle (sort-az, sort-low, sort-high testIDs) in the Products drill-down (mode=products). Sorts the product rows alphabetically, by stock ascending, or descending."

  - task: "Company management UI (Settings card + /company screen)"
    file: "/app/frontend/app/company.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Settings has a Company card (company-card) -> /company screen. Not connected: code input + Create/Join (PRO gated banner). Connected: shows code + role + member count + Disconnect. Masters see a sorted member list; tap a member to edit name/email and toggle master (checkbox), or remove. Settings plan card has 'Activate PRO (test)' button (activate-pro-test-btn)."

metadata:
  created_by: "main_agent"
  test_sequence: 2

test_plan:
  current_focus:
    - "Company sharing API (create/join/leave, members, PRO gating, merged data scope)"
    - "Products drill-down sort toggle (A-Z / Stock low->high / high->low)"
    - "Company management UI (Settings card + /company screen)"
  stuck_tasks: []
  test_all: false

agent_communication:
  - agent: "main"
    message: "Test BOTH backend and frontend. Credentials in test_credentials.md (warehouse@test.com/test123, bob@test.com/test123). BACKEND: verify PRO gating (create/join fail with 403 pro_required before activation; POST /billing/activate-test makes the user PRO), company create/join, GET /company member list (masters only, sorted alpha), assign master (max 2 extra), member email/name edit, remove member, owner-leave dissolves company, and that two connected members see the SAME products/warehouses/dashboard (merged data scope). FRONTEND: (1) Dashboard -> Products box -> verify sort toggle A-Z/Stock up/Stock down reorders rows. (2) Settings -> 'Activate PRO (test)' -> Company card -> /company -> create company 'ACME01' -> verify connected state, code & role show -> Disconnect. Note: store purchase flow is a placeholder (test activation used instead)."

## Test Cycle 3 (Sales Orders module)

backend:
  - task: "Sales Orders API (CRUD, auto order number, status transitions, stock effects, chart)"
    file: "/app/backend/server.py"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Endpoints: POST/GET /api/sales-orders, GET /api/sales-orders/chart (15-month counts per status), GET/PUT/DELETE /api/sales-orders/{id}, POST /api/sales-orders/{id}/status. Order number = YYMM + letter + 6 digits (e.g. 2606A000001), company-scoped counter. Status forward-only: saved->picked/shipped, picked->shipped, shipped->returned (others 400 invalid_transition). Shipping deducts stock, return restocks (per warehouse_id, records movements). PUT locked once shipped/returned. Settings so_field1_label/so_field2_label (max 12). Curl-verified: order number format, transitions, and stock 50->38 (ship) ->50 (return)."

frontend:
  - task: "Orders tab Purchase/Sales toggle + Sales hub"
    file: "/app/frontend/app/(tabs)/orders.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Orders tab has a segmented toggle (tab-purchase / tab-sales). Purchase = existing PO content unchanged. Sales = two buttons: Create sales order (so-create-btn -> /sales-order/new) and Orders (so-orders-btn -> /sales-orders)."
  - task: "Sales Orders list + status chart + search + filters"
    file: "/app/frontend/app/sales-orders.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "15-month multi-line status chart (StatusLineChart), 4 status tabs (so-tab-*), search bar (so-search), sort filters (so-sort-date/order_number/field1/field2 using user field labels). Tap row -> /sales-order/{id}."
  - task: "Sales order create + detail/status + Settings Orders labels"
    file: "/app/frontend/app/sales-order/new.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Create form (SalesOrderEditor): 2 custom fields, shipping ref, comment, date+Today, ship-from warehouse, product items with qty stepper. Detail [id].tsx: order number header, 4 status checkboxes with confirm popups (forward-only), edit locked after shipped, delete. Settings 'Orders' card (so-label1/so-label2, max 12) saves field labels."

metadata:
  created_by: "main_agent"
  test_sequence: 3

test_plan:
  current_focus:
    - "Sales Orders API (CRUD, auto order number, status transitions, stock effects, chart)"
    - "Orders tab Purchase/Sales toggle + Sales hub"
    - "Sales Orders list + status chart + search + filters"
    - "Sales order create + detail/status + Settings Orders labels"
  stuck_tasks: []
  test_all: false

agent_communication:
  - agent: "main"
    message: "Test BOTH. Login warehouse@test.com/test123 (PRO). BACKEND focus: order number format YYMM+letter+6digits, forward-only status transitions (reject backward with 400), stock deduct on shipped & restock on returned, 15-month chart shape {months:[15], series:{saved,picked,shipped,returned:[15]}}, PUT locked after shipped, settings so_field labels persist via PUT /api/settings & GET /api/auth/me. FRONTEND: Orders tab -> toggle to Sales -> Create sales order (add a product with qty, pick ship-from warehouse, save) -> appears under Saved in /sales-orders -> open it -> tick Picked (confirm) -> tick Shipped (confirm, stock should drop) -> tick Returned (confirm). Verify search + the 4 sort filters, and that Settings 'Orders' card renames the 2 fields and the names appear as field labels + sort chips. Confirm Purchase Orders tab still shows the old reorder/PO content. Note: status chart may show flat lines when there is little data - that's fine."

## Test Cycle 4 (Sales order PDFs + return warehouse)
backend:
  - task: "Return status accepts chosen warehouse for restock"
    file: "/app/backend/server.py"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/sales-orders/{id}/status now accepts optional warehouse_id; when status=returned it restocks into that warehouse (saved as return_warehouse_id). Curl-verified: ship from WA (20->15), return to WB (WB +5, total 20)."
frontend:
  - task: "Picking list PDF (saved) + Packing slip PDF (shipped) + return warehouse picker"
    file: "/app/frontend/app/sales-order/[id].tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Detail screen: when status=saved shows 'Print picking list' (so-pdf-pick); when status=shipped shows 'Print packing slip' (so-pdf-pack) - both build a PDF via expo-print/Sharing (logo + company info + items). Ticking Returned opens a modal (return-wh-* chips, return-confirm) to choose restock warehouse. Create form Save guarded so a warehouse must be selected."
agent_communication:
  - agent: "main"
    message: "Test the NEW additions only (Sales Orders core already passed in cycle 3). Login warehouse@test.com/test123 (PRO). BACKEND: POST /api/sales-orders/{id}/status {status:'returned', warehouse_id: <otherWh>} restocks into that warehouse (check GET /api/products/{id} stock map) and persists return_warehouse_id. FRONTEND: create an order with an item + ship-from warehouse; on the Saved order detail confirm 'so-pdf-pick' button exists and tapping it doesn't crash (web opens print). Advance to Shipped; confirm 'so-pdf-pack' button appears. Tap the Returned status box -> a warehouse-picker modal appears (return-wh-*), pick one and confirm (return-confirm) -> order becomes returned. PDFs are client-side print; just verify buttons render per status and no crash."

## Test Cycle 5 (Scan-to-pick on saved orders)
backend:
  - task: "Sales order item 'picked' quantity persists (SOItem.picked)"
    file: "/app/backend/server.py"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "SOItem gained picked:int=0. Create defaults picked=0; PUT /api/sales-orders/{id} persists picked per item. Curl-verified: picked 0 -> PUT 4 -> GET shows 4."
frontend:
  - task: "Scan-to-pick on saved sales order (camera) + picked progress"
    file: "/app/frontend/app/sales-order/[id].tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "On a Saved order detail: 'Scan to pick' button (so-scan-pick) opens a CameraView barcode scanner (close=scan-pick-close). When a scanned barcode matches an order item's product, a pick modal opens showing Demanded (item.quantity) and a picked-amount input (pick-qty-input); saving (pick-save) PUTs picked. Item rows show 'Picked: X/Y' (green when complete). Barcode not in order -> 'not in order' alert. NOTE: actual camera barcode scanning can only be validated on a real device build, not web/Expo Go."
agent_communication:
  - agent: "main"
    message: "Test login warehouse@test.com/test123 (PRO). BACKEND (primary): SOItem.picked persists - create order item (picked defaults 0), PUT with picked=N, GET returns N; ensure picked survives status changes too. FRONTEND: open a Saved sales order detail and confirm the 'Scan to pick' button (so-scan-pick) renders alongside 'Print picking list', and each item row shows 'Picked: 0/<qty>'. Tapping so-scan-pick should open the camera scanner overlay (scan-pick-close visible) WITHOUT crashing; on web, camera may be unavailable - just confirm no crash and the close button works. The end-to-end barcode scan -> pick popup is a device-only camera feature; do not fail the suite if a hardware scan cannot be simulated - validate the backend picked persistence and that the UI elements render."

## Test Cycle 6 (Stocktaking / Inventering)
backend:
  - task: "Stocktakes CRUD + complete (per-warehouse inventory reconciliation)"
    file: "/app/backend/server.py"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New /api/stocktakes endpoints: POST create (loads all products at warehouse, prefills counted=system per-warehouse qty, auto number INV<yymm><seq>), GET list (date desc), GET {id}, PUT {id} (save counted per item; blocked if completed), POST {id}/complete (sets product.stock[wid]=counted, records 'adjust' movement, snapshot), DELETE {id}. Curl-verified full flow incl product stock update + cleanup."
frontend:
  - task: "Inventering screens (list + detail with count/sort/scan/finish/PDF) + Dashboard button"
    file: "/app/frontend/app/stocktakes/index.tsx, /app/frontend/app/stocktakes/[id].tsx, /app/frontend/app/(tabs)/index.tsx"
    implemented: true
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Dashboard 'Stocktaking' button (stocktaking-btn) -> /stocktakes list. New stocktake modal: choose warehouse (st-wh-dd) + date (st-date) -> creates and opens detail. Detail: sort chips (name/qty/article/ean), per-item counted inputs (std-count-<pid>, save on blur via PUT), 'Scan to count' camera modal (device only), 'Finish stocktake' (std-finish) completes, PDF export (std-pdf). i18n added to all 9 languages. Verified render + nav via screenshot."
agent_communication:
  - agent: "main"
    message: "Test login warehouse@test.com/test123 (PRO). NEW feature only. BACKEND: full /api/stocktakes lifecycle - POST {warehouse_id,date} returns items with system_qty=counted_qty prefilled per-warehouse; PUT {items:[{product_id,counted_qty}]} updates only counted; POST {id}/complete sets product.stock[warehouse]=counted (verify via GET /api/products/{id}), records adjust movements, marks completed; PUT after complete must 400 (stocktake_completed); DELETE works; scoping by owner/company. FRONTEND (web): Dashboard 'Stocktaking' button opens the list; 'New stocktake' modal picks a warehouse + date and creates; detail shows product rows with editable counted inputs and sort chips (name/qty/article/ean); editing a count and blurring persists it; 'Finish stocktake' completes and locks inputs; PDF button doesn't crash. NOTE: 'Scan to count' uses the device camera - validate the button/modal opens without crash on web but do NOT fail the suite on lack of hardware scan."
