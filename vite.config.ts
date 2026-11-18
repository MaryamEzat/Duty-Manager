import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // public/ only holds the retired static prototype (dm.html, pages/, js/, docs/); the code app doesn't use it.
  publicDir: false,
});
