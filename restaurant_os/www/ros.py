import frappe

no_cache = 1


def get_context(context):
	"""The Restaurant OS React app; signed-out visitors get the app's own login screen."""
	context.no_cache = 1
	context.ros_site = frappe.local.site
	return context
