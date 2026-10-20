app_name = "restaurant_os"
app_title = "Restaurant OS"
app_publisher = "MicroMax"
app_description = "Restaurant automation platform: orders from every channel, KDS, riders, recipe stock deduction, reviews and analytics on ERPNext v16"
app_email = "maqmalak@gmail.com"
app_license = "mit"

# POS Awesome supplies the shift / offer / coupon / cash-movement documents the POS runs on; mm_core the React shell's
# generic form helpers (connections, print options, mapped docs); HRMS the Employee behind each rider (later phases).
required_apps = ["erpnext", "hrms", "posawesome", "mm_core"]

add_to_apps_screen = [
	{"name": "restaurant_os", "logo": "/assets/restaurant_os/images/logo.svg", "title": "Restaurant OS", "route": "/ros/pos"},
]

after_install = "restaurant_os.setup.install.after_install"
after_migrate = "restaurant_os.setup.install.after_migrate"

# React apps at /ros (built into restaurant_os/public/frontend, page in www/ros.html)
website_route_rules = [{"from_route": "/ros/<path:app_path>", "to_route": "ros"}]

scheduler_events = {
	# after ERPNext's daily reorder job: pending purchase requests → draft POs per preferred supplier
	"daily_long": ["restaurant_os.services.procurement.daily"],
	"hourly": ["restaurant_os.services.stock_deduction.retry_failed", "restaurant_os.integrations.tax_authority.fbr.retry_failed"],
}

_INVOICE_EVENTS = {
	# every counter sale: a bell alert and its kitchen order (POS Awesome posts counter sales as POS Invoices, or Sales Invoices)
	"on_submit": ["restaurant_os.integrations.tax_authority.fbr.on_submit", "restaurant_os.api.pos.notify_invoice",
				  "restaurant_os.services.orders.order_from_invoice"],
	"on_cancel": "restaurant_os.services.orders.cancel_from_invoice",
}
doc_events = {"Sales Invoice": _INVOICE_EVENTS, "POS Invoice": _INVOICE_EVENTS}
