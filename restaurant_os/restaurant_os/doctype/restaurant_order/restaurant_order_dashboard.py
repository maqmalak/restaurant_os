from frappe import _


def get_data():
	return {
		"fieldname": "order",
		"non_standard_fieldnames": {"Stock Entry": "ros_reference_name", "Integration Request": "reference_docname"},
		"internal_links": {"POS Invoice": "invoice", "Sales Invoice": "invoice", "Restaurant Table": "table", "Rider": "rider", "Customer": "customer"},
		"transactions": [
			{"label": _("Billing"), "items": ["POS Invoice", "Sales Invoice"]},
			{"label": _("Delivery"), "items": ["Delivery Assignment", "Rider"]},
			{"label": _("Stock"), "items": ["Stock Entry"]},
			{"label": _("Related"), "items": ["Restaurant Table", "Customer", "Integration Request"]},
		],
	}
