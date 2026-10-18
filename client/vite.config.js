import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development, requests to /products and /orders are forwarded
// to the Express API running on port 3000 (this also avoids CORS issues).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/products": "http://localhost:3000",
      "/orders": "http://localhost:3000",
    },
  },
});
