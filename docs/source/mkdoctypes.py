"""Write restaurant_os DocType JSON + controller stubs (Phase 2 masters)."""
import json, os, sys, re
ROOT = sys.argv[1]  # .../restaurant_os/restaurant_os (module folder)
MOD = "Restaurant OS"
NOW = "2026-10-20 12:00:00.000000"

def F(fieldname, fieldtype, label=None, **kw):
    d = {"fieldname": fieldname, "fieldtype": fieldtype}
    if label: d["label"] = label
    d.update(kw)
    return d

# Counter / floor staff (Sales User) work orders, tables and deliveries; everything else is read-only for them.
STAFF_WRITE = {"Restaurant Order", "Restaurant Table", "Delivery Assignment"}

def perms(manager=("System Manager", "Sales Manager"), users=("Sales User", "Stock User"), name=None):
    out = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "email": 1, "share": 1} for r in manager]
    for r in users:
        row = {"role": r, "read": 1, "report": 1, "print": 1}
        if name in STAFF_WRITE and r == "Sales User":
            row.update({"write": 1, "create": 1})
        out.append(row)
    return out

def write(name, fields, istable=0, issingle=0, autoname=None, title_field=None, desc="", sort="modified", search=None, track=1, extra=None):
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    d = {"doctype": "DocType", "name": name, "module": MOD, "custom": 0, "engine": "InnoDB", "creation": NOW, "modified": NOW,
         "modified_by": "Administrator", "owner": "Administrator", "description": desc,
         "istable": istable, "issingle": issingle, "editable_grid": 1 if istable else 0,
         "field_order": [f["fieldname"] for f in fields], "fields": fields,
         "permissions": [] if istable else perms(name=name), "sort_field": sort, "sort_order": "DESC", "states": [],
         "track_changes": 0 if istable else track, "row_format": "Dynamic", "actions": [], "links": []}
    if autoname: d["autoname"] = autoname
    if title_field: d["title_field"] = title_field; d["show_title_field_in_link"] = 1
    if search: d["search_fields"] = search
    if extra: d.update(extra)
    folder = os.path.join(ROOT, "doctype", slug); os.makedirs(folder, exist_ok=True)
    open(os.path.join(folder, "__init__.py"), "w").close()
    json.dump(d, open(os.path.join(folder, slug + ".json"), "w"), indent=1); open(os.path.join(folder, slug + ".json"), "a").write("\n")
    cls = name.replace(" ", "")
    py = os.path.join(folder, slug + ".py")
    if not os.path.exists(py):
        open(py, "w").write(f'# Copyright (c) 2026, MicroMax and contributors\n# For license information, please see license.txt\n\nfrom frappe.model.document import Document\n\n\nclass {cls}(Document):\n\tpass\n')
    return slug

os.makedirs(os.path.join(ROOT, "doctype"), exist_ok=True)
open(os.path.join(ROOT, "doctype", "__init__.py"), "a").close()

# ---- children
write("Restaurant Branch POS Profile", [
    F("pos_profile", "Link", "POS Profile", options="POS Profile", reqd=1, in_list_view=1),
    F("channel", "Select", "Channel", options="POS\nDine-in\nTakeaway\nDrive-thru\nKiosk\nWeb\nApp\nFoodpanda", default="POS", in_list_view=1),
], istable=1)
write("Kitchen Station Item Group", [F("item_group", "Link", "Item Group", options="Item Group", reqd=1, in_list_view=1)], istable=1)
write("Kitchen Station Item", [F("item", "Link", "Item", options="Item", reqd=1, in_list_view=1),
                                F("item_name", "Data", "Item Name", fetch_from="item.item_name", read_only=1, in_list_view=1)], istable=1)
write("Menu Modifier Group Item", [F("item", "Link", "Menu Item", options="Item", reqd=1, in_list_view=1),
                                    F("item_name", "Data", "Item Name", fetch_from="item.item_name", read_only=1, in_list_view=1)], istable=1)
write("Menu Modifier", [
    F("modifier_name", "Data", "Modifier", reqd=1, in_list_view=1),
    F("price", "Currency", "Extra Price", in_list_view=1, description="Added to the menu item's price"),
    F("item", "Link", "Add-on Item", options="Item", in_list_view=1, description="Optional: an item sold / stocked for this add-on"),
    F("bom", "Link", "Recipe (BOM)", options="BOM", description="Ingredients consumed when this modifier is chosen"),
    F("station", "Link", "Kitchen Station", options="Kitchen Station"),
    F("is_default", "Check", "Default"),
], istable=1)

# ---- masters
write("Restaurant Branch", [
    F("branch_name", "Data", "Branch Name", reqd=1, unique=1, in_list_view=1),
    F("company", "Link", "Company", options="Company", reqd=1, in_list_view=1, in_standard_filter=1),
    F("cost_center", "Link", "Cost Center", options="Cost Center", description="Branch P&L"),
    F("column_break_a", "Column Break"),
    F("disabled", "Check", "Disabled"),
    F("phone", "Data", "Phone", options="Phone"),
    F("section_stock", "Section Break", "Stock"),
    F("store_warehouse", "Link", "Central Store Warehouse", options="Warehouse", description="Procurement lands here"),
    F("column_break_b", "Column Break"),
    F("kitchen_warehouse", "Link", "Kitchen Warehouse", options="Warehouse", reqd=1, in_list_view=1, description="Recipes are consumed from here"),
    F("section_delivery", "Section Break", "Location & Delivery"),
    F("address", "Small Text", "Address"),
    F("latitude", "Float", "Latitude", precision="6"),
    F("longitude", "Float", "Longitude", precision="6"),
    F("column_break_c", "Column Break"),
    F("delivery_radius_km", "Float", "Delivery Radius (km)", default="5"),
    F("delivery_sla_minutes", "Int", "Delivery SLA (minutes)", default="45"),
    F("prep_sla_minutes", "Int", "Kitchen SLA (minutes)", default="15"),
    F("section_channels", "Section Break", "Counters & Channels"),
    F("pos_profiles", "Table", "POS Profiles", options="Restaurant Branch POS Profile"),
], autoname="field:branch_name", desc="A restaurant branch: its company, cost center, central store and kitchen warehouses, and counters.")

write("Kitchen Station", [
    F("station_name", "Data", "Station", reqd=1, in_list_view=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_list_view=1, in_standard_filter=1),
    F("column_break_a", "Column Break"),
    F("color", "Color", "Colour"),
    F("printer", "Data", "Fallback Printer", description="Only used when the KDS screen is offline"),
    F("disabled", "Check", "Disabled"),
    F("section_routing", "Section Break", "Routing", description="Order lines go to the station whose items / item groups match (items win over groups)."),
    F("item_groups", "Table", "Item Groups", options="Kitchen Station Item Group"),
    F("items", "Table", "Items", options="Kitchen Station Item"),
], autoname="format:{branch}-{station_name}", title_field="station_name", desc="A KDS station (grill, fryer, drinks…).")

write("Floor Area", [
    F("area_name", "Data", "Area", reqd=1, in_list_view=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_list_view=1, in_standard_filter=1),
], autoname="format:{branch}-{area_name}", title_field="area_name", desc="A dining area (hall, family section, rooftop).")

write("Restaurant Table", [
    F("table_number", "Data", "Table", reqd=1, in_list_view=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_list_view=1, in_standard_filter=1),
    F("floor_area", "Link", "Floor Area", options="Floor Area", in_list_view=1, in_standard_filter=1),
    F("seats", "Int", "Seats", default="4", in_list_view=1),
    F("column_break_a", "Column Break"),
    F("status", "Select", "Status", options="Free\nOccupied\nReserved\nCleaning", default="Free", in_list_view=1, in_standard_filter=1),
    F("shape", "Select", "Shape", options="Square\nRound\nRectangle", default="Square"),
    F("pos_x", "Int", "Floor Plan X"),
    F("pos_y", "Int", "Floor Plan Y"),
    F("disabled", "Check", "Disabled"),
    F("section_sitting", "Section Break", "Current Sitting"),
    F("guests", "Int", "Guests", read_only=1),
    F("seated_at", "Datetime", "Seated At", read_only=1),
    F("column_break_s", "Column Break"),
    F("current_order", "Link", "Current Order", options="Restaurant Order", read_only=1),
], autoname="format:{branch}-{table_number}", title_field="table_number", desc="A dine-in table on the floor plan.")

write("Menu Modifier Group", [
    F("group_name", "Data", "Modifier Group", reqd=1, unique=1, in_list_view=1),
    F("min_select", "Int", "Min Choices", default="0", in_list_view=1),
    F("max_select", "Int", "Max Choices", default="1", in_list_view=1, description="0 = no limit"),
    F("column_break_a", "Column Break"),
    F("required", "Check", "Required"),
    F("disabled", "Check", "Disabled"),
    F("section_modifiers", "Section Break", "Choices"),
    F("modifiers", "Table", "Modifiers", options="Menu Modifier", reqd=1),
    F("section_items", "Section Break", "Applies To"),
    F("items", "Table", "Menu Items", options="Menu Modifier Group Item"),
], autoname="field:group_name", desc="Add-ons / choices offered with menu items (spice level, extra cheese, naan or roti).")

write("Restaurant Settings", [
    F("company", "Link", "Company", options="Company"),
    F("default_branch", "Link", "Main Branch", options="Restaurant Branch", description="New counters and the dashboard default to it"),
    F("column_break_a", "Column Break"),
    F("invoice_mode", "Select", "Counter Sales Posted As", options="POS Invoice\nSales Invoice", default="POS Invoice",
      description="POS Invoice: merged into Sales Invoices when the shift closes (POS Awesome). Sales Invoice: posted per sale."),
    F("section_tax", "Section Break", "Sales Tax"),
    F("apply_sales_tax", "Check", "Apply Sales Tax", default="1", description="Untick to sell without sales tax on every counter"),
    F("sales_tax_rate", "Percent", "Sales Tax Rate", default="18", depends_on="apply_sales_tax"),
    F("column_break_tax", "Column Break"),
    F("tax_included_in_price", "Select", "Menu Prices", options="Tax added on top of item price\nTax included in item price",
      default="Tax added on top of item price", depends_on="apply_sales_tax"),
    F("sales_tax_template", "Link", "Tax Template", options="Sales Taxes and Charges Template", read_only=1),
    F("section_fbr", "Section Break", "FBR Point of Sale Integration", collapsible=1,
      description="Every counter sale is reported to FBR (PRAL); the FBR invoice number and its QR code print on the receipt."),
    F("fbr_enabled", "Check", "Report Sales to FBR"),
    F("fbr_mode", "Select", "Mode", options="Mock\nSandbox\nLive", default="Mock", depends_on="fbr_enabled",
      description="Mock: numbers are generated here and nothing is sent. Sandbox / Live: posted to the URL below."),
    F("fbr_pos_id", "Data", "FBR POS ID", depends_on="fbr_enabled", description="Issued by FBR when the POS is registered"),
    F("fbr_service_fee", "Currency", "FBR POS Service Fee per Invoice", default="1", depends_on="fbr_enabled",
      description="Added to every reported invoice (Rs 1 under the FBR POS scheme); 0 to leave it out"),
    F("column_break_fbr", "Column Break"),
    F("fbr_url", "Data", "Post Invoice URL", depends_on="eval:doc.fbr_enabled && doc.fbr_mode!='Mock'",
      description="FBR sandbox / live PostData endpoint, or the local IMS fiscal component — as given by PRAL"),
    F("fbr_token", "Password", "Access Token", depends_on="eval:doc.fbr_enabled && doc.fbr_mode!='Mock'"),
    F("fbr_pct_code", "Data", "Default PCT Code", depends_on="fbr_enabled", description="Tariff code sent per item (set per item later if needed)"),
    F("fbr_block_on_failure", "Check", "Stop the Sale When FBR Fails", depends_on="fbr_enabled",
      description="Off: the sale completes and is re-sent later (hourly)"),
    F("section_payments", "Section Break", "Payment Modes", description="Offered at the counter in this order; the first is the default."),
    F("payment_modes", "Table", "Payment Modes", options="Restaurant Payment Mode"),
    F("section_stock", "Section Break", "Stock"),
    F("stock_deduction_moment", "Select", "Deduct Ingredients", options="On Order Completion\nOn Invoice Submit", default="On Order Completion",
      description="Recipe (BOM) ingredients leave the branch kitchen in a background job"),
    F("column_break_stock", "Column Break"),
    F("run_jobs_inline", "Check", "Run Background Jobs Immediately", default="1",
      description="For a bench without a worker: stock deduction and notifications run in the request instead of the queue"),
    F("block_sold_out", "Check", "Block Sold-out Items", default="1",
      description="A dish whose ingredients can't cover the portion can't be sold (POS, tables); it shows as sold out everywhere"),
    F("section_kds", "Section Break", "Kitchen Display"),
    F("kds_amber_minutes", "Int", "Amber After (minutes)", default="8"),
    F("kds_sound", "Check", "Sound on New Ticket", default="1"),
    F("column_break_b", "Column Break"),
    F("kds_red_minutes", "Int", "Red After (minutes)", default="15"),
    F("kds_default_order_type", "Select", "Counter Orders Are", options="Takeaway\nDine-in\nDelivery\nPickup", default="Takeaway"),
    F("section_controls", "Section Break", "Manager Approval", collapsible=1),
    F("discount_approval_pct", "Percent", "Discount Needs a Manager Above (%)", default="10",
      description="Cashier-entered discounts (line + bill) above this share of the bill need a manager's sign-in. 0 = never."),
    F("column_break_ctl", "Column Break"),
    F("returns_need_approval", "Check", "Returns / Refunds Need a Manager", default="1"),
    F("section_delivery", "Section Break", "Delivery & Reviews"),
    F("rider_assignment", "Select", "Rider Assignment", options="Auto - Nearest\nAuto - Least Busy\nManual", default="Auto - Nearest"),
    F("rider_ping_seconds", "Int", "Rider Location Every (seconds)", default="15"),
    F("require_delivery_otp", "Check", "Rider Must Enter the Delivery Code", description="Else a photo or the code is proof of delivery"),
    F("rider_float_account", "Link", "Rider Cash Account", options="Account", description="Cash riders collect, until handed over at the counter"),
    F("avg_rider_speed_kmh", "Float", "Average Rider Speed (km/h)", default="20", description="For the customer's ETA"),
    F("column_break_c", "Column Break"),
    F("review_delay_minutes", "Int", "Send Review Link After (minutes)", default="30"),
    F("low_rating_alert", "Int", "Alert Manager At Or Below (stars)", default="2"),
    F("loyalty_program", "Link", "Loyalty Program", options="Loyalty Program",
      description="Named customers (online, phone, picked at the counter) are enrolled and earn points on every invoice"),
    F("online_redeem_points", "Check", "Customers Can Spend Points Online", default="1"),
    F("section_online", "Section Break", "Online Ordering & Kiosk", collapsible=1),
    F("online_ordering_enabled", "Check", "Online Ordering Open", default="1", description="Public ordering site at /ros/order"),
    F("online_price_list", "Link", "Online Price List", options="Price List", description="Blank = the counter's price list"),
    F("delivery_fee", "Currency", "Delivery Fee", default="150"),
    F("delivery_fee_item", "Link", "Delivery Fee Item", options="Item"),
    F("column_break_online", "Column Break"),
    F("min_order_amount", "Currency", "Minimum Online Order", default="500"),
    F("kiosk_enabled", "Check", "Self-order Kiosk Open", default="1", description="Kiosk at /ros/kiosk — orders wait as held sales on the counter until paid"),
    F("kiosk_idle_seconds", "Int", "Kiosk Resets After (seconds idle)", default="90"),
    F("section_online_pay", "Section Break", "Online Payment", collapsible=1),
    F("online_payment_enabled", "Check", "Accept Online Payment", default="1", description="Card / wallet at checkout, next to cash"),
    F("payment_gateway_mode", "Select", "Mode", options="Mock\nLive", default="Mock", description="Mock: a built-in test gateway — no money moves"),
    F("payment_gateway", "Select", "Provider", options="Safepay\nPayFast\nJazzCash\nEasypaisa\nBank Gateway", default="Safepay",
      depends_on="eval:doc.payment_gateway_mode=='Live'"),
    F("online_payment_mode", "Link", "Mode of Payment", options="Mode of Payment", description="Booked on the invoice when paid online"),
    F("column_break_op", "Column Break"),
    F("gateway_merchant_id", "Data", "Merchant ID", depends_on="eval:doc.payment_gateway_mode=='Live'"),
    F("gateway_api_key", "Password", "API Key", depends_on="eval:doc.payment_gateway_mode=='Live'"),
    F("gateway_secret", "Password", "Secret / Webhook Key", depends_on="eval:doc.payment_gateway_mode=='Live'"),
    F("section_foodpanda", "Section Break", "Foodpanda", collapsible=1),
    F("aggregator_mode", "Select", "Mode", options="Mock\nLive", default="Mock", description="Mock: orders come from the built-in simulator, nothing leaves this server"),
    F("foodpanda_delivery_by", "Select", "Foodpanda Orders Delivered By", options="Foodpanda Rider\nOwn Rider", default="Foodpanda Rider",
      description="Foodpanda's rider (tracked from Foodpanda) or your own riders (restaurant delivery mode)"),
    F("aggregator_customer", "Link", "Invoice Foodpanda Orders To", options="Customer",
      description="Foodpanda collects from the diner, so its orders are invoiced to this customer on acceptance (a receivable from Foodpanda)"),
    F("foodpanda_base_url", "Data", "API Base URL", depends_on="eval:doc.aggregator_mode=='Live'"),
    F("foodpanda_chain_code", "Data", "Chain Code", depends_on="eval:doc.aggregator_mode=='Live'"),
    F("column_break_fp", "Column Break"),
    F("foodpanda_client_id", "Data", "Client ID", depends_on="eval:doc.aggregator_mode=='Live'"),
    F("foodpanda_client_secret", "Password", "Client Secret", depends_on="eval:doc.aggregator_mode=='Live'"),
    F("foodpanda_webhook_secret", "Password", "Webhook Secret", description="Verifies order webhooks (Live)"),
    F("section_whatsapp", "Section Break", "WhatsApp / SMS", collapsible=1),
    F("messaging_mode", "Select", "Mode", options="Mock\nLive", default="Mock", description="Mock: messages are logged as Integration Requests, nothing is sent"),
    F("whatsapp_provider", "Select", "Provider", options="Meta WhatsApp Cloud API\nTwilio\nFrappe WhatsApp app", default="Meta WhatsApp Cloud API",
      depends_on="eval:doc.messaging_mode=='Live'"),
    F("column_break_wa", "Column Break"),
    F("whatsapp_phone_number_id", "Data", "Phone Number ID / Sender", depends_on="eval:doc.messaging_mode=='Live'"),
    F("whatsapp_token", "Password", "Access Token", depends_on="eval:doc.messaging_mode=='Live'"),
], issingle=1, desc="Restaurant OS settings: sales tax, invoice mode, payment modes, stock, KDS, integrations.")

write("Restaurant Payment Mode", [
    F("mode_of_payment", "Link", "Mode of Payment", options="Mode of Payment", reqd=1, in_list_view=1),
    F("account", "Link", "Account", options="Account", in_list_view=1, description="Cash / bank ledger for the company (created if blank)"),
], istable=1)

write("Restaurant Order Item", [
    F("item_code", "Link", "Item", options="Item", reqd=1, in_list_view=1),
    F("item_name", "Data", "Item Name", in_list_view=1),
    F("qty", "Float", "Qty", reqd=1, in_list_view=1),
    F("uom", "Link", "UOM", options="UOM"),
    F("rate", "Currency", "Rate"),
    F("amount", "Currency", "Amount"),
    F("is_free_item", "Check", "Free"),
    F("column_break_a", "Column Break"),
    F("station", "Link", "Kitchen Station", options="Kitchen Station", in_list_view=1),
    F("kds_status", "Select", "Kitchen Status", options="Queued\nPreparing\nReady\nServed\nVoid", default="Queued", in_list_view=1),
    F("notes", "Small Text", "Notes"),
    F("modifiers", "Small Text", "Modifiers"),
    F("kitchen_round", "Int", "Round", default="1", read_only=1, description="1 = first order, 2+ = items added later (dine-in)"),
    F("started_at", "Datetime", "Started At", read_only=1),
    F("ready_at", "Datetime", "Ready At", read_only=1),
    F("stock_posted", "Check", "Ingredients Issued", read_only=1),
], istable=1)

write("Restaurant Order", [
    F("naming_series", "Select", "Series", options="RO-.YY.-.#####", default="RO-.YY.-.#####", hidden=1),
    F("order_no", "Data", "Order No", read_only=1, in_list_view=1, bold=1, description="Short daily number called out at the pass"),
    F("status", "Select", "Status", options="Awaiting Payment\nPlaced\nAccepted\nPreparing\nReady\nPicked Up\nOut for Delivery\nDelivered\nCompleted\nCancelled\nRejected\nReturned",
      default="Placed", in_list_view=1, in_standard_filter=1, reqd=1),
    F("channel", "Select", "Channel", options="POS\nDine-in\nTakeaway\nPhone\nDrive-thru\nKiosk\nWeb\nApp\nFoodpanda", default="POS", in_list_view=1, in_standard_filter=1),
    F("order_type", "Select", "Order Type", options="Takeaway\nDine-in\nDelivery\nPickup", default="Takeaway", in_standard_filter=1),
    F("priority", "Int", "Priority", default="0", description="Higher first on the KDS (VIP, delivery pickup time)"),
    F("column_break_a", "Column Break"),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_standard_filter=1),
    F("company", "Link", "Company", options="Company", reqd=1),
    F("table", "Link", "Table", options="Restaurant Table"),
    F("guests", "Int", "Guests"),
    F("customer", "Link", "Customer", options="Customer"),
    F("customer_name", "Data", "Customer Name", in_list_view=1),
    F("section_items", "Section Break", "Items"),
    F("items", "Table", "Items", options="Restaurant Order Item", reqd=1),
    F("notes", "Small Text", "Order Notes"),
    F("section_links", "Section Break", "Links"),
    F("invoice_doctype", "Link", "Invoice Type", options="DocType", read_only=1),
    F("invoice", "Dynamic Link", "Invoice", options="invoice_doctype", read_only=1),
    F("grand_total", "Currency", "Grand Total", read_only=1, in_list_view=1),
    F("column_break_l", "Column Break"),
    F("external_order_id", "Data", "External Order ID", description="Aggregator order id (Foodpanda…)"),
    F("client_order_uuid", "Data", "Client Order UUID", unique=1, description="Idempotency key from the ordering client"),
    F("section_delivery", "Section Break", "Delivery", depends_on="eval:doc.order_type=='Delivery'"),
    F("delivery_phone", "Data", "Customer Phone", options="Phone"),
    F("delivery_address", "Small Text", "Delivery Address"),
    F("delivery_lat", "Float", "Latitude", precision="6"),
    F("delivery_lng", "Float", "Longitude", precision="6"),
    F("column_break_d", "Column Break"),
    F("delivery_by", "Select", "Delivered By", options="\nOwn Rider\nFoodpanda Rider", read_only=1, in_standard_filter=1),
    F("rider", "Link", "Rider", options="Rider", read_only=1, in_standard_filter=1),
    F("delivery_assignment", "Link", "Delivery Assignment", options="Delivery Assignment", read_only=1),
    F("cod_amount", "Currency", "Cash to Collect", description="0 when paid in advance / aggregator"),
    F("payment_method", "Select", "Payment Method", options="\nCash\nOnline", read_only=1),
    F("payment_status", "Select", "Payment Status", options="\nUnpaid\nAwaiting\nPaid\nFailed\nRefunded", read_only=1, in_standard_filter=1),
    F("paid_amount", "Currency", "Paid Online", read_only=1),
    F("payment_reference", "Data", "Payment Reference", read_only=1),
    F("payment_request", "Link", "Payment Session", options="Integration Request", read_only=1),
    F("distance_km", "Float", "Distance (km)", read_only=1, precision="2"),
    F("delivery_otp", "Data", "Delivery Code", read_only=1, description="Shown to the customer on the tracking page; the rider enters it"),
    F("tracking_key", "Data", "Tracking Key", read_only=1, unique=1, hidden=1),
    F("section_ext_rider", "Section Break", "Aggregator Rider", depends_on="eval:doc.delivery_by=='Foodpanda Rider'", collapsible=1),
    F("ext_rider_name", "Data", "Rider", read_only=1),
    F("ext_rider_phone", "Data", "Rider Phone", read_only=1),
    F("ext_rider_status", "Data", "Rider Status", read_only=1, description="As reported by Foodpanda (assigned, arriving, picked up, delivered)"),
    F("column_break_x", "Column Break"),
    F("ext_rider_lat", "Float", "Rider Latitude", precision="6", read_only=1),
    F("ext_rider_lng", "Float", "Rider Longitude", precision="6", read_only=1),
    F("ext_rider_eta", "Datetime", "Rider ETA", read_only=1),
    F("section_promo", "Section Break", "Offers, Loyalty & Review", collapsible=1),
    F("coupon_code", "Data", "Coupon", read_only=1),
    F("offers_applied", "Small Text", "Offers Applied", read_only=1),
    F("discount_amount", "Currency", "Bill Discount", read_only=1),
    F("column_break_pr", "Column Break"),
    F("loyalty_points_redeemed", "Int", "Points Redeemed", read_only=1),
    F("loyalty_amount", "Currency", "Points Value", read_only=1),
    F("rating", "Int", "Rating", read_only=1, description="1–5 from the customer's review"),
    F("review", "Link", "Review", options="Order Review", read_only=1),
    F("review_requested_at", "Datetime", "Review Requested At", read_only=1),
    F("section_stock", "Section Break", "Stock"),
    F("stock_status", "Select", "Ingredients", options="Pending\nPosted\nNot Needed\nFailed", default="Pending", read_only=1),
    F("stock_entry", "Link", "Stock Entry", options="Stock Entry", read_only=1),
    F("column_break_s", "Column Break"),
    F("stock_error", "Small Text", "Stock Error", read_only=1),
    F("section_times", "Section Break", "Timeline", collapsible=1),
    F("placed_at", "Datetime", "Placed At", read_only=1),
    F("accepted_at", "Datetime", "Accepted At", read_only=1),
    F("preparing_at", "Datetime", "Preparing At", read_only=1),
    F("column_break_t", "Column Break"),
    F("ready_at", "Datetime", "Ready At", read_only=1),
    F("completed_at", "Datetime", "Completed / Delivered At", read_only=1),
    F("cancelled_at", "Datetime", "Cancelled At", read_only=1),
], autoname="naming_series:", title_field="order_no", search="order_no,customer_name,status,channel",
   desc="The operational order — every channel, one queue — linked to its POS / Sales Invoice.", sort="creation")
write("Wastage Log Item", [
    F("item_code", "Link", "Item", options="Item", reqd=1, in_list_view=1),
    F("item_name", "Data", "Item Name", fetch_from="item_code.item_name", read_only=1, in_list_view=1),
    F("qty", "Float", "Qty", reqd=1, in_list_view=1),
    F("uom", "Link", "UOM", options="UOM", fetch_from="item_code.stock_uom", read_only=1, in_list_view=1),
    F("valuation_rate", "Currency", "Valuation Rate", read_only=1),
    F("amount", "Currency", "Cost", read_only=1, in_list_view=1),
], istable=1)

write("Wastage Log", [
    F("naming_series", "Select", "Series", options="WST-.YY.-.#####", default="WST-.YY.-.#####", hidden=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_list_view=1, in_standard_filter=1),
    F("company", "Link", "Company", options="Company", fetch_from="branch.company", read_only=1),
    F("warehouse", "Link", "Warehouse", options="Warehouse", reqd=1, description="Usually the branch kitchen"),
    F("column_break_a", "Column Break"),
    F("posting_date", "Date", "Date", reqd=1, default="Today", in_list_view=1),
    F("reason", "Select", "Reason", options="Spoiled\nExpired\nBurnt / Overcooked\nDropped / Spilled\nReturned by Customer\nStaff Meal\nTesting / Tasting\nOther",
      reqd=1, in_list_view=1, in_standard_filter=1),
    F("section_items", "Section Break", "Items"),
    F("items", "Table", "Items", options="Wastage Log Item", reqd=1),
    F("total_cost", "Currency", "Total Cost", read_only=1, in_list_view=1),
    F("column_break_b", "Column Break"),
    F("stock_entry", "Link", "Stock Entry", options="Stock Entry", read_only=1),
    F("remarks", "Small Text", "Remarks"),
    F("amended_from", "Link", "Amended From", options="Wastage Log", read_only=1, no_copy=1, print_hide=1),
], autoname="naming_series:", desc="Food thrown away, with a reason — issued out of stock on submit (Material Issue).", sort="creation",
   extra={"is_submittable": 1, "permissions": [
       {"role": r, "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "amend": 1, "delete": 1, "report": 1, "export": 1, "print": 1}
       for r in ("System Manager", "Stock Manager", "Sales Manager")] + [{"role": "Stock User", "read": 1, "write": 1, "create": 1, "submit": 1, "report": 1, "print": 1}]})
write("Rider", [
    F("rider_name", "Data", "Rider Name", reqd=1, in_list_view=1),
    F("photo", "Attach Image", "Photo", description="Shown on the dispatch board and rider cards (else the employee's photo)"),
    F("employee", "Link", "Employee", options="Employee"),
    F("user", "Link", "Login (User)", options="User", unique=1, description="The rider signs in to the rider app with this user"),
    F("phone", "Data", "Phone", options="Phone", in_list_view=1),
    F("column_break_a", "Column Break"),
    F("branch", "Link", "Branch", options="Restaurant Branch", reqd=1, in_list_view=1, in_standard_filter=1),
    F("vehicle", "Select", "Vehicle", options="Motorbike\nBicycle\nCar\nOn Foot", default="Motorbike"),
    F("vehicle_number", "Data", "Vehicle Number"),
    F("disabled", "Check", "Disabled"),
    F("section_live", "Section Break", "Live"),
    F("status", "Select", "Status", options="Off Duty\nAvailable\nOn Delivery", default="Off Duty", read_only=1, in_list_view=1, in_standard_filter=1),
    F("last_seen", "Datetime", "Last Seen", read_only=1),
    F("column_break_l", "Column Break"),
    F("latitude", "Float", "Latitude", precision="6", read_only=1),
    F("longitude", "Float", "Longitude", precision="6", read_only=1),
    F("cash_in_hand", "Currency", "Cash in Hand", read_only=1, description="Collected on deliveries, not yet handed over"),
], autoname="hash", title_field="rider_name", search="rider_name,phone,branch", desc="A delivery rider (an Employee with a login for the rider app).", extra={"image_field": "photo"})

write("Delivery Assignment", [
    F("order", "Link", "Restaurant Order", options="Restaurant Order", reqd=1, in_list_view=1),
    F("rider", "Link", "Rider", options="Rider", reqd=1, in_list_view=1, in_standard_filter=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", in_standard_filter=1),
    F("status", "Select", "Status", options="Offered\nAccepted\nRejected\nPicked Up\nDelivered\nCancelled", default="Offered", in_list_view=1, in_standard_filter=1),
    F("column_break_a", "Column Break"),
    F("offered_at", "Datetime", "Offered At", read_only=1),
    F("accepted_at", "Datetime", "Accepted At", read_only=1),
    F("picked_at", "Datetime", "Picked Up At", read_only=1),
    F("delivered_at", "Datetime", "Delivered At", read_only=1),
    F("section_proof", "Section Break", "Proof & Cash"),
    F("otp_verified", "Check", "Delivery Code Verified", read_only=1),
    F("proof_photo", "Attach Image", "Proof Photo"),
    F("reject_reason", "Small Text", "Reject Reason"),
    F("column_break_p", "Column Break"),
    F("distance_km", "Float", "Distance (km)", precision="2", read_only=1),
    F("delivery_minutes", "Float", "Minutes Placed → Delivered", precision="1", read_only=1, in_list_view=1),
    F("cash_collected", "Currency", "Cash Collected", read_only=1),
    F("payment_entry", "Link", "Payment Entry", options="Payment Entry", read_only=1),
    F("handed_over", "Check", "Cash Handed Over", read_only=1),
    F("handover_entry", "Link", "Handover Entry", options="Journal Entry", read_only=1),
], autoname="format:DA-{YY}-{#####}", desc="A delivery offered to / done by a rider.", sort="creation")

write("Rider Location Log", [
    F("rider", "Link", "Rider", options="Rider", reqd=1, in_list_view=1, in_standard_filter=1),
    F("assignment", "Link", "Delivery Assignment", options="Delivery Assignment"),
    F("latitude", "Float", "Latitude", precision="6", in_list_view=1),
    F("longitude", "Float", "Longitude", precision="6", in_list_view=1),
    F("accuracy", "Float", "Accuracy (m)"),
    F("speed", "Float", "Speed (m/s)"),
    F("recorded_at", "Datetime", "Recorded At", in_list_view=1),
], autoname="hash", desc="GPS pings from the rider app (kept 7 days).", sort="creation", track=0)
write("Order Review Item", [
    F("item_code", "Link", "Dish", options="Item", reqd=1, in_list_view=1),
    F("item_name", "Data", "Dish Name", in_list_view=1),
    F("rating", "Int", "Rating (1–5)", in_list_view=1),
    F("comment", "Data", "Comment", in_list_view=1),
], istable=1)

write("Order Review", [
    F("order", "Link", "Restaurant Order", options="Restaurant Order", reqd=1, unique=1, in_list_view=1),
    F("branch", "Link", "Branch", options="Restaurant Branch", in_standard_filter=1),
    F("channel", "Data", "Channel", in_standard_filter=1),
    F("order_type", "Data", "Order Type"),
    F("column_break_a", "Column Break"),
    F("customer", "Link", "Customer", options="Customer"),
    F("customer_name", "Data", "Customer Name", in_list_view=1),
    F("source", "Select", "Source", options="Tracking Page\nWhatsApp\nSMS\nStaff", default="Tracking Page"),
    F("section_ratings", "Section Break", "Ratings"),
    F("rating_overall", "Int", "Overall (1–5)", reqd=1, in_list_view=1, in_standard_filter=1),
    F("rating_food", "Int", "Food (1–5)"),
    F("rating_delivery", "Int", "Delivery (1–5)"),
    F("column_break_r", "Column Break"),
    F("comment", "Small Text", "Comment"),
    F("photo", "Attach Image", "Photo"),
    F("section_items", "Section Break", "Dishes"),
    F("items", "Table", "Dish Ratings", options="Order Review Item"),
    F("section_followup", "Section Break", "Follow-up"),
    F("status", "Select", "Status", options="New\nAcknowledged\nResolved", default="New", in_list_view=1, in_standard_filter=1),
    F("alerted", "Check", "Manager Alerted", read_only=1),
    F("column_break_f", "Column Break"),
    F("manager_note", "Small Text", "Manager Note"),
], autoname="format:REV-{YY}-{#####}", title_field="customer_name", desc="A customer's rating of an order (overall, food, delivery, dishes).", sort="creation")

write("Restaurant Campaign Recipient", [
    F("customer", "Link", "Customer", options="Customer", in_list_view=1),
    F("customer_name", "Data", "Name", in_list_view=1),
    F("mobile", "Data", "Mobile", in_list_view=1),
    F("status", "Select", "Status", options="Sent\nFailed", in_list_view=1),
], istable=1)

write("Restaurant Campaign", [
    F("title", "Data", "Campaign", reqd=1, in_list_view=1),
    F("segment", "Select", "Who", options="Lapsed customers\nNew this month\nTop spenders\nEveryone with a mobile", default="Lapsed customers",
      reqd=1, in_list_view=1),
    F("lapsed_days", "Int", "Not Ordered For (days)", default="30", depends_on="eval:doc.segment=='Lapsed customers'"),
    F("top_n", "Int", "How Many Top Spenders", default="20", depends_on="eval:doc.segment=='Top spenders'"),
    F("column_break_a", "Column Break"),
    F("channel", "Select", "Send By", options="WhatsApp\nSMS", default="WhatsApp"),
    F("pos_coupon", "Link", "Coupon", options="POS Coupon", description="Its code is put in the message as {coupon}"),
    F("status", "Select", "Status", options="Draft\nSent", default="Draft", read_only=1, in_list_view=1),
    F("section_message", "Section Break", "Message"),
    F("message", "Small Text", "Message", reqd=1, default="Hi {name}, we miss you at {restaurant}! Use code {coupon} on your next order: {link}",
      description="{name}, {restaurant}, {coupon}, {link} are filled in per customer"),
    F("section_result", "Section Break", "Result"),
    F("recipients_count", "Int", "Recipients", read_only=1, in_list_view=1),
    F("sent_on", "Datetime", "Sent On", read_only=1),
    F("recipients", "Table", "Recipients", options="Restaurant Campaign Recipient", read_only=1),
], autoname="format:CMP-{YY}-{###}", title_field="title", desc="A message to a customer group (WhatsApp / SMS), optionally with a coupon.", sort="creation")
print("ok")
