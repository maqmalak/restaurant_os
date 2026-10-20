# Restaurant OS — API

All methods are `@frappe.whitelist()` (session auth + CSRF), called as `POST /api/method/<path>` (writes) or `GET` (reads).
Payload strings marked JSON are JSON-encoded.

## POS — `restaurant_os.api.pos` (done)

| Method | Args | Returns / effect |
|---|---|---|
| `get_context` | pos_profile? | profiles the user may sell from, open POS Opening Shift, profile settings (incl. `invoice_doctype`) |
| `open_shift` (POST) | pos_profile, balances JSON `[{mode_of_payment, opening_amount}]` | POS Opening Shift name (POS Awesome `create_opening_voucher`) |
| `preview` (POST) | data JSON (cart) | ERPNext totals with POS Offers applied; rows flag offers in `pricing_rules` |
| `submit_invoice` (POST) | data JSON: pos_profile, customer, items, payments, coupon_code, discount_*, redeem_points, hold, draft, credit, write_off, offline_id | Sales Invoice (or POS Invoice) name, paid / change / outstanding; idempotent on `offline_id` → `posa_client_request_id` |
| `sync_invoices` (POST) | invoices JSON list | per offline id: ok + name, or error |
| `held_invoices`, `load_invoice`, `delete_held` (POST) | pos_profile / name | drafts |
| `recent_orders`, `invoices` | pos_profile, status, dates, q, paging | invoice manager rows, totals, tab counts |
| `return_invoice` (POST), `returnable_items` | name, items JSON {row: qty}, mode_of_payment | return in the current shift |
| `receipt` | name | thermal receipt data |
| `customer_info`, `create_customer` (POST) | customer, company / data JSON | credit, loyalty, last purchase / new customer + contact |
| `item_options`, `qty_presets`, `offline_bundle` | item / profile | UOMs, batches, serials; offline cache |
| `offers`, `check_coupon` | pos_profile / code | live POS Offers; POS Coupon check |
| `shift_summary`, `close_shift` (POST) | counted JSON {mode: amount} | cash-up; POS Closing Shift (POS Awesome make / submit) |
| `shift_report`, `last_shift_report` | opening? | X / Z report incl. profit and margin |
| `receive_payment` (POST) | customer, amount, mode, reference_no | Payment Entry (reference_no = shift) |
| `cash_setup`, `record_cash` (POST), `cash_movements`, `cancel_cash` (POST) | direction in / out / deposit, party or account | Payment Entry, POS Cash Movement or Journal Entry |
| `stock_setup`, `counter_stock`, `source_stock`, `receive_stock` (POST), `stock_receipts`, `stock_receipt_detail` | profile | counter stock and transfers / receipts |
| `alerts` | pos_profile | bell items (stock, held, credit, long shift, coupons) |
| `dashboard` | company, from_date, to_date, pos_profile | KPIs incl. `profit`, `margin`, series, mix, top items with profit |

Doc events: `Sales Invoice` / `POS Invoice` `on_submit` → `notify_invoice` (Notification Log alert, counter sales only).

## Kitchen — `restaurant_os.api.kds`

| Method | Args | Returns / effect |
|---|---|---|
| `board` | branch?, station?, past? | cards per column (Placed / Preparing / Ready / Completed), stations, counts, all-day totals, KDS settings |
| `advance` (POST) | order, station? | Placed → Preparing → Ready → Completed (Delivery → Picked Up); with a station only its lines move |
| `bump_item` (POST) | order, row | one line Ready (or back to Preparing) |
| `recall` (POST) | order | back to Preparing |
| `ticket` | order | paper-ticket data |

## Dine-in — `restaurant_os.api.tables`

`floor(branch?)`, `seat(table, guests)`, `send(table, items JSON, notes?)` (a kitchen round), `view(table)` (rounds + bill),
`settle(table, payments JSON, customer?, coupon_code?)` (POS Invoice through `pos.submit_invoice`), `move(table, to_table)`,
`end_sitting(table)`.

## Integrations — `restaurant_os.api.integrations`

`foodpanda_order` (guest webhook, HMAC-checked in Live), `simulate_foodpanda_order(items)` (Mock), `test_whatsapp(to, text)`.
FBR reporting runs on invoice submit (`integrations/tax_authority/fbr.py`); every call is an Integration Request.

## Stock control

`restaurant_os.services.availability.board(branch?)` — portions left per menu item, sold-out list. ERPNext's
`point_of_sale.get_items` is wrapped (hooks `override_whitelisted_methods`) to add `ros_recipe` + `actual_qty` (portions) for
recipe dishes. Script report **Ingredient Variance** (branch, from_date, to_date). Wastage Log submit → Material Issue.
Delivery: `kds.advance` continues Picked Up → Out for Delivery → Delivered (Foodpanda: Picked Up → Delivered);
`services.delivery.invoice_for_order` (Foodpanda on accept, own delivery at Delivered).

## Realtime events

`ros_kds` {event, order, branch, status} — any order change (KDS and table map refresh); `ros_tables` {table, branch};
`ros_availability` {branch, sold_out, changed} — a dish sold out / back.
