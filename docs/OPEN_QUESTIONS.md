# Open questions

## Answered by the owner (2026-10-20) — built

| # | Question | Answer → what was built |
|---|---|---|
| 1 | Sales tax | Setup tick **Apply Sales Tax**, default **18%**, **added on top of** or **included in** the item price, switchable; synced to every counter's tax template (Restaurant Settings) |
| 1b | FBR | **FBR POS integration**: every counter sale / return reported, FBR invoice number + **QR code on the receipt**, Rs 1 FBR POS fee per invoice; **Mock** until the POS is registered (Sandbox / Live take the URL + token) |
| 2 | Payment modes | **Cash** (default), **Card**, **Bank Transfer** — in that order on every counter |
| 3 | Foodpanda | Adapter with **Mock** mode (simulator on the KDS) and Live credential fields; webhook `restaurant_os.api.integrations.foodpanda_order` |
| 4 | WhatsApp / SMS | Adapter with **Mock** mode (messages logged as Integration Requests); Live provider fields (Meta Cloud API / Twilio / Frappe WhatsApp) |
| 5 | Branches | Multi-branch; the existing **Gulberg** branch is the **main branch** |
| 6 | KDS | Status-board **Kitchen Display** (Placed / Preparing / Ready / Completed), station filter, item bump, recall, all-day counts, sound, live updates; plus the **dine-in table map** |
| 7 | Demo company | Kept: fictional **Saffron Grill** (with logo printed at the top of receipts) |
| 7b | Stock deduction | **Background job** on order completion (BOM recipe → Stock Entry from the branch kitchen); on a bench without a worker it runs immediately |
| 10 | Invoice mode | **POS Invoice** (merged into Sales Invoices when the shift closes); switchable in Restaurant Settings |
| 11 | Repository | Push `apps/restaurant_os` over github.com/maqmalak/restaurant (the old setup app kept on branch `legacy-restaurant-setup`) |
| 12 | Docker | **Not required** (owner, 2026-10-21): local dev on the shared bench (`setup_restaurant.sh`), production with `bench setup production` (docs/SETUP.md). The brief's Docker Compose deliverable is dropped |

## Still open

- **Receipt printer / KDS hardware** models (browser printing on 80 mm thermal assumed). Customer display: any second monitor on the counter PC (`/ros/display`); a pole display on a separate device would need the realtime channel instead.
- **FBR**: POS ID, access token and the exact PostData / IMS URL from PRAL; the PCT code to send for restaurant items.
- **PRA** (Punjab Revenue Authority) — restaurant services in Punjab are usually under PRA rather than FBR; the same adapter can report to PRA if needed.
- **Foodpanda** live API access and the product mapping (remote codes = item codes today).
- **WhatsApp** provider account and message templates.
- Should cashiers pick **manual POS Offers** in the React terminal (today: automatic + coupon offers)?
