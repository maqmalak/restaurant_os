# Hardening (Phase 11)

This page covers the security review, the end-to-end test, the load test, and how to monitor a running site.
Last reviewed: 2026-10-21.

## 1. Security review

### Who can call what

All 94 whitelisted methods were checked. Every one now has one of these access checks on the server; none depends on the
React app hiding a button.

| Area | Who | Check |
|---|---|---|
| Counter (`api.pos`, 37 methods) | Users on the POS Profile's user list, or a manager (System / Sales / Accounts Manager) | `_guard(pos_profile)`. Methods that act on a named sale check that sale's counter. Document permissions still apply. |
| Kitchen display and table map (`api.kds`, `api.tables`) | Read or write permission on Restaurant Order | `_check()` |
| Dispatch (`api.riders`: dispatch, assign, handover, phone orders) | Write permission on Restaurant Order | `_staff()` |
| Rider app (`api.riders`: me, set_duty, accept, reject, pickup, deliver, location) | The signed-in rider only | `my_rider()` plus a check that the rider owns the assignment. Postings then run as system, because riders can't read accounts. |
| Owner dashboard and reports (`api.analytics`) | Managers and Stock Manager | `_check()` |
| Campaigns and review requests | System / Sales Manager | `frappe.only_for` |
| Guest: menu, quote, place order, kiosk, track, review, loyalty, payment page | Anyone | Rate limited (10–120 per minute per IP). Inputs are re-priced on the server: the browser never sets a price. Orders are reached only by a random 12-character tracking key. |
| Payment webhook | Payment provider | HMAC-SHA256 signature using the gateway secret. In Mock mode it always refuses, because test payments go through `mock_pay`. |
| Foodpanda webhook | Foodpanda | HMAC-SHA256 signature using the webhook secret. In Mock mode it needs a signed-in manager. |

### Manager approval

The spec says voids and discounts above a threshold need a manager. Settings → Manager Approval controls this:

- **Discounts.** A discount the cashier types (line and bill together) above **10%** of the bill needs a manager. POS
  Offers and coupons don't count: they are pre-approved promotions.
- **Returns and refunds** always need a manager (this can be switched off).
- **How it works at the counter.** The terminal shows a manager sign-in, then retries the sale with the manager's details.
  The server checks the password and the role, and adds a comment on the invoice: "Discount 25% — approved by
  Restaurant Manager (cashier …)".
- **Wrong passwords.** After 5 wrong attempts in 10 minutes, that cashier is locked out of approvals until the window passes.
- A manager doing the action themselves is not asked again.

### Audit trail

These DocTypes keep a change history (Version) for every edit:
- Restaurant Order, Wastage Log, Delivery Assignment, Rider, Order Review, Campaign, settings and masters.
- From ERPNext and POS Awesome: POS Invoice, Sales Invoice, Stock Entry, Stock Reconciliation, POS Offer, POS Coupon,
  POS Profile, POS Cash Movement, Payment Entry, Item Price and Loyalty Program. These are switched on by
  `setup.install.track_changes` on every migrate.

### Other findings, all fixed

- `foodpanda_order` called `frappe.set_user("Administrator")` inside the request. It now uses `as_system()`, which puts
  the caller's session back afterwards.
- Filters written as `["in", ["", None]]` never match NULL in Frappe. In six places this silently skipped records:
  review requests, loyalty enrolment, unassigned deliveries, open-shift lookup, channel backfill and the dashboard
  count. All now use `["is", "not set"]`.
- Every document form asked for workflow transitions, even for DocTypes with no workflow, which logged an error each
  time. It now asks only when an active workflow exists.

### Known limits, accepted for now

- **Points balance by phone.** `api.online.loyalty(phone)` tells a guest the points balance for a phone number. It is
  rate limited (20 per minute), but it does show whether a number is a customer. Switch it off with Settings → Customers
  Can Spend Points Online if that matters.
- **Mock modes skip the real checks.** In Mock mode (payment gateway, Foodpanda, WhatsApp, FBR) nothing reaches a real
  provider, and the signature checks only apply once Live mode and secrets are set.
- **Offline approval.** A sale rung up offline with a large discount can't be approved on the device. It fails at sync,
  shows in the Sync panel, and has to be redone with a manager present.

## 2. End-to-end test: the nine steps on every channel

`restaurant_os/tests/test_e2e.py` places one Chicken Tikka from each channel:
- POS counter
- Dine-in table
- Web delivery
- Kiosk (completed by the cashier)
- Foodpanda
- Phone delivery

It then checks each step automatically:

1. **Warehouse stock and 2. kitchen stock.** The recipe ingredient is in the branch kitchen.
2. **Order placed (step 3).** One Restaurant Order per channel, each with the correct channel.
3. **KDS (step 4).** Each order is on the board straight away. The board call must take under 1 s.
4. **Rider (step 5).** Own-rider deliveries are offered to an on-duty rider the moment they are Ready.
5. **Delivered (step 6).** The rider accepts, picks up and delivers with the code and cash. Others are bumped to
   Completed or Delivered, and the table is settled and freed. Every order ends invoiced.
6. **Review (step 7).** Every customer rates the order. The 1-star review notifies the managers.
7. **Stock (step 8).** Exactly 0.35 kg Chicken Whole per order leaves *Gulberg Kitchen*, which is 6 × 0.35 in total.
   Below the reorder level, ERPNext's auto-reorder raises a Material Request (transfer) for the kitchen.
8. **Reports (step 9).** All six channels appear in sales by channel. The dashboard shows the reviews and the open low
   rating, and the kitchen report has data.

The test caught three real bugs, all fixed:
- `set_status` set its "deduct stock" and "offer to a rider" flags *after* saving the order, so they only took effect on
  the next save. A dine-in sitting that ended never issued its ingredients.
- The rider app saved an older copy of the order, which cleared the "ingredients issued" marks. Deliveries were then
  deducted twice, once at Picked Up and again at Delivered. The order now keeps those marks on every save.
- A kiosk order completed at the counter was recorded as a POS sale. It is now channel Kiosk, with eat-in or take-away
  taken from its note.

Run the tests:

```bash
bench --site restaurant.localhost run-tests --app restaurant_os                     # all: 36 unit + the e2e test
bench --site restaurant.localhost run-tests --app restaurant_os --module restaurant_os.tests.test_e2e
```

## 3. Load test

`restaurant_os/tests/load.py` runs N rounds. Each round is one counter sale (preview, then submit) and one online order
(quote, place, KDS board, one bump, tracking). Everything runs in one transaction that is **rolled back**, so the demo
data is untouched.

```bash
echo 'from restaurant_os.tests.load import run; run(40)' | bench --site restaurant.localhost console
```

Results on 2026-10-21, 40 rounds on the dev laptop (times in ms):

| Call | p50 | p95 | Budget |
|---|---|---|---|
| POS checkout (`pos.submit_invoice`) | 123 | 204 | 300 (spec: POS checkout < 300 ms) |
| Online order placed → on the KDS | 70 | 113 | 1000 (spec: on the KDS < 1 s) |
| `online.quote` | 30 | 55 | 500 |
| `pos.preview` | 22 | 32 | 300 |
| `kds.board` | 9 | 16 | 1000 |
| `kds.advance` | 6 | 10 | 300 |
| `riders.track` | 1 | 2 | 300 |

These numbers are application time (Python plus MariaDB). Under concurrency, throughput depends on the web server:
`bench serve` is a single-threaded dev server. In production, run gunicorn with (2 × cores + 1) workers behind nginx, plus
the `socketio` process for realtime (see SETUP.md → Production).

## 4. Monitoring

- **Health check:** `GET /api/method/restaurant_os.api.health.ping` (guest, 120 per minute). It returns `status`
  (`ok` or `degraded`), database response time, Redis status, and a backlog:
  - stock deductions that failed
  - FBR posts that failed
  - online orders awaiting payment
  - errors in the last hour

  Point the load balancer or uptime monitor at it. Alert on `degraded`, or when `last_order_seconds_ago` grows during
  opening hours.
- **Errors:** every background failure (stock deduction, FBR, integrations) is written to the Frappe **Error Log**, and
  retried every hour (`stock_deduction.retry_failed`, `fbr.retry_failed`).
- **Integration traffic** (Foodpanda, WhatsApp, payments, FBR) is logged as **Integration Request** records with the payload.
