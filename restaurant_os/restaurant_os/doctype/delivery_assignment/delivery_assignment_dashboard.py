from frappe import _


def get_data():
	return {
		"fieldname": "assignment",
		"internal_links": {"Restaurant Order": "order", "Rider": "rider", "Payment Entry": "payment_entry", "Journal Entry": "handover_entry"},
		"transactions": [
			{"label": _("Order"), "items": ["Restaurant Order", "Rider"]},
			{"label": _("Cash"), "items": ["Payment Entry", "Journal Entry"]},
			{"label": _("Tracking"), "items": ["Rider Location Log"]},
		],
	}
