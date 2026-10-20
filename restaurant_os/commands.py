import click
import frappe
from frappe.commands import get_site, pass_context


def _run(context, fn):
	"""Background jobs raised by these commands run inline: no worker is needed and the bench's shared queue (used by
	every site on this bench) is left alone."""
	import frappe.utils.background_jobs as jobs

	frappe.init(get_site(context))
	frappe.connect()
	frappe.set_user("Administrator")
	enqueue = frappe.enqueue

	def inline(method, *args, **kwargs):
		kwargs["now"] = True
		kwargs.pop("enqueue_after_commit", None)
		return enqueue(method, *args, **kwargs)

	frappe.enqueue = jobs.enqueue = inline
	try:
		fn()
	finally:
		frappe.enqueue = jobs.enqueue = enqueue
		frappe.destroy()


@click.command("ros-setup")
@pass_context
def ros_setup(context):
	"""Company Saffron Grill (setup wizard on a fresh site), accounts, warehouses, branch, POS counter, users (idempotent)."""
	from restaurant_os.setup.masters import run

	_run(context, run)


@click.command("ros-demo")
@pass_context
def ros_demo(context):
	"""Demo menu with photos, ingredients, BOM recipes, opening stock, POS Awesome offers, stations, tables (idempotent)."""
	from restaurant_os.setup.demo import run

	_run(context, run)


@click.command("ros-procure")
@pass_context
def ros_procure(context):
	"""Reorder now: raise Material Requests from reorder levels, then turn purchase requests into draft Purchase Orders."""
	from restaurant_os.services.procurement import run

	_run(context, run)


commands = [ros_setup, ros_demo, ros_procure]
