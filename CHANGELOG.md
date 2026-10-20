# Changelog

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
