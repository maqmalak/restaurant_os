frappe.query_reports["Ingredient Variance"] = {
	filters: [
		{ fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Restaurant Branch" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -7) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "show_all", label: __("Show Unmoved Items"), fieldtype: "Check" },
	],
	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (["variance", "variance_value"].includes(column.fieldname) && data && data[column.fieldname] < 0) {
			value = `<span style="color: var(--red-600); font-weight: 600">${value}</span>`;
		}
		return value;
	},
};
