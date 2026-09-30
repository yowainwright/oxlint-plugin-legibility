import legibility from "oxlint-plugin-legibility";

const categories = { correctness: "off" };

export default Object.assign({}, legibility.configs.recommended, { categories });
