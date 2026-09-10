import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import manifest from "../../../../package.json" with { type: "json" };
import oxlint from "./oxlint.config.mjs";
import legibility from "./legibility.config.mjs";
import unicorn from "./unicorn.config.mjs";
import sonarjs from "./sonarjs.config.mjs";

const directory = process.argv[2];
assert.ok(directory, "Expected a benchmark output directory");
const configs = { oxlint, legibility, unicorn, sonarjs };
const packages = ["eslint", "eslint-plugin-legibility", "eslint-plugin-unicorn", "eslint-plugin-sonarjs"];

function readJson(name) {
  const source = readFileSync(join(directory, `${name}.json`), "utf8");
  return JSON.parse(source);
}

function checkDiagnostics(name) {
  const output = readJson(name);
  if (name === "oxlint") {
    assert.equal(output.number_of_files, 50, "Oxlint must lint all 50 files");
    assert.ok(output.diagnostics.length > 0, "Oxlint must report plugin diagnostics");
    output.diagnostics.forEach((diagnostic) => assert.match(diagnostic.code, /^legibility\(/));
    return output.diagnostics.length;
  }
  assert.equal(output.length, 50, `${name} must lint all 50 files`);
  output.forEach((file) => assert.equal(file.fatalErrorCount, 0, file.filePath));
  const messages = output.flatMap((file) => file.messages);
  assert.ok(messages.length > 0, `${name} must report plugin diagnostics`);
  messages.forEach((message) => assert.ok(message.ruleId, message.message));
  return messages.length;
}

function isEnabled(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  const enabled = severity !== "off" && severity !== 0;
  return enabled;
}

function checkCoverage([name, config]) {
  const diagnostics = checkDiagnostics(name);
  const enabledRules = Object.values(config.rules).filter(isEnabled).length;
  return { name, enabledRules, diagnostics };
}

const coverage = Object.entries(configs).map(checkCoverage);

if (process.argv[3] === "results") {
  const dependencies = packages.map((name) => [name, manifest.devDependencies[name]]);
  const versions = Object.fromEntries(dependencies);
  versions[manifest.name] = manifest.version;
  const oxlintManifest = JSON.parse(readFileSync("node_modules/oxlint/package.json", "utf8"));
  versions.oxlint = oxlintManifest.version;
  const measuredAt = new Date().toISOString();
  const cpu = cpus()[0]?.model;
  const environment = { measuredAt, node: process.version, platform: process.platform, arch: process.arch, cpu };
  const timings = readJson("results");
  const result = { environment, versions, files: 50, warmups: 3, coverage, timings };
  process.stdout.write(`BENCHMARK_RESULT=${JSON.stringify(result)}\n`);
} else {
  coverage.forEach(({ name, enabledRules, diagnostics }) => {
    process.stdout.write(`${name}: 50 files, ${enabledRules} enabled rules, ${diagnostics} diagnostics\n`);
  });
}
