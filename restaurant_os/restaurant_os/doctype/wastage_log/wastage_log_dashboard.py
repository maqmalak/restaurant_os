from frappe import _


def get_data():
	return {"fieldname": "wastage_log", "non_standard_fieldnames": {"Stock Entry": "ros_reference_name"},
			"internal_links": {"Restaurant Branch": "branch"},
			"transactions": [{"label": _("Stock"), "items": ["Stock Entry"]}, {"label": _("Related"), "items": ["Restaurant Branch"]}]}
