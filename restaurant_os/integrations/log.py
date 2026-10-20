import json

import frappe


def log(service, data, status="Completed", output=None, error=None, reference=None):
	"""Every integration call is kept as a standard Frappe Integration Request (mock calls too)."""
	frappe.get_doc({
		"doctype": "Integration Request", "integration_request_service": service, "is_remote_request": 0,
		"status": status, "data": json.dumps(data, default=str, indent=1), "output": json.dumps(output, default=str) if output else None,
		"error": error, "reference_doctype": reference[0] if reference else None, "reference_docname": reference[1] if reference else None,
	}).insert(ignore_permissions=True)
