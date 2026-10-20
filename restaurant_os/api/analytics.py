"""Owner dashboard and reports for the React app (same numbers as the desk script reports)."""

import json

import frappe
from frappe import _

from restaurant_os.services import analytics as svc

ROLES = ("System Manager", "Sales Manager", "Accounts Manager", "Stock Manager")


def _check():
	if not set(ROLES) & set(frappe.get_roles()):
		frappe.throw(_("Only managers can see the owner dashboard."), frappe.PermissionError)


def _f(filters):
	return json.loads(filters) if isinstance(filters, str) else (filters or {})


@frappe.whitelist()
def live(branch: str | None = None) -> dict:
	_check()
	return svc.live(branch)


@frappe.whitelist()
def sales(filters: str | None = None) -> list:
	_check()
	return svc.sales(_f(filters))


@frappe.whitelist()
def kitchen(filters: str | None = None) -> dict:
	_check()
	return svc.kitchen(_f(filters))


@frappe.whitelist()
def menu_engineering(filters: str | None = None) -> dict:
	_check()
	return svc.menu_engineering(_f(filters))


@frappe.whitelist()
def customers(filters: str | None = None) -> dict:
	_check()
	return svc.customers(_f(filters))
