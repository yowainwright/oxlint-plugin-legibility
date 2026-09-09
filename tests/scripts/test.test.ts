import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildTestRunPlan,
  isTestRunMode,
  listTestFiles,
  parseTestRunMode,
  remapCoverageSources,
  runTestPlan,
} from "../helpers/index.ts";
import { isDirectRun } from "../../scripts/test/utils.ts";
import type { TestCommandRunner, TestRunPlan } from "../helpers/types.ts";

function createTempDirectory(): string {
  const root = fileURLToPath(new URL("../../tmp/", import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "legibility-test-"));
  return directory;
}

test("parses Node test and coverage modes", () => {
  assert.equal(isTestRunMode("node-ts"), true);
  assert.equal(isTestRunMode("coverage"), true);
  assert.equal(isTestRunMode(undefined), false);
  assert.equal(isTestRunMode("unknown"), false);
  assert.equal(parseTestRunMode(["node-ts"]), "node-ts");
  assert.equal(parseTestRunMode(["coverage"]), "coverage");
  assert.throws(() => parseTestRunMode([]), /Invalid test run mode/);
  assert.throws(() => parseTestRunMode(["unknown"]), /Invalid test run mode/);
});

test("builds Node test and coverage run plans", () => {
  const nodePlan = buildTestRunPlan("node-ts");
  const coveragePlan = buildTestRunPlan("coverage");

  assert.equal(nodePlan.command, process.execPath);
  assert.deepEqual(nodePlan.args, ["--test"]);
  assert.deepEqual(nodePlan.testDirectories, ["tests/unit", "tests/scripts"]);
  assert.equal(nodePlan.coverageFile, undefined);
  assert.equal(coveragePlan.command, process.execPath);
  assert.deepEqual(coveragePlan.args, [
    "--test",
    "--experimental-test-coverage",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    "--test-reporter-destination=coverage/lcov.info",
  ]);
  assert.deepEqual(coveragePlan.testDirectories, ["tests/unit", "tests/scripts"]);
  assert.equal(coveragePlan.coverageFile, "coverage/lcov.info");
});

test("detects direct script execution with resolved file URLs", () => {
  const directory = createTempDirectory();
  const scriptPath = join(directory, "run tests.ts");

  try {
    const scriptUrl = pathToFileURL(scriptPath).href;
    assert.equal(isDirectRun(scriptUrl, scriptPath), true);
    assert.equal(isDirectRun(scriptUrl, undefined), false);
    assert.equal(isDirectRun(scriptUrl, join(directory, "other.ts")), false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("lists matching test files recursively in sorted order", () => {
  const directory = createTempDirectory();
  const nestedDirectory = join(directory, "nested");

  try {
    mkdirSync(nestedDirectory);
    writeFileSync(join(directory, "z.test.ts"), "");
    writeFileSync(join(directory, "a.ts"), "");
    writeFileSync(join(nestedDirectory, "b.test.ts"), "");

    assert.deepEqual(listTestFiles(directory, ".test.ts"), [
      join(directory, "nested", "b.test.ts"),
      join(directory, "z.test.ts"),
    ]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("remaps generated coverage source paths", () => {
  const directory = createTempDirectory();
  const coveragePath = join(directory, "lcov.info");

  try {
    writeFileSync(coveragePath, "SF:dist/index.js\nSF:.build/scripts/repo/utils.js\n");
    remapCoverageSources(coveragePath);
    assert.equal(readFileSync(coveragePath, "utf8"), "SF:src/index.ts\nSF:scripts/repo/utils.ts\n");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("runs a test plan with sorted files and remaps passing coverage", () => {
  const directory = createTempDirectory();
  const testDirectory = join(directory, "tests");
  const coveragePath = join(directory, "coverage", "lcov.info");
  let recordedCommand = "";
  let recordedArgs: string[] = [];
  const commandRunner: TestCommandRunner = (command, args) => {
    recordedCommand = command;
    recordedArgs = Array.from(args);
    assert.equal(existsSync(dirname(coveragePath)), true);
    writeFileSync(coveragePath, "SF:dist/constants.js\n");
    return { status: 0 };
  };
  const plan: TestRunPlan = {
    args: ["--test"],
    command: process.execPath,
    coverageFile: coveragePath,
    testDirectories: [testDirectory],
  };

  try {
    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(join(testDirectory, "b.test.ts"), "");
    writeFileSync(join(testDirectory, "a.test.ts"), "");

    assert.equal(runTestPlan(plan, commandRunner), 0);
    assert.equal(recordedCommand, process.execPath);
    assert.deepEqual(recordedArgs, [
      "--test",
      join(testDirectory, "a.test.ts"),
      join(testDirectory, "b.test.ts"),
    ]);
    assert.equal(readFileSync(coveragePath, "utf8"), "SF:src/constants.ts\n");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("fails when a test plan has no matching files", () => {
  const directory = createTempDirectory();
  const coveragePath = join(directory, "coverage", "lcov.info");
  const plan: TestRunPlan = {
    args: ["--test"],
    command: process.execPath,
    coverageFile: coveragePath,
    testDirectories: [directory],
  };
  const commandRunner: TestCommandRunner = () => {
    throw new Error("The runner must not execute an empty test plan");
  };

  try {
    assert.throws(() => runTestPlan(plan, commandRunner), /No \.test\.ts files found/);
    assert.equal(existsSync(dirname(coveragePath)), false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

[2, null].forEach((status) => {
  test(`preserves coverage and fails when the test process returns ${status}`, () => {
    const directory = createTempDirectory();
    const coverageFile = join(directory, "lcov.info");
    const commandRunner: TestCommandRunner = () => ({ status });
    const plan = { args: ["--test"], command: process.execPath, coverageFile, testDirectories: [directory] };
    try {
      writeFileSync(join(directory, "example.test.ts"), "");
      writeFileSync(coverageFile, "SF:dist/index.js\n");
      assert.equal(runTestPlan(plan, commandRunner), status ?? 1);
      assert.equal(readFileSync(coverageFile, "utf8"), "SF:dist/index.js\n");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

test("runs a discovered file through the default Node subprocess", () => {
  const directory = createTempDirectory();
  const marker = join(directory, "passed");
  const plan = { args: [], command: process.execPath, testDirectories: [directory] };
  const source = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "passed");`;
  try {
    writeFileSync(join(directory, "example.test.ts"), source);
    assert.equal(runTestPlan(plan), 0);
    assert.equal(readFileSync(marker, "utf8"), "passed");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("the CLI discovers and executes tests in the current workspace", (context) => {
  const directory = createTempDirectory();
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const unitDirectory = join(directory, "tests", "unit");
  const scriptDirectory = join(directory, "tests", "scripts");
  mkdirSync(unitDirectory, { recursive: true });
  mkdirSync(scriptDirectory, { recursive: true });
  writeFileSync(join(unitDirectory, "example.test.ts"), 'import test from "node:test"; test("CLI fixture", () => {});');
  const script = fileURLToPath(new URL("../helpers/index.ts", import.meta.url));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [script, "node-ts"], {
    cwd: directory, encoding: "utf8", env, timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLI fixture/);
});

const invalidCliCases = [
  { args: [], message: "Invalid test run mode: (missing)" },
  { args: ["unknown"], message: "Invalid test run mode: unknown" },
  { args: ["e2e"], message: "Invalid end-to-end mode: (missing)" },
];

invalidCliCases.forEach(({ args, message }) => {
  test(`the CLI rejects ${JSON.stringify(args)}`, () => {
    const script = fileURLToPath(new URL("../helpers/index.ts", import.meta.url));
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), message);
  });
});
