import assert from "node:assert/strict";
import { createRequire } from "node:module";
import plugin from "oxlint-plugin-legibility";
import manifest from "oxlint-plugin-legibility/package.json" with { type: "json" };

const runtime = process.argv[2];
assert.ok(runtime);
assert.ok(process.versions[runtime], `Expected the ${runtime} runtime`);

const require = createRequire(import.meta.url);
const commonjsPlugin: typeof plugin = require("oxlint-plugin-legibility");
const presetNames = ["recommended", "strict", "agentRecommended", "agentStrict"];

function checkPlugin(loaded: typeof plugin): void {
  assert.equal(loaded.meta.name, manifest.name);
  assert.equal(loaded.meta.version, manifest.version);
  assert.equal(loaded.meta.namespace, "legibility");
  assert.deepEqual(Object.keys(loaded.configs), presetNames);
  assert.ok(loaded.rules["prefer-early-return"]);
  Object.values(loaded.rules).forEach((rule) => {
    assert.equal(typeof rule.createOnce, "function");
  });
}

[plugin, commonjsPlugin].forEach(checkPlugin);

assert.deepEqual(commonjsPlugin.configs, plugin.configs);
assert.deepEqual(Object.keys(commonjsPlugin.rules), Object.keys(plugin.rules));
process.stdout.write("Runtime compatibility passed\n");
