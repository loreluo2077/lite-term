import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../../extensions/builtin.workspace/widgets/todo.react"),
    emptyOutDir: true
  }
});
