frappe.query_reports["Menu Engineering"] = {
	filters: [ { fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Restaurant Branch" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -6) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() }, ],
	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		const colours = { Star: "green", Plowhorse: "blue", Puzzle: "orange", Dog: "red" };
		if (column.fieldname === "class" && data) value = `<span class="indicator-pill ${colours[data.class] || "gray"}">${value}</span>`;
		return value;
	},
};
