"""Ingredient Variance — theoretical vs actual consumption per ingredient, branch kitchen, period (anti-theft control).

    expected closing = opening + received − recipe usage (orders) − wastage − other issues
    counted closing  = expected closing + stock-count adjustments (Stock Reconciliation)
    variance         = counted − expected  (the stock-count adjustments; negative = missing stock)

Recipe usage comes from the order Stock Entries (ros_source = Recipe), wastage from Wastage Logs (ros_source = Wastage);
everything is read from the Stock Ledger of the branch kitchen warehouse.
"""

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate


def execute(filters=None):
	f = frappe._dict(filters or {})
	branch = f.branch or frappe.db.get_single_value("Restaurant Settings", "default_branch")
	if not branch:
		frappe.throw(_("Pick a branch."))
	wh = frappe.db.get_value("Restaurant Branch", branch, "kitchen_warehouse")
	f.from_date = getdate(f.from_date or add_days(nowdate(), -7))
	f.to_date = getdate(f.to_date or nowdate())
	return columns(), rows(wh, f)


def columns():
	c = lambda fn, label, ft="Float", w=110, **kw: {"fieldname": fn, "label": _(label), "fieldtype": ft, "width": w, **kw}
	return [
		c("item_code", "Ingredient", "Link", 170, options="Item"), c("uom", "UOM", "Data", 60),
		c("opening", "Opening"), c("received", "Received"), c("recipe", "Recipe Usage"), c("wastage", "Wastage"), c("other_out", "Other Out"),
		c("expected", "Expected Closing"), c("counted", "Counted Closing"), c("variance", "Variance"),
		c("variance_pct", "Variance % of Usage", "Percent", 120), c("valuation_rate", "Rate", "Currency"), c("variance_value", "Variance Value", "Currency", 130),
	]


def rows(wh, f):
	sle = frappe.db.sql("""
		select sle.item_code, i.stock_uom as uom,
			sum(if(sle.posting_date < %(from)s, sle.actual_qty, 0)) as opening,
			sum(if(sle.posting_date >= %(from)s and sle.actual_qty > 0 and sle.voucher_type != 'Stock Reconciliation', sle.actual_qty, 0)) as received,
			sum(if(sle.posting_date >= %(from)s and se.ros_source = 'Recipe', -sle.actual_qty, 0)) as recipe,
			sum(if(sle.posting_date >= %(from)s and se.ros_source = 'Wastage', -sle.actual_qty, 0)) as wastage,
			sum(if(sle.posting_date >= %(from)s and sle.actual_qty < 0 and sle.voucher_type != 'Stock Reconciliation'
				and ifnull(se.ros_source, '') = '', -sle.actual_qty, 0)) as other_out,
			0 as variance
		from `tabStock Ledger Entry` sle
		join tabItem i on i.name = sle.item_code
		left join `tabStock Entry` se on sle.voucher_type = 'Stock Entry' and se.name = sle.voucher_no
		where sle.warehouse = %(wh)s and sle.is_cancelled = 0 and sle.posting_date <= %(to)s
		group by sle.item_code order by sle.item_code""", {"wh": wh, "from": f.from_date, "to": f.to_date}, as_dict=True)
	# stock counts: the Stock Reconciliation rows carry the difference (the ledger keeps qty_after_transaction for them)
	counts = dict(frappe.db.sql("""select sri.item_code, sum(sri.quantity_difference) from `tabStock Reconciliation Item` sri
		join `tabStock Reconciliation` sr on sr.name = sri.parent
		where sr.docstatus = 1 and sr.purpose = 'Stock Reconciliation' and sri.warehouse = %(wh)s
		  and sr.posting_date between %(from)s and %(to)s group by sri.item_code""", {"wh": wh, "from": f.from_date, "to": f.to_date}))
	for r in sle:
		r.variance = flt(counts.get(r.item_code))
	rates = dict(frappe.db.sql("select item_code, valuation_rate from tabBin where warehouse = %s", wh))
	out = []
	for r in sle:
		r.expected = flt(r.opening) + flt(r.received) - flt(r.recipe) - flt(r.wastage) - flt(r.other_out)
		r.counted = r.expected + flt(r.variance)
		usage = flt(r.recipe) + flt(r.wastage)
		r.variance_pct = flt(r.variance) / usage * 100 if usage else 0
		r.valuation_rate = flt(rates.get(r.item_code))
		r.variance_value = flt(r.variance) * r.valuation_rate
		if any(abs(flt(r[k])) > 1e-9 for k in ("received", "recipe", "wastage", "other_out", "variance")) or f.show_all:
			out.append(r)
	return out
