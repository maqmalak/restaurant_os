import preset from "@ros/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
};
