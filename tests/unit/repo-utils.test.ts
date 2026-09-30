import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  getCommentDiagnostics,
  evaluateSessionLint,
  parseAddedLines,
  parsePackOutput,
  runCommentPolicy,
  selectCommentViolations,
} from "../../scripts/repo/utils.ts";
import plugin from "../../src/index.ts";

const oxlint = resolve("node_modules/.bin/oxlint");
const pluginPath = resolve("dist/index.js");
const fixturesRoot = resolve("tests/.test-fixtures");

function writeFixture(root: string, filename: string, source: string): void {
  const path = join(root, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function createPresetFixture(preset: "strict" | "all" | "agentStrict"): string {
  mkdirSync(fixturesRoot, { recursive: true });
  const root = mkdtempSync(join(fixturesRoot, "presets-"));
  const jsPlugins = [{ name: "legibility", specifier: pluginPath }];
  const rules = plugin.configs[preset].rules;
  const config = JSON.stringify({ jsPlugins, rules });
  writeFixture(root, ".oxlintrc.json", config);
  writeFixture(root, "src/index.ts", "export const value = true;");
  writeFixture(root, "src/cli/index.ts", "export const value = true;");
  writeFixture(root, "src/components/button/unrelated.ts", "export const value = true;");
  writeFixture(root, "src/components/button/button.ts", "// Existing comment\nexport const items = []; export const next = [...items];");
  return root;
}

function lintPresetFixture(cwd: string): string[] {
  const args = [
    "--no-ignore", "--config", ".oxlintrc.json", "--format", "json",
    "src/index.ts", "src/cli/index.ts",
    "src/components/button/unrelated.ts", "src/components/button/button.ts",
  ];
  const result = spawnSync(oxlint, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.startsWith("{"), result.stdout);
  const { diagnostics } = JSON.parse(result.stdout);
  const codes = diagnostics.map((diagnostic: { code: string }) => diagnostic.code).toSorted();
  return codes;
}

const completePresets = ["strict", "all", "agentStrict"] as const;
completePresets.forEach((preset) => {
  test(`${preset} enforces every former opt-in rule through Oxlint without options`, (context) => {
    const cwd = createPresetFixture(preset);
    context.after(() => rmSync(cwd, { recursive: true, force: true }));
    const codes = lintPresetFixture(cwd);
    assert.deepEqual(codes, [
      "legibility(no-unmatched-comments)",
      "legibility(prefer-concat-object-assign)",
      "legibility(require-executable-shebang)",
      "legibility(require-filename-matches-dirname)",
    ]);
  });
});

test("comment parsing ignores comment-like strings, regexes, templates, JSX text, and shebangs", () => {
  const source = [
    "#!/usr/bin/env node",
    'const url = "https://example.com";',
    'const block = "/* text */";',
    'const template = `// text`;',
    'const pattern = /\\/\\//;',
    'export const view = <div>// text</div>;',
  ].join("\n");
  assert.deepEqual(getCommentDiagnostics("sample.tsx", source), []);
});

test("comment parsing includes JSDoc, JSX comments, and inline disable directives", () => {
  const source = [
    "/* oxlint-disable */",
    "/** API documentation */",
    'export const view = <div>{/* WHY: retain */}</div>;',
    "// eslint-disable-next-line",
  ].join("\n");
  const diagnostics = getCommentDiagnostics("sample.tsx", source);
  assert.deepEqual(diagnostics.map(({ line }) => line), [1, 2, 3, 4]);
});

test("session comment diagnostics use the plugin's catalog ID", () => {
  const diagnostics = getCommentDiagnostics("sample.ts", "// new comment");
  const ruleId = plugin.rules["no-unmatched-comments"]?.meta.docs?.ruleId;
  assert.equal(ruleId, "LEG039");
  assert.equal(diagnostics[0]?.message, `[${ruleId}] New comments are forbidden during agent sessions.`);
});

test("comment locations preserve Unicode columns and CRLF line boundaries", () => {
  const source = 'const value = "🦉"; // comment\r\n/* start\r\nend */\r\n';
  const diagnostics = getCommentDiagnostics("sample.ts", source);
  const locations = diagnostics.map(({ line, column, endLine }) => ({ line, column, endLine }));
  assert.deepEqual(locations, [
    { line: 1, column: 21, endLine: 1 },
    { line: 2, column: 1, endLine: 3 },
  ]);
});

test("session filtering checks new files and any added line inside a block comment", () => {
  const source = "// existing\nexport const value = true;\n/* start\nchanged\nend */\n";
  const diagnostics = getCommentDiagnostics("sample.ts", source);
  const changedLines = new Map([["sample.ts", new Set([4])]]);
  const selected = selectCommentViolations(diagnostics, new Set(), changedLines);
  assert.deepEqual(selected.map(({ line }) => line), [3]);
  assert.deepEqual(selectCommentViolations(diagnostics, new Set(["sample.ts"]), new Map()), diagnostics);
  assert.deepEqual(selectCommentViolations(diagnostics, new Set(), new Map()), []);
});

test("comment parsing fails on invalid syntax instead of accepting an incomplete comment list", () => {
  assert.throws(() => getCommentDiagnostics("sample.ts", "export const = ;"), /Cannot check comments/);
});

test("Git added lines preserve Unicode and quoted filenames and ignore header-like source text", () => {
  const diff = [
    "diff --git a/café.ts b/café.ts", "--- a/café.ts", "+++ b/café.ts",
    "@@ -1 +1,2 @@", "+const text = `", "+++ b/pretend.ts", "@@ -9 +10 @@", "+`",
    'diff --git "a/tab\\tname.ts" "b/tab\\tname.ts"',
    '--- "a/tab\\tname.ts"', '+++ "b/tab\\tname.ts"', "@@ -2,0 +3 @@", "+// new",
  ].join("\n");
  const lines = parseAddedLines(diff);
  assert.deepEqual(lines.get("café.ts"), new Set([1, 2, 10]));
  assert.deepEqual(lines.get("tab\tname.ts"), new Set([3]));
  assert.equal(lines.has("pretend.ts"), false);
});

test("pure renames and deleted lines do not mark comments as additions", () => {
  const diff = [
    "diff --git a/old.ts b/new.ts", "similarity index 100%", "rename from old.ts", "rename to new.ts",
    "diff --git a/changed.ts b/changed.ts", "--- a/changed.ts", "+++ b/changed.ts",
    "@@ -1 +0,0 @@", "-// deleted",
  ].join("\n");
  assert.equal(parseAddedLines(diff).size, 0);
});

function createCommentFixture(source: string, rules = plugin.configs.strict.rules): string {
  mkdirSync(fixturesRoot, { recursive: true });
  const root = mkdtempSync(join(fixturesRoot, "comments-"));
  const jsPlugins = [{ name: "legibility", specifier: pluginPath }];
  const config = JSON.stringify({ jsPlugins, rules });
  writeFixture(root, ".oxlintrc.json", config);
  writeFixture(root, "sample.ts", source);
  return root;
}

function lintCommentFixture(cwd: string, forbidComments: boolean, failOnWarnings = false): number | null {
  const args = ["--no-ignore", "--config", ".oxlintrc.json", "--format", "json", "--", "sample.ts"];
  const result = spawnSync(oxlint, args, { cwd, encoding: "utf8" });
  if (forbidComments) return evaluateSessionLint(result, failOnWarnings);
  return result.status;
}

test("session lint permits untouched comments while ordinary strict lint reports them", (context) => {
  const cwd = createCommentFixture("// Existing comment\nexport const value = true;\n");
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  const file = join(cwd, "sample.ts");
  const changedLines = new Map([[file, new Set([2])]]);
  assert.equal(lintCommentFixture(cwd, false), 1);
  assert.equal(lintCommentFixture(cwd, true), 0);
  assert.equal(runCommentPolicy([file], new Set(), changedLines), 0);
});

test("human allowlists cannot admit new comments during agent sessions", (context) => {
  const options = { prefixIdentifiers: ["WHY:"] };
  const exceptions = { "legibility/no-unmatched-comments": ["error", options] };
  const rules = Object.assign({}, plugin.configs.strict.rules, exceptions);
  const cwd = createCommentFixture("// WHY: Human exception\nexport const value = true;\n", rules);
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = context.mock.method(process.stderr, "write", () => true);
  const file = join(cwd, "sample.ts");
  assert.equal(lintCommentFixture(cwd, false), 0);
  assert.equal(runCommentPolicy([file], new Set([file]), new Map()), 1);
  assert.match(String(output.mock.calls[0]?.arguments[0]), /New comments are forbidden/);
});

test("inline directives and disabled comment rules cannot bypass the session check", (context) => {
  const rules = Object.assign({}, plugin.configs.strict.rules, { "legibility/no-unmatched-comments": "off" });
  const source = "/* oxlint-disable */\n// eslint-disable-next-line\nexport const value = true;\n";
  const cwd = createCommentFixture(source, rules);
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  context.mock.method(process.stderr, "write", () => true);
  const file = join(cwd, "sample.ts");
  assert.equal(lintCommentFixture(cwd, false), 0);
  assert.equal(runCommentPolicy([file], new Set([file]), new Map()), 1);
});

test("session comment checks fail on unreadable files and parse errors", (context) => {
  const cwd = createCommentFixture("export const = ;");
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  context.mock.method(process.stderr, "write", () => true);
  const file = join(cwd, "sample.ts");
  const missing = join(cwd, "missing.ts");
  assert.equal(runCommentPolicy([file], new Set(), new Map()), 1);
  assert.equal(runCommentPolicy([missing], new Set(), new Map()), 1);
});

test("session lint preserves other rule errors", (context) => {
  const source = "// Existing comment\nexport function read(a, b, c, d, e) { return a; }";
  const cwd = createCommentFixture(source);
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = context.mock.method(process.stderr, "write", () => true);
  assert.equal(lintCommentFixture(cwd, true), 1);
  const messages = output.mock.calls.map(({ arguments: args }) => String(args[0])).join("");
  assert.match(messages, /max-function-parameters/);
  assert.doesNotMatch(messages, /no-unmatched-comments/);
});

test("session lint rejects warnings in new files and preserves normal warning results", (context) => {
  const source = "export function read(a, b, c, d, e) { return a; }";
  const cwd = createCommentFixture(source, plugin.configs.recommended.rules);
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  context.mock.method(process.stderr, "write", () => true);
  assert.equal(lintCommentFixture(cwd, true, false), 0);
  assert.equal(lintCommentFixture(cwd, true, true), 1);
});

test("session lint rejects parse and configuration failures", (context) => {
  const cwd = createCommentFixture("export const = ;");
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  context.mock.method(process.stderr, "write", () => true);
  assert.equal(lintCommentFixture(cwd, true), 1);
  writeFixture(cwd, ".oxlintrc.json", "{ invalid }");
  assert.equal(lintCommentFixture(cwd, true), 1);
});

test("parses npm 12 object-form pack output", () => {
  const output = JSON.stringify({
    "oxlint-plugin-legibility": {
      filename: "oxlint-plugin-legibility-0.0.1.tgz",
    },
  });

  const tarball = parsePackOutput(output, "./npm-release-assets");

  assert.equal(tarball, "npm-release-assets/oxlint-plugin-legibility-0.0.1.tgz");
});

test("preserves legacy pack output forms", () => {
  const filename = "oxlint-plugin-legibility-0.0.1.tgz";
  const outputs = [JSON.stringify([{ filename }]), JSON.stringify({ filename })];

  outputs.forEach((output) => {
    const tarball = parsePackOutput(output, "./npm-release-assets");
    assert.equal(tarball, `npm-release-assets/${filename}`);
  });
});
