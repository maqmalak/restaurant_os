"""Online payment endpoints: the mock gateway page, the provider webhook, and retry from the tracking page."""

import json

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import flt

from restaurant_os.integrations.payments.gateway import gateway
from restaurant_os.services import payments as svc
from restaurant_os.session import as_system


def _session(session):
	if not session or not frappe.db.exists("Integration Request", {"name": session, "reference_doctype": "Restaurant Order"}):
		frappe.throw(_("Payment not found."), frappe.DoesNotExistError)
	return frappe.get_doc("Integration Request", session)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=60)
def session(session: str) -> dict:
	"""What the payment page shows."""
	ir = _session(session)
	data = json.loads(ir.data or "{}")
	order = frappe.db.get_value("Restaurant Order", ir.reference_docname, ["order_no", "tracking_key", "company", "payment_status"], as_dict=True)
	return {"status": ir.status, "amount": flt(data.get("amount")), "currency": data.get("currency"), "order_no": order.order_no,
			"tracking_key": order.tracking_key, "restaurant": order.company, "logo": frappe.get_cached_value("Company", order.company, "company_logo"),
			"mock": gateway().name == "Mock", "paid": order.payment_status == "Paid"}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=60)
def mock_pay(session: str, outcome: str = "success") -> dict:
	"""Mock gateway only: approve or decline the test payment."""
	if gateway().name != "Mock":
		frappe.throw(_("The test gateway is off."))
	_session(session)
	with as_system():
		if outcome == "success":
			svc.mark_paid(session, reference=f"MOCK-{frappe.generate_hash(length=10).upper()}")
		else:
			svc.mark_failed(session, "Declined on the test gateway")
	return session_info(session)


def session_info(s):
	return {"ok": 1, **session(s)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=120, seconds=60)
def webhook():
	"""Live gateway callback: {"session", "status": "paid"/"failed", "reference"} signed with the webhook secret."""
	body = frappe.request.get_data() or b"{}"
	if not gateway().verify_webhook(frappe.request.headers, body):
		frappe.throw(_("Invalid signature."), frappe.AuthenticationError)
	d = json.loads(body)
	with as_system():
		if d.get("status") == "paid":
			svc.mark_paid(d["session"], d.get("reference"))
		else:
			svc.mark_failed(d["session"], d.get("reason"))
	return {"ok": 1}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def retry(key: str) -> dict:
	"""Pay again for an unpaid online order (tracking page)."""
	name = frappe.db.get_value("Restaurant Order", {"tracking_key": key, "payment_method": "Online"}, "name") if key and len(key) >= 10 else None
	if not name:
		frappe.throw(_("Order not found."), frappe.DoesNotExistError)
	with as_system():
		return {"payment_url": svc.start(name)}
