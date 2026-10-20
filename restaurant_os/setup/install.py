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


def custom_fields():
	create_custom_fields({"POS Invoice": FBR_FIELDS, "Sales Invoice": FBR_FIELDS, "Stock Entry": STOCK_ENTRY_FIELDS}, ignore_validate=True, update=True)


def after_install():
	custom_fields()


def after_migrate():
	custom_fields()
