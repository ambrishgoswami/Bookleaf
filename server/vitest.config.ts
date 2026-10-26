import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { NODE_ENV: "test" },
    include: ["tests/**/*.test.ts"],
    // Integration tests share the seeded dev database — run files serially.
    fileParallelism: false,
  },
});
