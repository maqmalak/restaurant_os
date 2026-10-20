# Restaurant OS — Architecture (proposal for review)

Status: **Phase 1 foundation in place** (site, app, monorepo, POS app on POS Awesome). Everything marked *Proposed* waits for
your review before feature code is written.

## 1. Runtime

| Piece | Where | Port / URL |
|---|---|---|
| Frappe / ERPNext v16 site | `restaurant.localhost` on the shared bench `~/erpnext-react` | desk http://restaurant.localhost:8008/desk |
| Custom app | `apps/restaurant_os` (git, branch `develop`) | — |
| POS Awesome | `apps/posawesome` (already on the bench) | its own Vue POS at `/app/posapp` still works |
| mm_core | `apps/mm_core` — generic React form / list helpers (connections, print options, mapped docs) | — |
| React monorepo | `apps/restaurant_os/frontend` (pnpm workspaces) | POS dev http://restaurant.localhost:5181/ros/pos |
| Socket.IO / Redis | bench-wide (9000, 11000, 13000) | — |

Every Frappe site on this bench uses the same cookie names, so Restaurant OS runs on its own hostname
(`restaurant.localhost`); its logins never touch micromaxerp, realestate, solar, etc. Procfile entries: `web_restaurant`,
`restaurant_ui`.

## 2. Backend: `restaurant_os`

```
restaurant_os/
  api/pos.py            whitelisted POS API (done — see API.md)
  api/…                 kds, orders, rider, web_order, admin  (Proposed, per phase)
  services/             business logic called by doc events / APIs (Proposed): order_state, stock_deduction,
                        availability, rider_assignment, reviews
  integrations/
    aggregators/base.py, foodpanda.py   (Proposed, phase 8, mock first)
    payments/…, sms/…                   (Proposed, adapters)
  restaurant_os/doctype/ custom DocTypes (Proposed — DATA_MODEL.md)
  www/ros.html          the built React apps at /ros/*
```

Rules kept: no core edits; standard DocTypes first; custom fields via fixtures; thin controllers; realtime through
`frappe.publish_realtime` rooms per branch / kitchen station / rider; slow work through `frappe.enqueue`.

## 3. POS on POS Awesome (done)

The cashier screen is the MicroMax React POS (dashboard, terminal, cash, stock, invoices, shifts), imported with its style.
Its backend `mm_core.pos` was ported to `restaurant_os.api.pos` with the same endpoints and payloads, rewired onto
POS Awesome:

| Concern | Before (mm_core.pos) | Now (restaurant_os.api.pos) |
|---|---|---|
| Shift open | ERPNext POS Opening Entry | **POS Opening Shift** via POS Awesome `create_opening_voucher` |
| Sale | POS Invoice, consolidated at close | **Sales Invoice** (`is_pos`, `update_stock`) tagged `posa_pos_opening_shift`; POS Invoice when the profile ticks *create POS Invoice instead* |
| Shift close | POS Closing Entry + merge log | **POS Closing Shift** via POS Awesome `make_closing_shift_from_opening` / `submit_closing_shift` |
| Offers / coupons | ERPNext Pricing Rule / Coupon Code | **POS Offer / POS Coupon**, applied server-side, recorded in `posa_offers` / `posa_coupons` (POS Awesome hooks count coupon use and add loyalty points) |
| Cash out / deposit | Journal Entry | **POS Cash Movement** (Expense / Deposit) when the profile enables cash movement; JE otherwise |
| Dues / party cash | Payment Entry tagged in remarks | Payment Entry with `reference_no = shift` (counted by POS Awesome's closing) |
| Offline | `mm_offline_id` | **`posa_client_request_id`** (idempotent replay) — browser queue in IndexedDB unchanged |
| Profit | — | gross profit = net sales − Σ(incoming_rate × stock qty) on dashboard, shift summary, X/Z report |

POS Awesome applies offers inside its own Vue client; the React terminal sends a plain cart, which is why the offer engine
runs on the server (`_apply_offers`). Manual (non-auto, non-coupon) offers are not applied by the React terminal.

## 4. Frontend monorepo

```
frontend/
  packages/ui      @ros/ui     globals.css (light/dark tokens) + Tailwind preset — the MicroMax look
  packages/api     @ros/api    Frappe client (CSRF, errors)
  packages/types   @ros/types  shared types
  apps/pos         @ros/pos    cashier POS (done)
  apps/kds, rider, web-order, kiosk, admin   (Proposed, phases 4–10)
```

Current gap vs. the brief: the POS keeps the imported code's SWR + frappe-react-sdk data layer and its own UI components
(copied from MicroMax). Moving those into `@ros/ui` / `@ros/api` and switching to TanStack Query is planned as each new
app needs them, rather than rewriting the working POS first.

## 5. Order state machine (built)

```
Placed → Accepted → Preparing → Ready → Picked Up → Out for Delivery → Delivered
   ↘ Rejected        ↘ Cancelled (before Ready, manager approval after)       ↘ Returned
Dine-in / takeaway: Ready → Served / Collected → Completed
```

Each transition stamps `<status>_at`, publishes `ros_order_update` to the branch room, and enqueues the next automatic step
(KDS tickets on Accepted, rider offer on Ready, review request on Delivered/Completed, stock deduction per OPEN_QUESTIONS #7).

## 6. Data flow (built; tested end to end by tests/test_e2e.py)

```
channel (POS / web / app / kiosk / Foodpanda webhook)
  → Restaurant Order (+ Sales Invoice for paid / POS orders)
  → KDS tickets per Kitchen Station (realtime)        → bump → Ready
  → Delivery Assignment → Rider app (realtime + GPS)  → Delivered
  → Order Review link (SMS / WhatsApp adapter)
  → background job: BOM recipe consumption from the branch kitchen warehouse → availability recompute → reorder
  → reports (Script / Query Reports, pre-aggregated nightly)
```
