import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": resolve(rootDir, "src/test/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    env: {
      SKIP_ENV_VALIDATION: "true",
      NODE_ENV: "test",
    },
  },
});
