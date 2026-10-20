/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Every Frappe site on this bench uses the same cookie names (sid, user_id …) and browsers share cookies across ports,
// so Restaurant OS runs on its own hostname: restaurant.localhost (browsers resolve *.localhost by themselves).
// Plain localhost redirects there, and / redirects to the app at /ros/pos.
const PORT = 5181;
const SITE = "restaurant.localhost";

function ownHostname(): Plugin {
  return {
    name: "ros-own-hostname",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = (req.headers.host ?? "").split(":")[0];
        if (requested === "localhost" || requested === "127.0.0.1") {
          res.writeHead(302, { Location: `http://${SITE}:${PORT}${req.url ?? "/"}` });
          res.end();
          return;
        }
        if (req.url === "/" || req.url === "" || req.url === "/ros") {
          res.writeHead(302, { Location: "/ros/pos" });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:8008";
  const proxy = {
    target,
    changeOrigin: true,
    headers: { Host: SITE, "X-Frappe-Site-Name": SITE },
    cookieDomainRewrite: "",
    secure: false,
  };
  return {
    plugins: [react(), ownHostname()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
    // the build is served by Frappe from /assets/restaurant_os/frontend/ (www/ros.html loads it, routes under /ros)
    base: command === "build" ? "/assets/restaurant_os/frontend/" : "/",
    server: {
      port: PORT,
      strictPort: true,
      host: true,
      allowedHosts: [SITE, "localhost"],
      proxy: {
        "/api": proxy,
        "/files": proxy,
        "/private": proxy,
        "/assets": proxy,
        "/app": proxy,
        "/desk": proxy,
        "/printview": proxy,
        "/socket.io": { target: env.VITE_SOCKETIO_TARGET || "http://127.0.0.1:9000", ws: true, changeOrigin: false,
          headers: { "X-Frappe-Site-Name": SITE } },
      },
    },
    build: {
      outDir: "../../../restaurant_os/public/frontend",
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-frappe": ["frappe-react-sdk", "swr", "axios"],
            "vendor-charts": ["recharts"],
          },
        },
      },
    },
  };
});
