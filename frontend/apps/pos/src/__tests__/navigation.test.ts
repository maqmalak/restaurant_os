import { describe, expect, it } from "vitest";
import { POS_NAVIGATION, titleForSegment } from "@/app/navigation";
import { DOC_ROUTES, docUrl } from "@/app/doc-routes";
import { printUrl } from "@/pages/POS/pos-panels";

describe("navigation", () => {
  it("every sidebar link has a breadcrumb title", () => {
    for (const item of POS_NAVIGATION.flatMap((g) => g.items)) {
      const last = item.to.split("/").filter(Boolean).pop()!;
      expect(titleForSegment(last)).not.toMatch(/^[a-z]/);
    }
  });

  it("POS Awesome documents open in the app, others in the desk", () => {
    expect(docUrl("POS Opening Shift", "POSA-OS-26-0000001")).toEqual({ href: "/pos/openings/POSA-OS-26-0000001", external: false });
    expect(docUrl("Journal Entry", "ACC-JV-1").external).toBe(true);
    expect(DOC_ROUTES["POS Invoice"]).toBe("/pos/invoices/");   // the default invoice mode
    expect(DOC_ROUTES["Restaurant Order"]).toBe("/restaurant/orders/");
  });
});

describe("printUrl", () => {
  it("prints Sales Invoices by default and POS Invoices by their series", () => {
    expect(printUrl("ACC-SINV-2026-00001")).toContain("doctype=Sales%20Invoice");
    expect(printUrl("ACC-PSINV-2026-00001")).toContain("doctype=POS%20Invoice");
  });
});
