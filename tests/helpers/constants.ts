import type { E2eMode, TestRunMode } from "./types.ts";

export const testModes = new Set<TestRunMode>(["coverage", "node-ts"]);
export const e2eModes = new Set<E2eMode>(["benchmark", "test"]);
export const composeFile = "tests/e2e/docker/compose.yml";
export const coverageFile = "coverage/lcov.info";
export const coverageArgs = [
  "--test",
  "--experimental-test-coverage",
  "--test-reporter=lcov",
  `--test-reporter-destination=${coverageFile}`,
];
export const testFileExtension = ".test.ts";
