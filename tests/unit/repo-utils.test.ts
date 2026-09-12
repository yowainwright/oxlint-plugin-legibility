import assert from "node:assert/strict";
import test from "node:test";

import { parsePackOutput } from "../../scripts/repo/utils.ts";

test("parses npm 12 object-form pack output", () => {
  const output = JSON.stringify({
    "oxlint-plugin-legibility": {
      filename: "oxlint-plugin-legibility-0.0.1.tgz",
    },
  });

  const tarball = parsePackOutput(output, "./npm-release-assets");

  assert.equal(tarball, "npm-release-assets/oxlint-plugin-legibility-0.0.1.tgz");
});
