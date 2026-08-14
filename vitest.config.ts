import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      include: ["src/domain/**/*.ts"],
      reporter: ["text", "html"],
    },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
