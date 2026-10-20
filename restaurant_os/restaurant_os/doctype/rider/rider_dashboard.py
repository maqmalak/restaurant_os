from frappe import _


def get_data():
	return {
		"fieldname": "rider",
		"internal_links": {"Employee": "employee", "Restaurant Branch": "branch"},
		"transactions": [
			{"label": _("Deliveries"), "items": ["Delivery Assignment", "Restaurant Order"]},
			{"label": _("Tracking"), "items": ["Rider Location Log"]},
			{"label": _("HR"), "items": ["Employee"]},                 # check-ins: on the Employee's own connections
		],
	}
