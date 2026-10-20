frappe.query_reports["Customer Insights"] = { filters: [ { fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Restaurant Branch" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -6) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() }, ] };
