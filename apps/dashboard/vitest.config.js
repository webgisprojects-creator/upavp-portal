import { defineConfig } from "vitest/config";

// Unit tests only exercise plain JavaScript modules and JSON data, so no browser / React plugin is needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
