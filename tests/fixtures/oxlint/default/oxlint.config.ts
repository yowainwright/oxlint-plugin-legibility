import { defineConfig } from "oxlint";

import legibility from "oxlint-plugin-legibility";
export default defineConfig({
  jsPlugins: legibility.configs.strict.jsPlugins,
  rules: {
    "legibility/max-function-parameters": "error",
    "legibility/no-complex-ternaries": "error",
    "legibility/prefer-early-return": "error",
    "legibility/prefer-flat-map": "error",
    "legibility/prefer-object-lookup": "error",
  },
});
