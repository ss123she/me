import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [checker({ typescript: true })],
  server: {
    host: "127.0.0.1",
  },
  base: "/me/",
});
