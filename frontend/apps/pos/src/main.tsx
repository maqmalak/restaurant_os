import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { applyInitialTheme } from "@/components/layout/theme-provider";
import "@ros/ui/globals.css";

applyInitialTheme();

// Open the native date / time picker on any click in such a box (not only on its small icon).
const PICKER_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);
document.addEventListener("click", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !PICKER_TYPES.has(el.type) || el.disabled || el.readOnly) return;
  try {
    (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  } catch {
    /* typing remains available */
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/ros">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
