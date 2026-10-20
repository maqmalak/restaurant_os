frappe.query_reports["Restaurant Sales Analysis"] = {
	filters: [
		{ fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Restaurant Branch" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -6) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "group_by", label: __("Group By"), fieldtype: "Select", default: "Channel",
		  options: "Channel\nOrder Type\nBranch\nItem\nItem Group\nHour\nDay Part\nWeekday\nDate\nCashier" },
		{ fieldname: "channel", label: __("Channel"), fieldtype: "Select", options: "\nPOS\nDine-in\nTakeaway\nPhone\nDrive-thru\nKiosk\nWeb\nApp\nFoodpanda" },
	],
};
