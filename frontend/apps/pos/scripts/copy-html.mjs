// After `vite build`: copy the built index.html to restaurant_os/www/ros.html so Frappe serves the SPA at /ros
// (hooks.py → website_route_rules sends /ros/* there too). The CSRF token is filled in by Jinja on each request.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, "../../../../restaurant_os/public/frontend/index.html");
const target = resolve(here, "../../../../restaurant_os/www/ros.html");
const html = readFileSync(built, "utf8").replace(
  "<!-- frappe-boot -->",
  "<script>window.csrf_token = '{{ frappe.session.csrf_token }}'; window.ros_site = '{{ ros_site }}';</script>",
);
writeFileSync(target, html);
console.log("wrote", target);
