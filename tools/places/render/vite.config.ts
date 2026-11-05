import { defineConfig } from "vite";

// A plain dev server for the render page (the app's own config pulls in plugins the page does not need).
export default defineConfig({ root: process.cwd(), server: { port: 5199, strictPort: true } });
