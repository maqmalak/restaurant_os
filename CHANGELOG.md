# Changelog

## 2026-10-21 — Phase 11: hardening

- **Security review** (docs/HARDENING.md): all 94 whitelisted methods checked. The 37 counter methods now require the
  user to be on the POS Profile's user list, or a manager. The mock payment and Foodpanda webhooks no longer accept
  strangers. Foodpanda orders are created with `as_system()` instead of `set_user`.
- **Manager approval:** cashier discounts above 10% of the bill, and every return, need a manager to sign in at the
  terminal. The approval is noted on the invoice, and wrong passwords are throttled. Both are set under Settings →
  Manager Approval.
- **Audit trail:** change history is on for invoices, stock entries and reconciliations, offers, coupons, POS
  profiles, cash movements, payments, prices and the loyalty program.
- **End-to-end test** of the nine steps on all six channels (`tests/test_e2e.py`). It found and fixed three bugs:
  - stock deduction and rider offers didn't fire on the save that reached the status
  - deliveries had their ingredients issued twice
  - kiosk sales were recorded as POS
- **Load test** (`tests/load.py`, rolled back): POS checkout p95 204 ms (budget 300); online order → KDS p95 113 ms
  (budget 1 s).
- **Health endpoint** `restaurant_os.api.health.ping`, and production setup steps in SETUP.md.
- **KDS:** an "Assign rider" button on delivery cards. Off-duty riders are listed with "check in & assign".
- Document forms no longer log "Workflow not found" errors.
- Tests: 36 unit + 1 end-to-end, all passing.

## 2026-10-21 — Phase 9: offers online, loyalty, reviews, campaigns

- **Offers & coupons online**: web orders get the same POS Offers as the counter (free Raita with Karahi shows in the cart and
  is made by the kitchen); a promo code (POS Coupon) at checkout, counted on the invoice. Quote = invoice.
- **Loyalty — Saffron Rewards** (ERPNext Loyalty Program: 1 point per Rs 100, 1 point = Rs 1, 365-day expiry): diners with a
  mobile are enrolled; delivery / pickup invoices earn points; checkout shows the balance and can redeem it (Settings →
  online redeem) — it lowers cash-on-delivery / the online charge. Tracking page shows points earned.
- **Reviews**: after delivery / pickup the tracking page asks for stars (overall, food, delivery, each dish) and a comment →
  *Order Review*. A WhatsApp link (mock) goes out `review delay` minutes after the order finishes (every 10 min). Ratings at or
  below the alert level notify Sales / System Managers and appear as a dashboard alert. Screen: Guests → Reviews.
- **Campaigns**: WhatsApp / SMS blasts (mock) to Lapsed / New this month / Top spenders / Everyone, with {name}, {restaurant},
  {coupon}, {link}; preview the recipients, then send. Screen: Guests → Campaigns.
- Owner dashboard: Reviews panel (7-day average, recent, low & unanswered).
- Fixes: `["in", ["", None]]` filters never matched empty (NULL) links — now `is not set` everywhere (review requests,
  loyalty enrolment, unassigned deliveries, open shift lookup, channel backfill).
- Tests: 32 backend passing.

## 2026-10-21 — Online payment (cash + card / wallet) for web orders

- Checkout offers **Cash** or **Pay online**; online orders wait as *Awaiting Payment* (off the KDS) until the gateway confirms,
  then go to the kitchen; failed payments can be retried from the tracking page ("Pay now").
- Gateway adapter: **Mock** test gateway page `/ros/pay/<session>` (approve / decline), Live placeholder for Safepay / PayFast /
  JazzCash / Easypaisa / bank gateway (hosted checkout + HMAC-signed webhook `restaurant_os.api.payments.webhook`).
- Paid orders: nothing to collect; their invoice (at delivered / collected) is settled by a Payment Entry in mode *Online
  Payment* → *Online Payment Clearing*. Payment sessions are Integration Requests.
- Fixes: lines no kitchen station makes (delivery fee) no longer move a new order to Preparing; the saved web cart clears after
  ordering; pickup tracking says "Ready for pickup in" and shows nothing to pay when paid online.
- Tests: 27 backend + Vitest passing.

## 2026-10-21 — Phase 6: online ordering & self-order kiosk

- **Ordering site** `/ros/order` (public, installable PWA): menu by category with photos, sold-out locking, add-ons
  (required / optional, max choices), notes, cart kept on the phone; delivery (address + map pin, "use my location", delivery
  fee, branch radius check, minimum order) or pickup; cash on delivery / at pickup (online card = coming soon); exact quote =
  the future invoice; places a Restaurant Order (Web / App) straight to the KDS and opens the tracking page; idempotent.
- Customers matched by mobile or created; pickup tracking steps (Placed → Preparing → Ready → Collected); pickup orders
  invoiced when collected.
- **Kiosk** `/ros/kiosk`: touch-to-start, eat in / take away, big menu and add-ons, live total with offers, order number
  "K12 — pay at the counter"; saved as a held POS sale the cashier completes (kitchen starts after payment); idle reset.
- Add-ons with an item (Extra Cheese, Roti) become their own line → their recipe is deducted (modifier recipes, phase 5 gap).
- Restaurant Settings: online ordering / kiosk switches, online price list, delivery fee + item, minimum order, kiosk idle.
- Sidebar links can open public pages in a new tab. Tests: 25 backend + Vitest passing.

## 2026-10-21 — Phase 10: owner dashboard & analytics (+ rider check-in, Connections)

- **Owner dashboard** `/ros/restaurant/dashboard` (live): net sales / orders / avg ticket vs yesterday, food cost %, open and
  late orders, ticket time, tables, wastage, alerts (FBR / stock failures, late kitchen, deliveries without a rider), sales by
  hour (today vs yesterday), channel mix, top dishes, kitchen load per station, riders & deliveries, open orders, low stock /
  sold out.
- **Reports** `/ros/restaurant/reports` + desk script reports: **Restaurant Sales Analysis** (by channel, order type, branch,
  item, category, hour, day part, weekday, date, cashier — net, food cost, margin), **Kitchen Performance** (wait / cook /
  total per station, late dishes, ticket times by type, delivery times, rider performance), **Menu Engineering**
  (Kasavana–Smith Star / Plowhorse / Puzzle / Dog, popularity × margin scatter), **Customer Insights** (new vs returning,
  retention, lifetime value). CSV export everywhere; chart palette validated for colour-blind safety in light and dark.
- **Rider check-in**: going on / off duty in the rider app records an HRMS Employee Checkin (IN / OUT) at the phone's position
  (HR Settings' geolocation rules apply); dispatch shows "in since".
- **Connections tab** now filled for every screen: dashboards for the restaurant doctypes and overrides for POS Invoice,
  Sales Invoice, POS Opening / Closing Shift, POS Profile, POS Offer / Coupon, POS Cash Movement, Customer, Item, Employee.
- Tests: 22 backend + Vitest passing.

## 2026-10-21 — Phase 7: delivery riders & tracking (own riders + Foodpanda)

- **Foodpanda orders invoiced when delivered** (owner's choice), like own deliveries.
- **Rider** (Employee + login, role Delivery Rider), **Delivery Assignment**, **Rider Location Log** (7 days).
- **Assignment**: a delivery reaching Ready is offered to the nearest / least-busy available rider (setting) or waits for
  manual dispatch; a declined offer goes to the next rider.
- **Rider app** `/ros/rider` (phone): duty switch, offers (accept / decline), call, route in Google Maps, picked up,
  delivered with the customer's delivery code or a photo, cash collected; live GPS while on duty.
- **Cash on delivery**: Payment Entry against the invoice into "Rider Cash"; **handover** at the counter = Journal Entry
  into the cashier's open shift (the shift close expects it).
- **Foodpanda riders**: tracked from Foodpanda's updates (mock: rider assigned at Ready, rides to the customer after
  pickup); setting to deliver Foodpanda orders with own riders instead.
- **Dispatch map** `/ros/dispatch`: riders (own + Foodpanda) and drop-offs on OpenStreetMap, waiting / on the way lists,
  manual assignment, rider cash handover, **phone delivery orders** (map pin), demo order button.
- **Customer tracking page** `/ros/track/<key>` (public): steps, rider on the map, ETA, delivery code, cash to pay.
- KDS delivery cards show the rider. Tests: 20 backend + Vitest passing.

## 2026-10-21 — Phase 5 (stock control) + delivery completion

- **Delivery orders finished end to end**: Foodpanda orders are invoiced on acceptance to the Foodpanda customer (Foodpanda
  price list, FBR-reported, a receivable from Foodpanda); KDS Ready → Picked Up → (Out for Delivery →) Delivered; own
  cash-on-delivery orders are invoiced at Delivered (cash received at the counter via Receive payment); ingredients leave
  the kitchen at Picked Up.
- **Sold-out menu items**: portions left per dish from kitchen stock and its recipe; the POS terminal and table orders show
  the count and lock a dish at 0 ("SOLD OUT"); sales and table rounds of sold-out dishes are refused (setting); changes are
  pushed to Foodpanda (mock) and shown on the KDS "86" list with running-low items.
- **Wastage Log** (reason, items, cost) → Material Issue from the kitchen; React screen + desk.
- **Ingredient Variance** report (script report + React page): opening, received, recipe usage, wastage, other issues,
  expected vs counted (Stock Reconciliation), variance qty / % / value — the theft & waste control.
- Stock Entries are tagged with their source (Recipe / Wastage + reference) for the report.
- Tests: 17 backend (+ Foodpanda invoice/delivery, cash on delivery, sold-out, wastage + variance), Vitest — all passing.

## 2026-10-20 — Phase 3 + 4 core: orders, KDS, table map, tax, FBR, integrations

- **Restaurant Order** (operational order, every channel) with its state machine; every counter sale opens one, lines routed to
  kitchen stations; invoice cancel voids it.
- **Kitchen Display** `/ros/kds`: status board (Placed / Preparing / Ready / Completed), cards coloured by order type, progress,
  age timers (amber / red from settings), "+ New Items" vs "Already Ordered" rounds, tap a line to bump, footer to advance, recall,
  print ticket, station filter, all-day counts, sound, Socket.IO live updates, past orders.
- **Table map** `/ros/pos/tables`: floor plan by area, seat guests, take order / add rounds (sent to the KDS), view order with bill,
  settle (POS Invoice via the POS backend, receipt printed), move, print pre-bill, end sitting.
- **Recipe stock deduction** in a background job when an order completes (per line, so later rounds deduct too); failures kept
  on the order and retried hourly.
- **Restaurant Settings**: sales tax tick (default 18%, on top / included), invoice mode (default **POS Invoice**, also sets
  ERPNext's POS Settings), payment modes (Cash → Card → Bank Transfer), FBR, Foodpanda / WhatsApp (Mock), KDS, stock — saved
  settings sync to every counter.
- **FBR POS integration** (Mock until registered): fiscal number per sale / return, Rs 1 fee row, QR code + FBR number on the
  receipt, retries, Integration Request log. **Company logo** at the top of receipts (demo logo for Saffron Grill).
- **Foodpanda** adapter (webhook, normaliser, simulator) and **WhatsApp** adapter, both Mock.
- Tests: 13 backend (counter, offers, offline, coupon, return / close, profit, KDS + recipe stock, station filter, Foodpanda,
  table sitting, tax switch, FBR) and Vitest unit tests — all passing.

## 2026-10-20 — Phase 1 (foundation), part 2 + Phase 2 (menu, recipes, inventory)

Built (on the defaults in docs/OPEN_QUESTIONS.md, swappable)
- DocTypes: Restaurant Branch, Kitchen Station, Floor Area, Restaurant Table, Menu Modifier Group (+ Menu Modifier),
  Restaurant Settings (single), with validation (branch warehouses / cost center belong to its company, modifier limits)
  and `station_for_item` routing for the KDS. React screens for all of them under /ros/restaurant/*.
- `bench ros-setup`: company Saffron Grill (fictional, PKR, setup wizard), Card Clearing / Back Office Cash accounts,
  Cash / Credit Card modes, Central Store → Gulberg Kitchen, cost center, walk-in customer, POS Profile "Gulberg Counter"
  with POS Awesome settings, branch Gulberg, cashier + manager users (password in ~/.restaurant-site-secrets).
- `bench ros-demo`: 35 recipe dishes + 3 bottled drinks with photos (Wikimedia Commons, credits kept), 37 ingredients from
  4 fictional suppliers, one default BOM per dish, opening stock, reorder levels (central → Purchase, kitchen → Transfer),
  Foodpanda price list (+15%), 4 POS Offers + coupon WELCOME10, 6 KDS stations, 18 tables, 3 modifier groups.
- Procurement: `services/procurement.py` — pending purchase requests → one draft PO per default supplier (daily, after
  ERPNext's reorder job; `bench ros-procure` runs both now).
- Tests: `restaurant_os/tests/test_pos.py` (offers, sale on the shift, stock, offline replay, coupon use, return, cash
  movement, close with zero difference, profit) and Vitest unit tests (3 passing). CI workflow: ruff, type-check, Vitest, build.
- Production build: `pnpm build` → restaurant_os/public/frontend + www/ros.html (POS at /ros/pos on :8008).

Verified on restaurant.localhost: ros-setup + ros-demo seed cleanly; 6/6 backend tests pass; in the browser a shift was
opened, a karahi sold with the free-raita offer (cash 1,000, change 300), and the shift closed with zero difference.
Fixed on the way: non-group customer group / territory fallback, opening stock qty, bread as slices, half plates (Plate
allows fractions), payments set after ERPNext refills POS payment rows, closing counted in closing_amount_in_currency,
dish cost from the default BOM (profit was overstated for non-stock dishes), menu groups as the terminal's category chips.

## 2026-10-20 — Phase 1 (foundation), part 1

Works
- Frappe app `restaurant_os` (bench `new-app`, branch `develop`), hooks: required apps erpnext / hrms / posawesome / mm_core,
  `/ros/*` React route, bell alert on every counter sale.
- `setup_restaurant.sh`: site `restaurant.localhost` (:8008) with erpnext, hrms, posawesome, mm_core, restaurant_os.
- `restaurant_os.api.pos`: the MicroMax POS backend ported onto POS Awesome — POS Opening / Closing Shift, Sales Invoice
  sales tagged with the shift, POS Offer / POS Coupon applied server-side, POS Cash Movement, idempotent offline sync on
  `posa_client_request_id`, gross profit and margin on the dashboard, shift summary and X/Z reports.
- React monorepo (pnpm): `@ros/ui` (MicroMax design tokens + Tailwind preset), `@ros/api`, `@ros/types`, `@ros/pos`
  (MicroMax POS pages, sidebar / header shell, POS Awesome DocType screens for shifts, offers, coupons, cash movements).
  Type-checks clean.
- Proposals for review: docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/OPEN_QUESTIONS.md.

Next
- Run the setup script (needs the MariaDB root password), finish the setup wizard, and test the POS end to end.
- After review of the proposals: CI (lint, type-check, tests), then Phase 2 (menu, recipes, inventory, seed data).
