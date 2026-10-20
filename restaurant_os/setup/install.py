"""Install / migrate: custom fields Restaurant OS adds to standard doctypes (created in code so a fresh install has them)."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FBR_FIELDS = [
	{"fieldname": "fbr_section", "fieldtype": "Section Break", "label": "FBR", "insert_after": "posa_notes", "collapsible": 1},
	{"fieldname": "fbr_invoice_number", "fieldtype": "Data", "label": "FBR Invoice Number", "insert_after": "fbr_section",
	 "read_only": 1, "no_copy": 1, "print_hide": 0, "in_standard_filter": 1},
	{"fieldname": "fbr_status", "fieldtype": "Select", "label": "FBR Status", "options": "\nPosted\nFailed", "insert_after": "fbr_invoice_number",
	 "read_only": 1, "no_copy": 1},
	{"fieldname": "fbr_response", "fieldtype": "Small Text", "label": "FBR Response", "insert_after": "fbr_status", "read_only": 1, "no_copy": 1},
]


STOCK_ENTRY_FIELDS = [
	{"fieldname": "ros_section", "fieldtype": "Section Break", "label": "Restaurant", "insert_after": "remarks", "collapsible": 1},
	{"fieldname": "ros_source", "fieldtype": "Select", "label": "Restaurant Source", "options": "\nRecipe\nWastage", "insert_after": "ros_section",
	 "read_only": 1, "in_standard_filter": 1},
	{"fieldname": "ros_reference_doctype", "fieldtype": "Link", "label": "Restaurant Reference Type", "options": "DocType", "insert_after": "ros_source", "read_only": 1},
	{"fieldname": "ros_reference_name", "fieldtype": "Dynamic Link", "label": "Restaurant Reference", "options": "ros_reference_doctype",
	 "insert_after": "ros_reference_doctype", "read_only": 1},
]


SALES_INVOICE_FIELDS = [
	{"fieldname": "ros_channel", "fieldtype": "Select", "label": "Order Channel", "insert_after": "customer_name", "read_only": 1,
	 "options": "\nPOS\nDine-in\nTakeaway\nPhone\nDrive-thru\nKiosk\nWeb\nApp\nFoodpanda", "in_standard_filter": 1, "in_list_view": 1},
	{"fieldname": "ros_order", "fieldtype": "Link", "label": "Restaurant Order", "options": "Restaurant Order", "insert_after": "ros_channel",
	 "read_only": 1, "no_copy": 1},
]


def backfill_channels():
	"""Invoices made before these fields existed: channel and order from the Restaurant Order that points at them;
	merged shift invoices (from POS Invoices) are "POS"."""
	import frappe

	for o in frappe.get_all("Restaurant Order", {"invoice_doctype": "Sales Invoice", "invoice": ["is", "set"]}, ["name", "channel", "invoice"]):
		frappe.db.set_value("Sales Invoice", o.invoice, {"ros_channel": o.channel, "ros_order": o.name}, update_modified=False)
	for name in frappe.get_all("Sales Invoice", {"ros_channel": ["is", "not set"], "docstatus": ["<", 2]},
							   or_filters={"is_pos": 1, "is_consolidated": 1}, pluck="name"):
		frappe.db.set_value("Sales Invoice", name, "ros_channel", "POS", update_modified=False)


def custom_fields():
	create_custom_fields({"POS Invoice": FBR_FIELDS, "Sales Invoice": FBR_FIELDS + SALES_INVOICE_FIELDS, "Stock Entry": STOCK_ENTRY_FIELDS},
						 ignore_validate=True, update=True)


def after_install():
	custom_fields()


def after_migrate():
	custom_fields()
	backfill_channels()
