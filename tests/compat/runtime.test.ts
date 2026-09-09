import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/plugin.ts", import.meta.url));
const denoCache = fileURLToPath(new URL("../../tmp/deno-cache", import.meta.url));
const env = { ...process.env, DENO_DIR: denoCache };
const runtimes = [
  { command: "bun", args: ["run"] },
  {
    command: "deno",
    args: ["run", "--no-config", "--no-lock", "--node-modules-dir=manual", "--cached-only", "--allow-read"],
  },
];

runtimes.forEach(({ command, args }) => {
  test(`${command} loads ESM and CommonJS package exports`, () => {
    const result = spawnSync(command, args.concat(fixture, command), {
      encoding: "utf8", env, timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Runtime compatibility passed/);
  });
});
