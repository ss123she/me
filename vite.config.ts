import TypeGPUPlugin from "unplugin-typegpu/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [TypeGPUPlugin()],
  server: {
    host: "127.0.0.1"
  }
})
