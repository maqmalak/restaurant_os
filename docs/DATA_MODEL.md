# Restaurant OS — Data model (proposal for review)

## Standard DocTypes reused

| Need | DocType | Notes |
|---|---|---|
| Company / brand | Company | one Company per legal entity |
| Branch | Cost Center + Warehouse set (+ **Restaurant Branch**, below) | see decision B1 |
| Menu items, categories | Item, Item Group | menu items are sales items; ingredients are stock items |
| Recipes | BOM | one default BOM per menu item = its recipe (incl. modifier recipes) |
| Prices per channel / branch | Price List + Item Price | e.g. `Dine-in`, `Delivery`, `Foodpanda` price lists |
| Counter / channel config | POS Profile (+ POS Awesome fields) | one per counter |
| Shifts, cash | POS Opening Shift, POS Closing Shift, POS Cash Movement | POS Awesome |
| Offers, coupons | POS Offer, POS Coupon, Loyalty Program | POS Awesome + ERPNext |
| Financial document | **Sales Invoice** (is_pos) | POS Awesome default; POS Invoice optional per profile |
| Procurement | Material Request, Purchase Order, Purchase Receipt, Supplier | reorder → MR → PO |
| Stock moves | Stock Entry (transfer, issue), Stock Reconciliation | kitchen replenishment, wastage, counts |
| People | Customer (dedupe by mobile), Employee | riders are Employees |

## Custom DocTypes (Proposed)

| DocType | Key fields | Why custom |
|---|---|---|
| **Restaurant Branch** | company, cost_center, kitchen_warehouse, store_warehouse, pos_profiles (table), geo, delivery radius, SLA minutes | one record tying the branch's standard docs together |
| **Floor Area** | branch, name | dine-in layout |
| **Restaurant Table** | branch, floor_area, seats, shape/x/y, status (Free / Occupied / Reserved / Cleaning) | dine-in |
| **Kitchen Station** | branch, name (Grill, Fryer, Drinks…), printer (fallback), item_groups / items | KDS routing |
| **Menu Modifier Group** | name, min / max select, required | add-ons / choices |
| **Menu Modifier** (child) | modifier, price, bom (optional), station | price + recipe of an add-on |
| **Restaurant Order** | channel, order_type, branch, table, customer, items (child: item, qty, modifiers JSON, notes, station, status), status + `<status>_at` stamps, rider, address/geo, payment_status, sales_invoice, external_order_id, client_order_uuid (idempotency) | the operational order, separate from the financial document |
| **KDS Ticket** | order, station, items, status, priority, bumped_at | one per order × station |
| **Rider** | employee, branch, vehicle, on_duty, last_lat/lng, last_seen | rider app identity |
| **Delivery Assignment** | order, rider, status, offered_at/accepted_at/picked_at/delivered_at, distance, proof (photo / OTP), cash_collected | dispatch + COD |
| **Order Review** | order, customer, rating overall/food/delivery, comment, photo, items (child ratings) | reviews |
| **Wastage Log** | branch, warehouse, items, reason → Stock Entry (Material Issue) | anti-theft / variance |
| **Restaurant Settings** (single) | age thresholds, auto-assign rule, stock deduction moment, review delay, aggregator mode | config |

## Decisions to confirm

- **B1 Branch** = Cost Center + Warehouse set inside a Company, grouped by a *Restaurant Branch* record. Separate Companies
  only for separate legal entities. (Alternative: one Company per branch — heavier accounting, simpler isolation.)
- **B2 Modifiers** = custom *Menu Modifier Group / Modifier* with optional BOM, not Item Variants (variants explode the item
  list and can't stack add-ons).
- **B3 Stock deduction** = background job on order *Completed / Delivered* posting a Stock Entry (Material Issue) of the
  BOM ingredients (+ modifier BOMs) from the branch kitchen warehouse. The Sales Invoice then sells the menu item as a
  non-stock item. (Alternative: invoice-driven via Product Bundle / packed items — see OPEN_QUESTIONS #7.)
- **B4 Menu availability** = computed per branch after each deduction / stock receipt: unavailable when any ingredient can't
  cover one more portion; cached and pushed over realtime to every channel.
