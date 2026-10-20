"""Integration endpoints: the Foodpanda order webhook (guest, signature-checked in Live mode) and mock tools."""

import json

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=120, seconds=60)
def foodpanda_order():
	from restaurant_os.integrations.aggregators.foodpanda import adapter, receive

	body = frappe.request.get_data() or b"{}"
	if not adapter().verify(frappe.request.headers, body):
		frappe.throw(_("Invalid signature."), frappe.AuthenticationError)
	from restaurant_os.session import as_system

	with as_system():                                         # the order is created on behalf of the integration
		order = receive(json.loads(body))
	return {"order": order.name, "order_no": order.order_no}


@frappe.whitelist(methods=["POST"])
def simulate_foodpanda_order(items: int = 2) -> dict:
	"""Mock mode only: a fake Foodpanda order straight onto the KDS."""
	from restaurant_os.integrations.aggregators.foodpanda import simulate_order

	if frappe.db.get_single_value("Restaurant Settings", "aggregator_mode") != "Mock":
		frappe.throw(_("The simulator only runs in Mock mode."))
	frappe.only_for(("System Manager", "Sales Manager"))
	order = simulate_order(items)
	return {"order": order.name, "order_no": order.order_no}


@frappe.whitelist(methods=["POST"])
def test_whatsapp(to: str, text: str = "Restaurant OS test message") -> dict:
	from restaurant_os.integrations.messaging.whatsapp import send

	frappe.only_for(("System Manager",))
	return send(to, text)
