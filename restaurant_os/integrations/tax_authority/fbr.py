"""FBR (Federal Board of Revenue, Pakistan) POS integration: every counter sale is reported and gets an FBR invoice number,
printed on the receipt with its QR code (customers verify it in FBR's Tax Asaan app).

Mode Mock (default until the POS is registered): a number is generated here, nothing leaves the server. Sandbox / Live:
the invoice is posted as JSON to the configured URL (FBR's PostData endpoint or the local IMS fiscal component) with the
bearer token; FBR answers {"InvoiceNumber", "Code": "100", "Response"}. Failures never lose the sale: the invoice keeps
fbr_status Failed and `retry_failed` (hourly) sends it again — unless Restaurant Settings stop the sale on failure.
Each call is logged as an Integration Request. Returns are reported as credit invoices (InvoiceType 3, RefUSIN).
"""

import json

import frappe
import requests
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime

from restaurant_os.integrations.log import log

PAYMENT_MODE = {"Cash": 1, "Card": 2, "Credit Card": 2, "Gift Voucher": 3, "Loyalty Card": 4, "Mixed": 5, "Cheque": 6}


def settings():
	return frappe.get_cached_doc("Restaurant Settings")


def enabled():
	return cint(settings().fbr_enabled)


def payload(doc):
	s = settings()
	taxed = {t.account_head for t in doc.taxes if not (t.description or "").startswith("FBR")}
	tax_total = sum(flt(t.base_tax_amount_after_discount_amount) for t in doc.taxes if t.account_head in taxed)
	rate = flt(next((t.rate for t in doc.taxes if t.account_head in taxed), 0))
	modes = {p.mode_of_payment for p in doc.payments if flt(p.amount)}
	sign = -1 if doc.is_return else 1
	items = []
	for i in doc.items:
		sale_value = abs(flt(i.base_net_amount))
		tax = round(sale_value * rate / 100, 2)
		items.append({"ItemCode": i.item_code, "ItemName": i.item_name, "Quantity": abs(flt(i.qty)), "PCTCode": s.fbr_pct_code or "",
					  "TaxRate": rate, "SaleValue": sale_value, "TotalAmount": round(sale_value + tax, 2), "TaxCharged": tax,
					  "Discount": abs(flt(i.discount_amount)) * abs(flt(i.qty)), "FurtherTax": 0.0, "InvoiceType": 3 if doc.is_return else 1,
					  "RefUSIN": doc.return_against or None})
	return {
		"InvoiceNumber": "", "POSID": cint(s.fbr_pos_id), "USIN": doc.name, "DateTime": str(get_datetime(f"{doc.posting_date} {doc.posting_time}"))[:19],
		"BuyerNTN": doc.get("tax_id") or "", "BuyerCNIC": "", "BuyerName": doc.customer_name or "", "BuyerPhoneNumber": doc.get("contact_mobile") or "",
		"TotalBillAmount": abs(flt(doc.rounded_total or doc.grand_total)), "TotalQuantity": abs(flt(doc.total_qty)),
		"TotalSaleValue": abs(flt(doc.base_net_total)), "TotalTaxCharged": abs(tax_total) * 1, "Discount": abs(flt(doc.discount_amount)),
		"FurtherTax": 0.0, "PaymentMode": PAYMENT_MODE.get(next(iter(modes)), 1) if len(modes) == 1 else 5,
		"RefUSIN": doc.return_against or None, "InvoiceType": 3 if doc.is_return else 1, "Items": items, "_sign": sign,
	}


def _mock_number(doc):
	s = settings()
	return f"{(s.fbr_pos_id or '000000')[:6]}{now_datetime().strftime('%y%m%d%H%M%S')}{frappe.generate_hash(length=4).upper()}"


def report(doc):
	"""Post one invoice to FBR (or mock it); stores fbr_invoice_number / fbr_status / fbr_response on the invoice."""
	s = settings()
	body = payload(doc)
	body.pop("_sign", None)
	try:
		if s.fbr_mode == "Mock":
			res = {"InvoiceNumber": _mock_number(doc), "Code": "100", "Response": "Mock: fiscal invoice number generated (not sent to FBR)"}
		else:
			if not s.fbr_url:
				frappe.throw(_("Set the FBR Post Invoice URL in Restaurant Settings."))
			r = requests.post(s.fbr_url, json=body, timeout=15,
							  headers={"Authorization": f"Bearer {s.get_password('fbr_token', raise_exception=False) or ''}",
									   "Content-Type": "application/json"})
			r.raise_for_status()
			res = r.json()
		if str(res.get("Code")) != "100" or not res.get("InvoiceNumber"):
			raise ValueError(res.get("Response") or res.get("Errors") or json.dumps(res))
	except Exception as e:
		msg = frappe.utils.strip_html(str(e))[:500]
		frappe.db.set_value(doc.doctype, doc.name, {"fbr_status": "Failed", "fbr_response": msg}, update_modified=False)
		log("FBR", body, status="Failed", error=msg, reference=(doc.doctype, doc.name))
		if cint(s.fbr_block_on_failure):
			frappe.throw(_("FBR did not accept the invoice: {0}").format(msg), title=_("FBR"))
		return None
	frappe.db.set_value(doc.doctype, doc.name, {"fbr_invoice_number": res["InvoiceNumber"], "fbr_status": "Posted",
												 "fbr_response": res.get("Response")}, update_modified=False)
	doc.fbr_invoice_number = res["InvoiceNumber"]
	log("FBR", body, output=res, reference=(doc.doctype, doc.name))
	return res["InvoiceNumber"]


def on_submit(doc, method=None):
	"""Counter sales and returns are reported once (the shift's merged Sales Invoice is not — its POS Invoices were)."""
	if not enabled() or not (doc.get("is_pos") and doc.get("pos_profile")) or doc.get("is_consolidated") or doc.get("fbr_invoice_number"):
		return
	if doc.doctype == "Sales Invoice" and frappe.db.exists("POS Invoice", {"consolidated_invoice": doc.name}):
		return
	report(doc)


def retry_failed():
	"""Scheduler (hourly): re-send invoices FBR didn't accept."""
	if not enabled():
		return
	for dt in ("POS Invoice", "Sales Invoice"):
		for name in frappe.get_all(dt, {"docstatus": 1, "fbr_status": "Failed"}, pluck="name", limit=100):
			report(frappe.get_doc(dt, name))
			frappe.db.commit()
