import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const oxlintConfigFilename = "oxlint.config.ts";
export const oxlintFixtureRoot = "tests/fixtures/oxlint";

export interface OxlintFixtureConfig {
  content: string;
  directory: string;
}

export function getOxlintFixtureConfigs(): OxlintFixtureConfig[] {
  const defaultConfig = createDefaultOxlintConfig();
  const recommendedConfig = createPresetOxlintConfig("recommended");
  const strictConfig = createPresetOxlintConfig("strict");
  const optInConfig = createOptInOxlintConfig();

  return [
    { directory: "default", content: defaultConfig },
    { directory: "recommended", content: recommendedConfig },
    { directory: "strict", content: strictConfig },
    { directory: "opt-in", content: optInConfig },
  ];
}

export function writeOxlintFixtureConfigs(root = oxlintFixtureRoot): void {
  const writeConfig = (config: OxlintFixtureConfig): void =>
    writeOxlintFixtureConfig(root, config);

  getOxlintFixtureConfigs().forEach(writeConfig);
}

function writeOxlintFixtureConfig(root: string, config: OxlintFixtureConfig): void {
  const directory = join(root, config.directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, oxlintConfigFilename), config.content);
}

function isDirectRun(argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;
  return import.meta.url === pathToFileURL(resolve(argvPath)).href;
}

function createOxlintConfigHeader(): string {
  return [
    'import { defineConfig } from "oxlint";',
    "",
    'import legibility from "oxlint-plugin-legibility";',
    "",
  ].join("\n");
}

function createPresetOxlintConfig(name: string): string {
  const header = createOxlintConfigHeader();
  return `${header}export default defineConfig(legibility.configs.${name});\n`;
}

function createDefaultOxlintConfig(): string {
  const rules = [
    '"legibility/max-function-parameters": "error"',
    '"legibility/no-complex-ternaries": "error"',
    '"legibility/prefer-early-return": "error"',
    '"legibility/prefer-flat-map": "error"',
    '"legibility/prefer-object-lookup": "error"',
  ];
  return createObjectOxlintConfig(rules);
}

function createObjectOxlintConfig(rules: string[]): string {
  const ruleLines = rules.map((rule) => `    ${rule},`).join("\n");
  const header = createOxlintConfigHeader();
  return `${header}export default defineConfig({
  jsPlugins: legibility.configs.strict.jsPlugins,
  rules: {
${ruleLines}
  },
});
`;
}

const optInRulesSource = `const optInRules = {
  "legibility/no-unmatched-comments": "error",
  "legibility/prefer-concat-object-assign": "error",
  "legibility/require-executable-shebang": [
    "error",
    { files: ["**/button.ts"] },
  ],
  "legibility/require-filename-matches-dirname": [
    "error",
    { schema: "index", minDepth: 1 },
  ],
};
`;

function createOptInOxlintConfig(): string {
  const header = createOxlintConfigHeader();
  return `${header}const preset = legibility.configs.strict;
${optInRulesSource}const rules = Object.assign({}, preset.rules, optInRules);

export default defineConfig({
  ignorePatterns: ["oxlint.config.ts"],
  jsPlugins: preset.jsPlugins,
  rules,
});
`;
}

if (isDirectRun()) {
  writeOxlintFixtureConfigs();
}
