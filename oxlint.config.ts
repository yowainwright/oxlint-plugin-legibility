import { defineConfig } from "oxlint";
import legibility from "oxlint-plugin-legibility";

export default defineConfig({
  extends: [legibility.configs.strict],
  ignorePatterns: [
    ".build/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "pnpm-lock.yaml",
    "tests/fixtures/oxlint/**/oxlint.config.mjs",
  ],
  overrides: [
    {
      files: ["scripts/**/*.ts", "src/**/*.ts", "tests/runner/**/*.ts"],
      rules: {
        complexity: [
          "error",
          {
            max: 20,
            variant: "classic",
          },
        ],
        "max-lines-per-function": [
          "error",
          {
            max: 20,
            skipBlankLines: true,
            skipComments: true,
            IIFEs: true,
          },
        ],
        "typescript/no-explicit-any": "error",
      },
    },
  ],
});
