import legibility from "oxlint-plugin-legibility";

export default {
  ...legibility.configs.recommended,
  categories: { correctness: "off" },
};
