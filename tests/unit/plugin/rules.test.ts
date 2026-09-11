import assert from "node:assert/strict";
import test from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

import manifest from "../../../package.json" with { type: "json" };
import {
  COMMENT_RULE_NAMES,
  OPT_IN_RULE_NAMES,
  RECOMMENDED_RULE_NAMES,
  STRICT_ONLY_RULE_NAMES,
} from "../../../src/constants.ts";
import plugin from "../../../src/index.ts";
import type {
  AstNode, AstPrimitive, RuleContext, RuleListener, RuleOptions, RuleReport, RuleReportData,
} from "../../../src/types.ts";

type NativeRule = Parameters<RuleTester["run"]>[1];

RuleTester.describe = (_name, callback) => callback();
RuleTester.it = (_name, callback) => callback();

const ruleTester = new RuleTester({
  languageOptions: {
    globals: { Map: "readonly", Set: "readonly" },
    parserOptions: { lang: "tsx" },
  },
});

function runNative(name: string, cases: RuleTester.TestCases): void {
  const rule = getRule(name) as unknown as NativeRule;
  ruleTester.run(name, rule, cases);
}

function getRule(name: string) {
  const rule = plugin.rules[name];
  assert.ok(rule, `Unknown rule: ${name}`);
  return rule;
}

function visit(visitor: RuleListener, name: string, node: AstNode): void {
  const handler = visitor[name];
  assert.ok(handler, `Missing visitor: ${name}`);
  Reflect.apply(handler, visitor, [node]);
}

function getReport(reports: RuleReport[], index: number): RuleReport {
  const report = reports[index];
  assert.ok(report, `Missing report at index ${index}`);
  return report;
}

function getReportData(reports: RuleReport[], index: number): RuleReportData {
  const data = getReport(reports, index).data;
  assert.ok(data, `Missing report data at index ${index}`);
  return data;
}

function runHook(visitor: RuleListener, name: "before" | "after"): void {
  const hook = visitor[name];
  if (hook) Reflect.apply(hook, visitor, []);
}

function createContext(options: RuleOptions = [], overrides: Partial<RuleContext> = {}) {
  const reports: RuleReport[] = [];
  const sourceCode = {
    ast: { type: "Program" },
    text: "const value = true;\n",
    getText: (node?: AstNode) => node?.__text ?? "",
    isGlobalReference: () => true,
  };
  const context: RuleContext = Object.assign({
    options,
    filename: "/repo/src/index.js",
    cwd: "/repo",
    sourceCode,
    report(report: RuleReport) {
      reports[reports.length] = report;
    },
  }, overrides);
  return { context, reports };
}

function createRule(name: string, options: RuleOptions = [], overrides: Partial<RuleContext> = {}) {
  const { context, reports } = createContext(options, overrides);
  const visitor = getRule(name).createOnce(context);
  runHook(visitor, "before");
  return { context, reports, visitor };
}

function createCommentRule(name: string, comments: AstNode[], options: RuleOptions = []) {
  return createRule(name, options, {
    sourceCode: {
      text: "",
      getAllComments: () => comments,
      getText(node) {
        if (!node) return "";
        const text = typeof node.__text === "string" ? node.__text : "";
        return text;
      },
    },
  });
}

function comment(type: "Block" | "Line", value: string, text: string): AstNode {
  return { type, value, __text: text };
}

function locatedComment(
  type: "Block" | "Line",
  value: string,
  text: string,
  startLine: number,
): AstNode {
  const start = { column: 0, line: startLine };
  const end = { column: text.length, line: startLine };
  const node = comment(type, value, text);
  node.loc = { start, end };
  return node;
}

function call(callee: AstNode, args: AstNode[] = []): AstNode {
  const node: AstNode = {
    type: "CallExpression",
    callee,
    arguments: args,
  };
  callee.parent = node;
  args.forEach((arg) => {
    arg.parent = node;
  });
  return node;
}

function member(object: AstNode, property: string): AstNode {
  const node: AstNode = {
    type: "MemberExpression",
    object,
    property: {
      type: "Identifier",
      name: property,
    },
    computed: false,
  };
  object.parent = node;
  return node;
}

function methodCall(object: AstNode, property: string, args: AstNode[] = []): AstNode {
  const memberNode = member(object, property);
  const node = call(memberNode, args);
  memberNode.parent = node;
  return node;
}

function expressionStatement(expression: AstNode): AstNode {
  const node: AstNode = {
    type: "ExpressionStatement",
    expression,
  };
  expression.parent = node;
  return node;
}

function block(body: AstNode[] = []): AstNode {
  const node: AstNode = {
    type: "BlockStatement",
    body,
  };
  body.forEach((statement) => {
    statement.parent = node;
  });
  return node;
}

function id(name: string): AstNode {
  const node = {
    type: "Identifier",
    name,
    __text: name,
  };
  return node;
}

function literal(value: AstPrimitive | RegExp): AstNode {
  return {
    type: "Literal",
    value,
    __text: JSON.stringify(value),
  };
}

function bigintLiteral(value: bigint): AstNode {
  return {
    type: "Literal",
    value,
    bigint: String(value),
    __text: `${value}n`,
  };
}

function arrayExpression(elements: AstNode[]): AstNode {
  const node: AstNode = { type: "ArrayExpression", elements };
  elements.forEach((element) => {
    element.parent = node;
  });
  return node;
}

function newExpression(name: string, args: AstNode[] = []): AstNode {
  const callee = id(name);
  const node: AstNode = { type: "NewExpression", callee, arguments: args };
  callee.parent = node;
  args.forEach((arg) => {
    arg.parent = node;
  });
  return node;
}

function objectProperty(name: string): AstNode {
  const key = id(name);
  const value = id(name);
  const node: AstNode = {
    type: "Property",
    key,
    value,
    computed: false,
    kind: "init",
    method: false,
    shorthand: true,
  };
  key.parent = node;
  value.parent = node;
  return node;
}

function objectPattern(names: string[]): AstNode {
  const properties = names.map(objectProperty);
  const node: AstNode = { type: "ObjectPattern", properties };
  properties.forEach((property) => {
    property.parent = node;
  });
  return node;
}

function assignmentPattern(left: AstNode, right: AstNode): AstNode {
  const node: AstNode = { type: "AssignmentPattern", left, right };
  left.parent = node;
  right.parent = node;
  return node;
}

function binary(left: AstNode, operator: string, right: AstNode): AstNode {
  const node: AstNode = {
    type: "BinaryExpression",
    operator,
    left,
    right,
  };
  left.parent = node;
  right.parent = node;
  return node;
}

function logical(left: AstNode, right: AstNode, operator = "&&"): AstNode {
  const node: AstNode = {
    type: "LogicalExpression",
    operator,
    left,
    right,
  };
  left.parent = node;
  right.parent = node;
  return node;
}

function unary(operator: string, argument: AstNode): AstNode {
  const node: AstNode = { type: "UnaryExpression", operator, argument };
  argument.parent = node;
  return node;
}

function arrow(params: AstNode[], body: AstNode): AstNode {
  const node: AstNode = {
    type: "ArrowFunctionExpression",
    params,
    body,
  };
  params.forEach((param) => {
    param.parent = node;
  });
  body.parent = node;
  return node;
}

test("exports 33 native Oxlint rules and four presets", () => {
  assert.equal(plugin.meta.name, "oxlint-plugin-legibility");
  assert.equal(plugin.meta.namespace, "legibility");
  assert.equal(plugin.meta.version, manifest.version);
  assert.equal(Object.keys(plugin.rules).length, 33);
  const categorizedRules = RECOMMENDED_RULE_NAMES.concat(
    COMMENT_RULE_NAMES, STRICT_ONLY_RULE_NAMES, Array.from(OPT_IN_RULE_NAMES),
  ).toSorted();
  assert.deepEqual(Object.keys(plugin.rules).toSorted(), categorizedRules);
  assert.deepEqual(Object.keys(plugin.configs).toSorted(), [
    "agentRecommended", "agentStrict", "recommended", "strict",
  ]);
});

test("every preset registers this package under the legibility namespace", () => {
  const expected = [{ name: "legibility", specifier: "oxlint-plugin-legibility" }];
  Object.values(plugin.configs).forEach((config) => {
    assert.deepEqual(config.jsPlugins, expected);
    assert.equal("plugins" in config, false);
  });
});

test("recommended and strict presets preserve rule levels and opt-in exclusions", () => {
  const recommended = plugin.configs.recommended.rules;
  const strict = plugin.configs.strict.rules;
  RECOMMENDED_RULE_NAMES.concat(COMMENT_RULE_NAMES).forEach((name) => {
    assert.equal(getRule(name).meta.docs?.recommended, true);
    assert.equal(recommended[`legibility/${name}`], "warn");
    assert.equal(strict[`legibility/${name}`], "error");
  });
  STRICT_ONLY_RULE_NAMES.forEach((name) => {
    assert.equal(getRule(name).meta.docs?.recommended, false);
    assert.equal(recommended[`legibility/${name}`], undefined);
    assert.equal(strict[`legibility/${name}`], "error");
  });
  OPT_IN_RULE_NAMES.forEach((name) => {
    assert.equal(getRule(name).meta.docs?.recommended, false);
    assert.equal(recommended[`legibility/${name}`], undefined);
    assert.equal(strict[`legibility/${name}`], undefined);
  });
});

test("presets configure Oxlint's built-in complexity and function length limits", () => {
  const options = { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true };
  const recommended = plugin.configs.recommended.rules;
  const strict = plugin.configs.strict.rules;
  assert.deepEqual(recommended.complexity, ["warn", 20]);
  assert.deepEqual(strict.complexity, ["error", 20]);
  assert.deepEqual(recommended["max-lines-per-function"], ["warn", options]);
  assert.deepEqual(strict["max-lines-per-function"], ["error", options]);
});

test("agent presets only change computed values to named mode", () => {
  const recommended = plugin.configs.recommended.rules;
  const strict = plugin.configs.strict.rules;
  const named = { objectValues: "named", returnValues: "named" };
  assert.equal(recommended["legibility/no-computed-values"], "warn");
  assert.equal(strict["legibility/no-computed-values"], "error");
  const expectedRecommended = Object.assign({}, recommended, {
    "legibility/no-computed-values": ["warn", named],
  });
  const expectedStrict = Object.assign({}, strict, {
    "legibility/no-computed-values": ["error", named],
  });
  assert.deepEqual(plugin.configs.agentRecommended.rules, expectedRecommended);
  assert.deepEqual(plugin.configs.agentStrict.rules, expectedStrict);
  assert.notEqual(plugin.configs.agentRecommended.rules, recommended);
  assert.notEqual(plugin.configs.agentStrict.rules, strict);
});

Object.entries(plugin.rules).forEach(([name, rule]) => {
  test(`${name} initializes once without reading per-file context`, () => {
    assert.deepEqual(Object.keys(rule).toSorted(), ["createOnce", "meta"]);
    const { context } = createContext();
    const guardedContext = new Proxy(context, {
      get(_target, key) {
        throw new Error(`Per-file context read during createOnce: ${String(key)}`);
      },
    });
    const visitor = rule.createOnce(guardedContext);
    assert.ok(Object.keys(visitor).length > 0);
    Object.values(visitor).forEach((handler) => assert.equal(typeof handler, "function"));
  });
});

test("max-function-parameters reports functions with too many positional parameters", () => {
  const { visitor, reports } = createRule("max-function-parameters");
  const params = ["first", "second", "third", "fourth", "fifth"].map(id);
  const node = {
    type: "FunctionDeclaration",
    id: id("sendRequest"),
    params,
    body: block(),
  };

  visit(visitor, "FunctionDeclaration", node);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "tooManyParameters");
  assert.deepEqual(getReport(reports, 0).data, { name: "sendRequest", count: 5, max: 4 });
});

test("max-function-parameters reports oversized object parameters", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const pattern = objectPattern(names);
  const defaultValue = { type: "ObjectExpression", properties: [] };
  const node = arrow([assignmentPattern(pattern, defaultValue)], block());
  const { visitor, reports } = createRule("max-function-parameters");

  visit(visitor, "ArrowFunctionExpression", node);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "tooManyObjectProperties");
  assert.deepEqual(getReport(reports, 0).data, { name: "Function", count: 9, max: 8 });
});

test("max-function-parameters supports independent limits", () => {
  const options = [{ max: 1, maxObjectProperties: 2 }];
  const objectParameter = objectPattern(["first", "second", "third"]);
  const node = arrow([objectParameter, id("extra")], block());
  const { visitor, reports } = createRule("max-function-parameters", options);

  visit(visitor, "ArrowFunctionExpression", node);

  assert.deepEqual(
    reports.map((report) => report.messageId),
    ["tooManyParameters", "tooManyObjectProperties"],
  );
});

test("max-function-parameters accepts inputs at both limits", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const params = [objectPattern(names), id("second"), id("third"), id("fourth")];
  const node = arrow(params, block());
  const { visitor, reports } = createRule("max-function-parameters");

  visit(visitor, "ArrowFunctionExpression", node);

  assert.equal(reports.length, 0);
});

test("no-unmatched-comments bans comments by default and ignores shebangs", () => {
  const comments = [
    comment("Line", " Explain the branch.", "// Explain the branch."),
    comment("Block", "*\n * Explain the API.\n ", "/**\n * Explain the API.\n */"),
    { type: "Shebang", value: "/usr/bin/env node", __text: "#!/usr/bin/env node" },
  ];
  const { visitor, reports } = createCommentRule("no-unmatched-comments", comments);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 2);
  assert.equal(getReport(reports, 0).messageId, "unmatched");
  assert.equal(getReport(reports, 1).messageId, "unmatched");
});

test("no-unmatched-comments accepts configured line and JSDoc matcher values", () => {
  const comments = [
    comment("Line", " KEEP-42: Preserve this.", "// KEEP-42: Preserve this."),
    comment(
      "Block",
      "*\n * KEEP-73: Explain the API.\n ",
      "/**\n * KEEP-73: Explain the API.\n */",
    ),
  ];
  const options = [{ matchers: ["^KEEP-\\d+\\b"] }];
  const { visitor, reports } = createCommentRule("no-unmatched-comments", comments, options);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-unmatched-comments supports custom and empty matcher lists", () => {
  const comments = [comment("Line", " TODO #42", "// TODO #42")];
  const customRule = createCommentRule("no-unmatched-comments", comments, [
    { matchers: ["TODO\\s+#\\d+"] },
  ]);
  const banAllRule = createCommentRule("no-unmatched-comments", comments, [{ matchers: [] }]);
  const invalidRule = createCommentRule("no-unmatched-comments", comments, [
    { matchers: ["["] },
  ]);
  const unsafeRule = createCommentRule("no-unmatched-comments", comments, [
    { matchers: ["(a+)+$"] },
  ]);

  visit(customRule.visitor, "Program", { type: "Program" });
  visit(banAllRule.visitor, "Program", { type: "Program" });
  visit(invalidRule.visitor, "Program", { type: "Program" });
  visit(unsafeRule.visitor, "Program", { type: "Program" });

  assert.equal(customRule.reports.length, 0);
  assert.equal(banAllRule.reports.length, 1);
  assert.equal(invalidRule.reports.length, 1);
  assert.equal(unsafeRule.reports.length, 1);
});

test("no-unmatched-comments ignores oversized matcher values", () => {
  const comments = [comment("Line", " KEEP-42: Preserve this.", "// KEEP-42: Preserve this.")];
  const oversizedMatcher = `^${"K".repeat(256)}$`;
  const { visitor, reports } = createCommentRule("no-unmatched-comments", comments, [
    { matchers: [oversizedMatcher] },
  ]);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
});

test("no-unmatched-comments bounds matcher input length", () => {
  const value = ` KEEP-${"x".repeat(1024)}`;
  const comments = [comment("Line", value, `//${value}`)];
  const { visitor, reports } = createCommentRule("no-unmatched-comments", comments, [
    { matchers: ["^KEEP-"] },
  ]);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("comment rules accept direct sources without text readers", () => {
  const comments = [comment("Line", " APPROVED: preserve this", "// APPROVED: preserve this")];
  const sourceCode = { getAllComments: () => comments };
  const options = [{ prefixIdentifiers: ["APPROVED"] }];
  const { visitor, reports } = createRule("no-unmatched-comments", options, { sourceCode });

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-unmatched-comments accepts bounded prefix and suffix identifiers", () => {
  const allowedComments = [
    comment("Line", " APPROVED: preserve this", "// APPROVED: preserve this"),
    comment("Line", " preserve this @approved", "// preserve this @approved"),
    comment("Block", "*\n * preserve this\n * @approved\n ", "/** comment */"),
  ];
  const rejectedComments = [
    comment("Line", " APPROVEDLY: generated", "// APPROVEDLY: generated"),
    comment("Line", " preserve this not@approved", "// preserve this not@approved"),
  ];
  const options = [
    {
      matchers: [],
      prefixIdentifiers: ["approved"],
      suffixIdentifiers: ["@approved"],
    },
  ];
  const allowedRule = createCommentRule("no-unmatched-comments", allowedComments, options);
  const rejectedRule = createCommentRule("no-unmatched-comments", rejectedComments, options);

  visit(allowedRule.visitor, "Program", { type: "Program" });
  visit(rejectedRule.visitor, "Program", { type: "Program" });

  assert.equal(allowedRule.reports.length, 0);
  assert.equal(rejectedRule.reports.length, 2);
});

test("no-stacked-comments reports comments on consecutive lines", () => {
  const comments = [
    locatedComment("Line", " First comment.", "// First comment.", 1),
    locatedComment("Line", " Second comment.", "// Second comment.", 2),
  ];
  const { visitor, reports } = createCommentRule("no-stacked-comments", comments);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "stackedComment");
  assert.equal(getReport(reports, 0).node, comments[1]);
});

test("no-stacked-comments accepts comments separated by blank lines", () => {
  const comments = [
    locatedComment("Line", " First comment.", "// First comment.", 1),
    locatedComment("Line", " Second comment.", "// Second comment.", 3),
    locatedComment("Block", " Third comment. ", "/* Third comment. */", 5),
  ];
  const { visitor, reports } = createCommentRule("no-stacked-comments", comments);

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("require-jsdoc-multiline-comments reports ordinary multiline blocks", () => {
  const comments = [
    comment(
      "Block",
      "\n * Explain the API contract.\n ",
      "/*\n * Explain the API contract.\n */",
    ),
    comment(
      "Block",
      "*\n * Explain the API contract.\n ",
      "/**\n * Explain the API contract.\n */",
    ),
    comment("Block", " Explain the API contract. ", "/* Explain the API contract. */"),
  ];
  const { visitor, reports } = createCommentRule(
    "require-jsdoc-multiline-comments",
    comments,
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "useJsdoc");
  assert.equal(typeof getReport(reports, 0).fix, "function");
  assert.equal(getRule("require-jsdoc-multiline-comments").meta.fixable, "code");
});

test("require-jsdoc-multiline-comments autofixes the block opener through Oxlint", () => {
  const code = ["/*", " * Explain the API contract.", " */", "const value = true;"].join("\n");
  const output = ["/**", " * Explain the API contract.", " */", "const value = true;"].join("\n");
  runNative("require-jsdoc-multiline-comments", {
    valid: [output],
    invalid: [{ code, output, errors: [{ messageId: "useJsdoc" }] }],
  });
});

test("require-jsdoc-multiline-comments preserves bang comments through Oxlint", () => {
  const code = ["/*!", " * Preserve this license.", " */"].join("\n");
  runNative("require-jsdoc-multiline-comments", { valid: [code], invalid: [] });
});

test("no-automated-comment-attribution reports signatures and prohibited authors", () => {
  const firstIdentifier = ["chat", "gpt"].join("");
  const secondIdentifier = ["cl", "aude"].join("");
  const generatedBy = ["Generated by", firstIdentifier].join(" ");
  const prohibitedAuthor = ["@author", secondIdentifier].join(" ");
  const comments = [
    comment("Line", ` ${generatedBy}.`, `// ${generatedBy}.`),
    comment("Block", `*\n * ${prohibitedAuthor}\n `, `/**\n * ${prohibitedAuthor}\n */`),
  ];
  const { visitor, reports } = createCommentRule(
    "no-automated-comment-attribution",
    comments,
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 2);
  assert.equal(getReportData(reports, 0).identifier, firstIdentifier);
  assert.equal(getReportData(reports, 1).identifier, secondIdentifier);
});

test("no-automated-comment-attribution ignores ordinary technology references", () => {
  const identifier = ["chat", "gpt"].join("");
  const value = ` Send a request to ${identifier}. @author Jeff`;
  const comments = [comment("Line", value, "// request")];
  const { visitor, reports } = createCommentRule(
    "no-automated-comment-attribution",
    comments,
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-automated-comment-attribution supports custom identifiers", () => {
  const comments = [comment("Line", " @author robot", "// @author robot")];
  const { visitor, reports } = createCommentRule(
    "no-automated-comment-attribution",
    comments,
    [{ identifiers: ["robot"] }],
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).identifier, "robot");
});

function lintFilename(filename: string, options: RuleOptions[number]): RuleReport[] {
  const { visitor, reports } = createRule("require-filename-matches-dirname", [options], {
    cwd: "/repo",
    filename,
  });
  visit(visitor, "Program", { type: "Program" });
  return reports;
}

test("require-filename-matches-dirname requires a schema", () => {
  const reports = lintFilename("/repo/src/components/foo/index.ts", { minDepth: 2 });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "missingSchema");
});

test("require-filename-matches-dirname enforces the dirname schema", () => {
  const options = { schema: "dirname", minDepth: 2 };
  const unrelatedReports = lintFilename("/repo/src/components/foo/useAuth.ts", options);
  const qualifierReports = lintFilename("/repo/src/components/foo/foo.effect.ts", options);

  assert.equal(getReport(unrelatedReports, 0).messageId, "mismatch");
  assert.equal(getReport(qualifierReports, 0).messageId, "mismatch");
});

test("require-filename-matches-dirname accepts dirname schema patterns", () => {
  const options = { schema: "dirname", minDepth: 2 };
  const filenames = ["foo.ts", "foo.utils.tsx", "index.ts"];
  const reportCounts = filenames.map((name) =>
    lintFilename(`/repo/src/components/foo/${name}`, options).length,
  );

  assert.deepEqual(reportCounts, [0, 0, 0]);
});

test("require-filename-matches-dirname accepts dirname schema overrides", () => {
  const options = {
    schema: "dirname",
    minDepth: 2,
    allowedQualifiers: ["effect"],
    allowedFilenames: ["schema"],
  };
  const effectReports = lintFilename("/repo/src/components/foo/foo.effect.ts", options);
  const schemaReports = lintFilename("/repo/src/components/foo/schema.ts", options);

  assert.equal(effectReports.length, 0);
  assert.equal(schemaReports.length, 0);
});

test("require-filename-matches-dirname accepts the index schema", () => {
  const options = { schema: "index", minDepth: 2 };
  const filenames = [
    "constants.ts",
    "index.tsx",
    "index.test.ts",
    "types.ts",
    "utils.tsx",
    "utils.test.tsx",
  ];
  const reportCounts = filenames.map((name) =>
    lintFilename(`/repo/src/components/foo/${name}`, options).length,
  );

  assert.deepEqual(reportCounts, [0, 0, 0, 0, 0, 0]);
});

test("require-filename-matches-dirname rejects dirname patterns under the index schema", () => {
  const options = { schema: "index", minDepth: 2 };
  const reports = lintFilename("/repo/src/components/button/button.test.ts", options);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "mismatch");
});

test("require-filename-matches-dirname supports custom schemas", () => {
  const patterns = ["{dirname}.effect", "schema", "schema.test"];
  const options = { schema: "custom", minDepth: 2, patterns };
  const effectReports = lintFilename("/repo/src/components/foo/foo.effect.ts", options);
  const schemaReports = lintFilename("/repo/src/components/foo/schema.test.tsx", options);
  const indexReports = lintFilename("/repo/src/components/foo/index.ts", options);

  assert.equal(effectReports.length, 0);
  assert.equal(schemaReports.length, 0);
  assert.equal(indexReports.length, 1);
});

test("require-filename-matches-dirname exempts files below minDepth", () => {
  const options = { schema: "index", minDepth: 3 };
  const reports = lintFilename("/repo/src/hooks/useAuth.ts", options);

  assert.equal(reports.length, 0);
});

test("require-filename-matches-dirname validates the required schema option", () => {
  const verify = () => runNative("require-filename-matches-dirname", {
    valid: [{ code: "const value = true;", options: [{}] }],
    invalid: [],
  });
  assert.throws(verify, /required property 'schema'/);
});

test("no-mixed-filename-casing reports hyphen mixed with uppercase", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my-File.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "mixedCasing");
});

test("no-mixed-filename-casing reports camelCase mixed with hyphens", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/myFile-helper.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
});

test("no-mixed-filename-casing reports mixed separators", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my-file_helper.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
});

test("no-mixed-filename-casing allows kebab-case", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my-file.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows camelCase", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/myFile.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows PascalCase", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/MyFile.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows snake_case", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my_file.ts" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows dotfile names", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/.oxlintrc.js" });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("max-expression-operators checks parsed expression and condition contexts", () => {
  const expressions = [
    "const total = a && b && c;", "total = a && b && c;", "consume(a && b && c);",
    "const sum = () => a && b && c;", "function sum() { return a && b && c; }",
    "if (a && b && c) work();", "while (a && b && c) work();",
    "do { work(); } while (a && b && c);", "for (; a && b && c;) work();",
    "const value = ready ? a && b : c && d;",
  ];
  const options = [{ max: 1 }];
  const errors = [{ messageId: "tooMany" }];
  const invalid = expressions.map((code) => ({ code, options, errors }));
  runNative("max-expression-operators", {
    valid: ["let total;", "for (;;) break;", "const sum = () => { return a; };",
      "consume(() => a);", "function stop() { return; }", "const view = <div />;"],
    invalid,
  });
});

test("max-expression-operators reports operator-heavy expressions", () => {
  const { visitor, reports } = createRule("max-expression-operators", [{ max: 1 }]);
  const expression = logical(logical(id("a"), id("b")), id("c"));

  visit(visitor, "ReturnStatement", { type: "ReturnStatement", argument: expression });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "tooMany");
  assert.equal(getReportData(reports, 0).count, 2);
});

test("max-expression-operators allows custom operators and complexity weights", () => {
  const { visitor, reports } = createRule("max-expression-operators", [
    { complexity: { "+": 3 }, max: 2, operators: ["+"] },
  ]);

  visit(visitor, "ReturnStatement", {
    type: "ReturnStatement",
    argument: binary(id("a"), "+", id("b")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).count, 3);
});

test("max-expression-operators respects explicitly empty operator lists", () => {
  const { visitor, reports } = createRule("max-expression-operators", [
    { max: 0, operators: [] },
  ]);

  visit(visitor, "ReturnStatement", {
    type: "ReturnStatement",
    argument: logical(id("a"), id("b")),
  });

  assert.equal(reports.length, 0);
});

test("hoist-if-operators reports boolean-heavy if conditions", () => {
  const { visitor, reports } = createRule("hoist-if-operators");

  visit(visitor, "IfStatement", {
    type: "IfStatement",
    test: logical(id("ready"), id("enabled")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "tooMany");
});

test("hoist-if-operators allows custom condition operators", () => {
  const { visitor, reports } = createRule("hoist-if-operators", [
    { max: 0, operators: ["==="] },
  ]);

  visit(visitor, "IfStatement", {
    type: "IfStatement",
    test: binary(id("status"), "===", literal("ready")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).count, 1);
});

test("no-quadratic-patterns reports search calls inside loops", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns");
  const search = methodCall(id("items"), "find");
  const body = block([expressionStatement(search)]);
  const loop = { type: "ForStatement", body };
  body.parent = loop;

  visit(visitor, "ForStatement", loop);
  visit(visitor, "CallExpression", search);
  visit(visitor, "ForStatement:exit", loop);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "searchInLoop");
});

test("no-quadratic-patterns allows custom search methods", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns", [
    { searchMethods: ["lookup"] },
  ]);
  const search = methodCall(id("items"), "lookup");
  const body = block([expressionStatement(search)]);
  const loop = { type: "ForStatement", body };
  body.parent = loop;

  visit(visitor, "ForStatement", loop);
  visit(visitor, "CallExpression", search);
  visit(visitor, "ForStatement:exit", loop);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "searchInLoop");
});

test("no-quadratic-patterns ignores one-time search calls in loop headers", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns");
  const filter = methodCall(id("users"), "filter", [id("Boolean")]);
  const body = block();
  const loop = {
    type: "ForOfStatement",
    right: filter,
    body,
  };
  filter.parent = loop;
  body.parent = loop;

  visit(visitor, "ForOfStatement", loop);
  visit(visitor, "CallExpression", filter);
  visit(visitor, "ForOfStatement:exit", loop);

  assert.equal(reports.length, 0);
});

test("no-quadratic-patterns checks repeated conditions and updates through Oxlint", () => {
  runNative("no-quadratic-patterns", {
    valid: [
      "for (const item of items.filter(keep)) work(item);",
      "for (let index = items.indexOf(target); index >= 0; index--) work(index);",
      "for (const item of items) { const later = () => items.includes(item); save(later); }",
    ],
    invalid: [
      { code: "while (items.includes(target)) items.pop();", errors: [{ messageId: "searchInLoop" }] },
      { code: "do { work(); } while (items.some(keep));", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (let i = 0; i < items.length && items.includes(target); i++) work(i);", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (let i = 0; i < items.length; i = items.indexOf(target)) work(i);", errors: [{ messageId: "searchInLoop" }] },
    ],
  });
});

test("no-quadratic-patterns checks immediate calls without entering deferred functions", () => {
  runNative("no-quadratic-patterns", {
    valid: [
      "for (const item of items) { run(() => items.includes(item)); }",
      "for (const item of items) { (() => () => items.includes(item))(); }",
      "for (const item of items) { (function* () { items.includes(item); })(); }",
      "for (let i = (() => items.indexOf(target))(); i >= 0; i--) work(i);",
      "for (const item of (() => items.filter(keep))()) work(item);",
    ],
    invalid: [
      { code: "for (const item of items) { (() => items.includes(item))(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { (function () { return items.includes(item); })(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { (() => (() => items.includes(item))())(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { (async () => items.includes(item))(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "while ((() => items.includes(target))()) work();", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (let i = 0; i < items.length; i = (() => items.indexOf(target))()) work(i);", errors: [{ messageId: "searchInLoop" }] },
    ],
  });
});

test("no-quadratic-patterns checks TypeScript-wrapped immediate calls through Oxlint", () => {
  runNative("no-quadratic-patterns", {
    valid: [
      "for (const item of items) { const later = (() => items.includes(item)) as () => boolean; save(later); }",
      "for (const item of items) { save((() => items.includes(item)) satisfies () => boolean); }",
      "for (const item of items) { ((function* () { items.includes(item); }) as () => unknown)(); }",
      "for (let i = ((() => items.indexOf(target)) as () => number)(); i >= 0; i--) work(i);",
      "for (const item of ((() => items.filter(keep)) as () => unknown[])()) work(item);",
      "for (const item of items) { (() => (() => items.includes(item)) as () => boolean)(); }",
    ],
    invalid: [
      { code: "for (const item of items) { ((() => items.includes(item)) as () => boolean)(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { ((() => items.includes(item)) satisfies () => boolean)(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { (() => items.includes(item))!(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { ((<T,>() => items.includes(item))<number>)(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (const item of items) { ((((() => items.includes(item)) as () => boolean) satisfies () => boolean)!)(); }", errors: [{ messageId: "searchInLoop" }] },
      { code: "while (((() => items.includes(target)) as () => boolean)()) work();", errors: [{ messageId: "searchInLoop" }] },
      { code: "for (let i = 0; i < items.length; i = ((() => items.indexOf(target)) as () => number)()) work(i);", errors: [{ messageId: "searchInLoop" }] },
      {
        code: "for (const item of items) { (<() => boolean>(() => items.includes(item)))(); }",
        languageOptions: { parserOptions: { lang: "ts" } },
        errors: [{ messageId: "searchInLoop" }],
      },
    ],
  });
});

test("no-quadratic-patterns reports nested iteration", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns");
  const innerIteration = methodCall(id("children"), "map", [arrow([id("child")], id("child"))]);
  const outerIteration = methodCall(id("items"), "map", [arrow([id("item")], innerIteration)]);

  visit(visitor, "CallExpression", outerIteration);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "nestedIteration");
  assert.deepEqual(getReport(reports, 0).data, { outer: "map", inner: "map" });
});

test("require-executable-shebang reports configured executable sources without shebangs", () => {
  const { visitor, reports } = createRule("require-executable-shebang");

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "missingShebang");
});

test("require-executable-shebang accepts Deno shebangs by default", () => {
  const { visitor, reports } = createRule("require-executable-shebang", [], {
    sourceCode: {
      text: "#!/usr/bin/env deno run --allow-read\nconsole.log('ok');\n",
      getText: () => "",
    },
  });

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("text rules read the current sourceCode directly", () => {
  const sourceText = "#!/usr/bin/env node\nlog('ok');\n";
  const sourceCode = { getText: () => sourceText };
  const { visitor, reports } = createRule("require-executable-shebang", [], { sourceCode });
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 0);
});

test("require-executable-shebang matches configured wildcard paths", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/*/src/index.ts"] }],
    { filename: "/repo/packages/cli/src/index.ts", cwd: "/repo" },
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "missingShebang");
});

test("require-executable-shebang accepts bounded wildcard path segments", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/cli-*/src/index.ts"] }],
    { filename: "/repo/packages/cli-tool/src/index.ts", cwd: "/repo" },
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "missingShebang");
});

test("require-executable-shebang ignores wildcard path segment mismatches", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/cli-*/src/index.ts"] }],
    { filename: "/repo/packages/web/src/index.ts", cwd: "/repo" },
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("require-executable-shebang matches recursive wildcard paths", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/**/src/index.ts"] }],
    { filename: "/repo/packages/tools/cli/src/index.ts", cwd: "/repo" },
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "missingShebang");
});

test("require-executable-shebang ignores wildcard patterns longer than the path", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/*/src/index.ts"] }],
    { filename: "/repo/packages/src/index.ts", cwd: "/repo" },
  );

  visit(visitor, "Program", { type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-direct-node-bin-smoke handles parsed subprocess commands", () => {
  const commands = [
    "execSync(`node ./src/index.ts --help`);",
    "childProcess.exec('node --trace-warnings dist/index.js');",
    "spawn('/usr/bin/node', ['--no-warnings', './src/cli/index.ts']);",
    "spawnSync('node', [null, ...flags, `dist/cli/index.js`]);",
    "childProcess['execFile']('node', ['src/index.js']);",
    "execFileSync('node', ['src/index.ts']);",
  ];
  const errors = [{ messageId: "directNodeBin" }];
  const invalid = commands.map((code) => ({ code, errors }));
  runNative("no-direct-node-bin-smoke", {
    valid: ["execSync();", "execSync(42);", "execSync(command);", "execSync(`node ${entry}`);",
      "exec('pnpm test');", "spawn('pnpm', ['test']);", "spawn('node');",
      "spawn('node', args);", "spawn('node', ['--version']);", "log('node src/index.js');",
      "childProcess[method]('node src/index.js');", "getExecutor()('node src/index.js');"],
    invalid,
  });
});

test("no-direct-node-bin-smoke reports direct node smoke tests", () => {
  const { visitor, reports } = createRule("no-direct-node-bin-smoke");
  const execSync = call(id("execSync"), [literal("node src/index.js --help")]);

  visit(visitor, "CallExpression", execSync);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "directNodeBin");
});

test("no-direct-node-bin-smoke matches nested wildcard bin paths", () => {
  const { visitor, reports } = createRule("no-direct-node-bin-smoke");
  const execSync = call(id("execSync"), [literal("node packages/cli/dist/index.js --help")]);

  visit(visitor, "CallExpression", execSync);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "directNodeBin");
});

test("no-complex-ternaries reports nested ternaries", () => {
  const { visitor, reports } = createRule("no-complex-ternaries");
  const expression = {
    type: "ConditionalExpression",
    test: id("ready"),
    consequent: {
      type: "ConditionalExpression",
      test: id("enabled"),
      consequent: id("a"),
      alternate: id("b"),
    },
    alternate: id("c"),
  };

  visit(visitor, "ConditionalExpression", expression);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "nested");
});

test("no-complex-ternaries allows custom ternary complexity", () => {
  const { visitor, reports } = createRule("no-complex-ternaries", [
    { complexity: { "?:": 2 }, max: 1, operators: ["?:"] },
  ]);

  visit(visitor, "ConditionalExpression", {
    type: "ConditionalExpression",
    test: id("ready"),
    consequent: id("enabled"),
    alternate: id("disabled"),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).count, 2);
});

test("no-computed-values reports computed object values", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ max: 1 }]);

  visit(visitor, "Property", {
    type: "Property",
    value: logical(logical(id("a"), id("b")), id("c")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "computedObjectValue");
});

test("no-computed-values allows unnamed object values by default", () => {
  const { visitor, reports } = createRule("no-computed-values");
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visit(visitor, "Property", {
    type: "Property",
    value: routeName,
  });

  assert.equal(reports.length, 0);
});

test("no-computed-values reports unnamed call object values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ objectValues: "named" }]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visit(visitor, "Property", {
    type: "Property",
    value: routeName,
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnamedObjectValue");
  assert.equal(getReport(reports, 0).node, routeName);
});

test("no-computed-values reports unnamed return values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ returnValues: "named" }]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visit(visitor, "ReturnStatement", {
    type: "ReturnStatement",
    argument: routeName,
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnamedReturnValue");
  assert.equal(getReport(reports, 0).node, routeName);
});

test("no-computed-values reports returned object once in named return mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);
  const property: AstNode = { type: "Property", value: routeName };
  const object: AstNode = { type: "ObjectExpression", properties: [property] };
  const returnStatement: AstNode = { type: "ReturnStatement", argument: object };
  property.parent = object;
  object.parent = returnStatement;

  visit(visitor, "Property", property);
  visit(visitor, "ReturnStatement", returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnamedReturnValue");
  assert.equal(getReport(reports, 0).node, object);
});

test("no-computed-values reports nested returned objects once in named return mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);
  const innerProperty: AstNode = { type: "Property", value: routeName };
  const innerObject: AstNode = { type: "ObjectExpression", properties: [innerProperty] };
  const outerProperty: AstNode = { type: "Property", value: innerObject };
  const outerObject: AstNode = { type: "ObjectExpression", properties: [outerProperty] };
  const returnStatement: AstNode = { type: "ReturnStatement", argument: outerObject };
  innerProperty.parent = innerObject;
  innerObject.parent = outerProperty;
  outerProperty.parent = outerObject;
  outerObject.parent = returnStatement;

  visit(visitor, "Property", innerProperty);
  visit(visitor, "Property", outerProperty);
  visit(visitor, "ReturnStatement", returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnamedReturnValue");
  assert.equal(getReport(reports, 0).node, outerObject);
});

test("no-computed-values reports object values inside JSX returns in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"));
  const property: AstNode = { type: "Property", value: routeName };
  const object: AstNode = { type: "ObjectExpression", properties: [property] };
  const expression: AstNode = { type: "JSXExpressionContainer", expression: object };
  const attribute: AstNode = { type: "JSXAttribute", value: expression };
  const openingElement: AstNode = { type: "JSXOpeningElement", attributes: [attribute] };
  const element: AstNode = { type: "JSXElement", openingElement };
  const returnStatement: AstNode = { type: "ReturnStatement", argument: element };
  property.parent = object;
  object.parent = expression;
  expression.parent = attribute;
  attribute.parent = openingElement;
  openingElement.parent = element;
  element.parent = returnStatement;

  visit(visitor, "Property", property);
  visit(visitor, "ReturnStatement", returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnamedObjectValue");
  assert.equal(getReport(reports, 0).node, routeName);
});

test("no-computed-values allows named and literal values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);

  visit(visitor, "Property", {
    type: "Property",
    value: id("route"),
  });
  visit(visitor, "Property", {
    type: "Property",
    value: literal("settings"),
  });
  visit(visitor, "Property", {
    type: "Property",
    value: { type: "TemplateLiteral", expressions: [] },
  });
  visit(visitor, "ReturnStatement", {
    type: "ReturnStatement",
    argument: id("route"),
  });
  visit(visitor, "ReturnStatement", {
    type: "ReturnStatement",
    argument: literal("settings"),
  });

  assert.equal(reports.length, 0);
});

test("no-computed-values allows custom computed operator complexity", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { complexity: { "+": 2 }, max: 1, operators: ["+"] },
  ]);

  visit(visitor, "Property", {
    type: "Property",
    value: binary(id("subtotal"), "+", id("tax")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).count, 2);
});

test("no-hidden-side-effects checks parsed iteration callbacks", () => {
  runNative("no-hidden-side-effects", {
    valid: ["items.map(transform);", "items.map();", "items.map(item => item.value);",
      "items.map(item => { const copy = [item]; return copy; });",
      "items.map(item => () => { total++; });", "items.map(item => [item].reverse());",
      "const sorted = items.slice().sort();", "const value = ({ reset() {} }).reset();",
      "items.push(value);", "items?.push(value);", "total++;", "for (; ready; total++) work();"],
    invalid: [
      { code: "items.map(item => { total++; return item; });", errors: [{ messageId: "callbackSideEffect" }] },
      { code: "items.filter(item => { total = item; return true; });", errors: [{ messageId: "callbackSideEffect" }] },
      { code: "items.some(item => { results.push(item); return true; });", errors: [{ messageId: "callbackSideEffect" }] },
      { code: "const value = total++;", errors: [{ messageId: "hiddenSideEffect" }] },
      { code: "const value = items?.push(item);", errors: [{ messageId: "hiddenSideEffect" }] },
    ],
  });
});

test("no-hidden-side-effects reports nested assignments", () => {
  const { visitor, reports } = createRule("no-hidden-side-effects");
  const assignment = {
    type: "AssignmentExpression",
    parent: { type: "ReturnStatement" },
  };

  visit(visitor, "AssignmentExpression", assignment);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "hiddenSideEffect");
});

test("no-hidden-side-effects allows custom mutating methods", () => {
  const { visitor, reports } = createRule("no-hidden-side-effects", [
    { mutatingMethods: ["commit"] },
  ]);
  const commitCall = methodCall(id("store"), "commit");
  commitCall.parent = { type: "ReturnStatement", argument: commitCall };

  visit(visitor, "CallExpression", commitCall);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "hiddenSideEffect");
});

test("no-standalone-array-mutations reports standalone mutating calls", () => {
  const { visitor, reports } = createRule("no-standalone-array-mutations");
  const pushCall = methodCall(id("items"), "push");
  pushCall.parent = {
    type: "ExpressionStatement",
    expression: pushCall,
  };

  visit(visitor, "CallExpression", pushCall);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "standaloneArrayMutation");
});

test("no-standalone-array-mutations allows custom mutating methods", () => {
  const { visitor, reports } = createRule("no-standalone-array-mutations", [
    { arrayMutatingMethods: ["append"], mutatingMethods: ["append"] },
  ]);
  const appendCall = methodCall(id("items"), "append");
  appendCall.parent = {
    type: "ExpressionStatement",
    expression: appendCall,
  };

  visit(visitor, "CallExpression", appendCall);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "standaloneArrayMutation");
});

test("prefer-concat-object-assign reports each spread literal once", () => {
  const { visitor, reports } = createRule("prefer-concat-object-assign");
  const spreadElements = [{ type: "SpreadElement" }, { type: "SpreadElement" }];
  const spreadProperties = [{ type: "SpreadElement" }, { type: "SpreadElement" }];
  const arrayExpression = { type: "ArrayExpression", elements: spreadElements };
  const objectExpression = { type: "ObjectExpression", properties: spreadProperties };

  visit(visitor, "ArrayExpression", arrayExpression);
  visit(visitor, "ObjectExpression", objectExpression);

  assert.equal(reports.length, 2);
  assert.equal(getReport(reports, 0).messageId, "arraySpread");
  assert.equal(getReport(reports, 0).node, arrayExpression);
  assert.equal(getReport(reports, 1).messageId, "objectSpread");
  assert.equal(getReport(reports, 1).node, objectExpression);
});

test("prefer-concat-object-assign allows literals without spread", () => {
  const { visitor, reports } = createRule("prefer-concat-object-assign");
  const elements = [{ type: "Literal", value: "item" }];
  const properties = [{ type: "Property" }];

  visit(visitor, "ArrayExpression", { type: "ArrayExpression", elements });
  visit(visitor, "ObjectExpression", { type: "ObjectExpression", properties });

  assert.equal(reports.length, 0);
});

test("prefer-early-return reports else branches after an exiting consequent", () => {
  const { visitor, reports } = createRule("prefer-early-return");
  const alternate = { type: "BlockStatement", body: [] };

  visit(visitor, "IfStatement", {
    type: "IfStatement",
    test: id("failed"),
    consequent: {
      type: "BlockStatement",
      body: [{ type: "ReturnStatement" }],
    },
    alternate,
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).node, alternate);
});

test("max-control-flow-depth reports branches beyond the configured depth", () => {
  const { visitor, reports } = createRule("max-control-flow-depth", [{ max: 2 }]);
  const outer = { type: "IfStatement" };
  const middle = { type: "IfStatement", parent: outer };
  const inner = { type: "IfStatement", parent: middle };

  visit(visitor, "IfStatement", outer);
  visit(visitor, "IfStatement", middle);
  visit(visitor, "IfStatement", inner);
  visit(visitor, "IfStatement:exit", inner);
  visit(visitor, "IfStatement:exit", middle);
  visit(visitor, "IfStatement:exit", outer);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "tooDeep");
});

test("max-control-flow-depth resets depth inside nested function declarations", () => {
  const { visitor, reports } = createRule("max-control-flow-depth", [{ max: 3 }]);
  const outer = { type: "IfStatement" };
  const fn = {
    type: "FunctionDeclaration",
    body: block(),
    parent: outer,
  };
  const first = { type: "IfStatement", parent: fn.body };
  const second = { type: "IfStatement", parent: first };
  const third = { type: "IfStatement", parent: second };

  visit(visitor, "IfStatement", outer);
  visit(visitor, "FunctionDeclaration", fn);
  visit(visitor, "IfStatement", first);
  visit(visitor, "IfStatement", second);
  visit(visitor, "IfStatement", third);
  visit(visitor, "IfStatement:exit", third);
  visit(visitor, "IfStatement:exit", second);
  visit(visitor, "IfStatement:exit", first);
  visit(visitor, "FunctionDeclaration:exit", fn);
  visit(visitor, "IfStatement:exit", outer);

  assert.equal(reports.length, 0);
});

test("max-array-chain-depth reports long array callback chains once", () => {
  const { visitor, reports } = createRule("max-array-chain-depth", [{ max: 2 }]);
  const filterCall = methodCall(id("items"), "filter");
  const mapCall = methodCall(filterCall, "map");
  const someCall = methodCall(mapCall, "some");

  visit(visitor, "CallExpression", filterCall);
  visit(visitor, "CallExpression", mapCall);
  visit(visitor, "CallExpression", someCall);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).node, someCall);
  assert.equal(getReportData(reports, 0).chain, "filter.map.some");
});

test("max-array-chain-depth allows custom iteration methods", () => {
  const { visitor, reports } = createRule("max-array-chain-depth", [
    { iterationMethods: ["collect", "select"], max: 1 },
  ]);
  const collectCall = methodCall(id("items"), "collect");
  const selectCall = methodCall(collectCall, "select");

  visit(visitor, "CallExpression", collectCall);
  visit(visitor, "CallExpression", selectCall);

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).chain, "collect.select");
});

test("no-repeated-collection-search reports repeated scoped scans", () => {
  const { visitor, reports } = createRule("no-repeated-collection-search");

  visit(visitor, "Program", { type: "Program" });
  visit(visitor, "CallExpression", methodCall(id("users"), "find"));
  visit(visitor, "CallExpression", methodCall(id("users"), "find"));
  visit(visitor, "Program:exit", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "repeatedSearch");
});

test("no-repeated-collection-search distinguishes lexical bindings through Oxlint", () => {
  runNative("no-repeated-collection-search", {
    valid: [
      "const users = []; { const users = []; users.find(Boolean); } users.find(Boolean);",
      "const users = []; users.find(Boolean); { const users = []; users.find(Boolean); }",
      "{ const users = []; users.find(Boolean); } { const users = []; users.find(Boolean); }",
      "const users = []; for (const users of groups) users.find(Boolean); users.find(Boolean);",
      "const users = []; try {} catch (users) { users.find(Boolean); } users.find(Boolean);",
      "const data = {}; { const data = {}; data.users.find(Boolean); } data.users.find(Boolean);",
    ],
    invalid: [
      { code: "const users = []; { users.find(Boolean); } users.find(Boolean);", errors: 1 },
      { code: "{ const users = []; users.find(Boolean); users.find(Boolean); }", errors: 1 },
      { code: "const users = []; { const users = []; users.find(Boolean); } users.find(Boolean); users.find(Boolean);", errors: 1 },
    ],
  });
});

test("no-repeated-collection-search allows custom search methods", () => {
  const { visitor, reports } = createRule("no-repeated-collection-search", [
    { searchMethods: ["lookup"] },
  ]);

  visit(visitor, "Program", { type: "Program" });
  visit(visitor, "CallExpression", methodCall(id("users"), "lookup"));
  visit(visitor, "CallExpression", methodCall(id("users"), "lookup"));
  visit(visitor, "Program:exit", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).method, "lookup");
});

test("no-redundant-boolean-logic reports boolean comparisons and ternaries", () => {
  const { visitor, reports } = createRule("no-redundant-boolean-logic");

  visit(visitor, "BinaryExpression", binary(unary("!", id("isReady")), "===", literal(true)));
  visit(visitor, "ConditionalExpression", {
    type: "ConditionalExpression",
    test: id("isReady"),
    consequent: literal(true),
    alternate: literal(false),
  });

  assert.equal(reports.length, 2);
  assert.equal(getReport(reports, 0).messageId, "booleanComparison");
  assert.equal(getReport(reports, 1).messageId, "booleanTernary");
});

test("no-redundant-boolean-logic preserves equality checks on unknown values", () => {
  runNative("no-redundant-boolean-logic", {
    valid: ["const enabled = 1 === true;", "const enabled = value === true;", "const enabled = value !== false;"],
    invalid: [
      { code: "const enabled = (count > 0) === true;", errors: [{ messageId: "booleanComparison" }] },
      { code: "const enabled = false !== !ready;", errors: [{ messageId: "booleanComparison" }] },
      { code: "const enabled = value ? true : false;", errors: [{ messageId: "booleanTernary" }] },
    ],
  });
  const isExactlyTrue = (value: unknown) => value === true;
  assert.notEqual(isExactlyTrue(1), Boolean(1));
  assert.equal(typeof !!1, "boolean");
});

test("no-redundant-boolean-logic allows custom equality operators", () => {
  const { visitor, reports } = createRule("no-redundant-boolean-logic", [
    { equalityOperators: ["~~"] },
  ]);

  visit(visitor, "BinaryExpression", binary(unary("!", id("isReady")), "~~", literal(true)));

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "booleanComparison");
});

test("no-trivial-wrapper-functions distinguishes forwarding from useful work", () => {
  runNative("no-trivial-wrapper-functions", {
    valid: ["const wrap = ({ value }) => target(value);", "const wrap = value => value;",
      "const wrap = value => target(value, true);", "const wrap = value => target(other);",
      "const wrap = value => wrap(value);", "items.map(value => target(value));",
      "function wrap() {}", "function wrap() { return; }", "function wrap() { work(); }",
      "function wrap(value) { work(); return target(value); }"],
    invalid: [
      { code: "const api = { wrap(value) { return target(value); } };", errors: [{ messageId: "trivialWrapper", data: { name: "wrap", target: "target" } }] },
      { code: "const api = { 'wrap': value => client.send(value) };", errors: [{ messageId: "trivialWrapper", data: { name: "wrap", target: "client.send" } }] },
      { code: "const wrap = () => target();", errors: [{ messageId: "trivialWrapper" }] },
    ],
  });
});

test("no-trivial-wrapper-functions reports parameter-forwarding wrappers", () => {
  const { visitor, reports } = createRule("no-trivial-wrapper-functions");
  const wrapper = arrow([id("userId")], call(id("fetchUser"), [id("userId")]));
  wrapper.parent = {
    type: "VariableDeclarator",
    id: id("getUser"),
  };

  visit(visitor, "ArrowFunctionExpression", wrapper);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "trivialWrapper");
});

test("no-trivial-wrapper-functions ignores async and generator wrappers", () => {
  const { visitor, reports } = createRule("no-trivial-wrapper-functions");
  const asyncWrapper = arrow([id("userId")], call(id("fetchUser"), [id("userId")]));
  asyncWrapper.async = true;
  asyncWrapper.parent = {
    type: "VariableDeclarator",
    id: id("loadUser"),
  };
  const generatorWrapper = {
    type: "FunctionDeclaration",
    id: id("ids"),
    generator: true,
    params: [id("items")],
    body: block([
      {
        type: "ReturnStatement",
        argument: call(id("iterate"), [id("items")]),
      },
    ]),
  };

  visit(visitor, "ArrowFunctionExpression", asyncWrapper);
  visit(visitor, "FunctionDeclaration", generatorWrapper);

  assert.equal(reports.length, 0);
});

test("prefer-positive-condition-names checks conditions and boolean initializers", () => {
  const conditions = ["if (isNotReady || isNotReady) work();", "while (noItems) work();",
    "do { work(); } while (hasNoItems);", "const isNotReady = true;",
    "const isNotReady = !ready;", "const isNotReady = ready && available;",
    "const isNotReady = check();", "const isNotReady = ready ? yes : no;"];
  const errors = [{ messageId: "negativeName" }];
  const invalid = conditions.map((code) => ({ code, errors }));
  runNative("prefer-positive-condition-names", {
    valid: ["if (isReady) work();", "if (check(() => isNotReady)) work();",
      "const isNotReady = 1;", "let noItems;", "const { isNotReady } = state;"],
    invalid,
  });
});

test("prefer-positive-condition-names reports negative boolean names", () => {
  const { visitor, reports } = createRule("prefer-positive-condition-names");

  visit(visitor, "VariableDeclarator", {
    type: "VariableDeclarator",
    id: id("isNotReady"),
    init: literal(false),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "negativeName");
});

test("prefer-positive-condition-names allows custom boolean operators", () => {
  const { visitor, reports } = createRule("prefer-positive-condition-names", [
    { booleanOperators: ["matches"] },
  ]);

  visit(visitor, "VariableDeclarator", {
    type: "VariableDeclarator",
    id: id("isNotReady"),
    init: binary(id("status"), "matches", literal("ready")),
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "negativeName");
});

test("no-single-use-renaming-alias counts references without property names or labels", () => {
  runNative("no-single-use-renaming-alias", {
    valid: ["const alias = source;", "const alias = source; consume(alias, alias);",
      "const alias = source; object.alias; ({ alias: 1 }); class Store { alias() {} }",
      "const alias = source; alias: while (ready) { if (stop) break alias; continue alias; }",
      "const { value } = source; consume(value);", "const alias = source(); consume(alias);"],
    invalid: [
      { code: "const alias = source; consume({ alias });", errors: [{ messageId: "singleUseAlias" }] },
      { code: "const alias = source; consume(object[alias]);", errors: [{ messageId: "singleUseAlias" }] },
      { code: "const alias = source; consume({ [alias]: true });", errors: [{ messageId: "singleUseAlias" }] },
      { code: "const alias = source; function consume() { return alias; }", errors: [{ messageId: "singleUseAlias" }] },
      { code: "const alias = source.value; consume(alias);", errors: [{ messageId: "singleUseAlias" }] },
    ],
  });
});

test("no-single-use-renaming-alias reports aliases used once", () => {
  const { visitor, reports } = createRule("no-single-use-renaming-alias");
  const alias = {
    type: "VariableDeclarator",
    id: id("userData"),
    init: id("user"),
  };

  visit(visitor, "Program", { type: "Program" });
  visit(visitor, "VariableDeclarator", alias);
  visit(visitor, "Identifier", {
    type: "Identifier",
    name: "userData",
    parent: { type: "ReturnStatement" },
  });
  visit(visitor, "Program:exit", { type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "singleUseAlias");
});

test("prefer-guard-clauses preserves existing exits and short branches", () => {
  runNative("prefer-guard-clauses", {
    valid: ["const work = () => ready;", "function work() {}",
      "function work() { if (ready) run(); }", "function work() { if (ready) {} }",
      "function work() { if (ready) { run(); } }",
      "function work() { if (ready) { run(); save(); } else recover(); }",
      "function work() { if (ready) { run(); return; } }",
      "function work() { if (ready) { run(); if (saved) return; else throw error; } }"],
    invalid: [{
      code: "function work() { if (ready) { run(); if (saved) return; } }",
      errors: [{ messageId: "preferGuard" }],
    }],
  });
});

test("prefer-guard-clauses reports whole-function wrapped branches", () => {
  const { visitor, reports } = createRule("prefer-guard-clauses");

  visit(visitor, "FunctionDeclaration", {
    type: "FunctionDeclaration",
    body: {
      type: "BlockStatement",
      body: [
        {
          type: "IfStatement",
          test: id("user"),
          consequent: {
            type: "BlockStatement",
            body: [{ type: "ExpressionStatement" }, { type: "ExpressionStatement" }],
          },
        },
      ],
    },
  });

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "preferGuard");
});

test("no-unnecessary-block-callback reports callbacks that only return", () => {
  const { visitor, reports } = createRule("no-unnecessary-block-callback");
  const callback = arrow([id("item")], {
    type: "BlockStatement",
    body: [{ type: "ReturnStatement", argument: id("item") }],
  });
  call(id("map"), [callback]);

  visit(visitor, "ArrowFunctionExpression", callback);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "unnecessaryBlock");
});

test("no-unnecessary-async preserves promise contracts through Oxlint", () => {
  runNative("no-unnecessary-async", {
    valid: [
      "async function load() { throw new Error('failed'); }",
      "async function load() { return fetch('/data'); }",
      "async function load(value) { return value; }",
      "async function load() { return 1; }",
      "async function load() {}",
      "const load = async () => fetch('/data');",
      "const load = async () => 1;",
      "async function load(value = fail()) { return value; }",
    ],
    invalid: [],
  });
});

test("no-unnecessary-async catches direct return await", () => {
  const { visitor, reports } = createRule("no-unnecessary-async");
  const plainAsync = arrow([], block());
  plainAsync.async = true;
  const returnedAwait: AstNode = { type: "AwaitExpression", argument: call(id("load")) };
  const directReturn: AstNode = { type: "ReturnStatement", argument: returnedAwait };
  returnedAwait.parent = directReturn;
  const returnAwait = arrow([], block([directReturn]));
  returnAwait.async = true;

  visit(visitor, "ArrowFunctionExpression", plainAsync);
  visit(visitor, "ArrowFunctionExpression", returnAwait);

  assert.deepEqual(
    reports.map((report) => report.messageId),
    ["unnecessaryReturnAwait"],
  );
});

test("no-unnecessary-async keeps async functions with meaningful awaited work", () => {
  const { visitor, reports } = createRule("no-unnecessary-async");
  const awaited: AstNode = { type: "AwaitExpression", argument: call(id("load")) };
  const statement = expressionStatement(awaited);
  const node = arrow([], block([statement, { type: "ReturnStatement", argument: id("value") }]));
  node.async = true;

  visit(visitor, "ArrowFunctionExpression", node);

  assert.equal(reports.length, 0);
});

test("no-small-collection-conversion reports small Map and Set inputs", () => {
  const { visitor, reports } = createRule("no-small-collection-conversion");
  const setNode = newExpression("Set", [arrayExpression([literal("a"), literal("b")])]);
  const mapEntry = arrayExpression([literal("a"), literal(1)]);
  const mapNode = newExpression("Map", [arrayExpression([mapEntry])]);
  methodCall(setNode, "has", [id("value")]);
  methodCall(mapNode, "get", [id("key")]);

  visit(visitor, "NewExpression", setNode);
  visit(visitor, "NewExpression", mapNode);

  assert.deepEqual(
    reports.map((report) => report.data),
    [
      { collection: "Set", count: 2, min: 3 },
      { collection: "Map", count: 1, min: 3 },
    ],
  );
});

test("no-small-collection-conversion supports scope-manager global references", () => {
  const setNode = newExpression("Set", [arrayExpression([literal("a")])]);
  assert.ok(setNode.callee);
  const references = [{ identifier: setNode.callee }];
  const variable = { defs: [], references };
  const scopeManager = { scopes: [{ set: new Map([["Set", variable]]) }] };
  const sourceCode = { text: "", scopeManager };
  const { visitor, reports } = createRule("no-small-collection-conversion", [], { sourceCode });
  methodCall(setNode, "has", [id("value")]);
  visit(visitor, "NewExpression", setNode);
  assert.equal(reports.length, 1);
});

test("no-small-collection-conversion ignores useful or unknown collection sizes", () => {
  const { visitor, reports } = createRule("no-small-collection-conversion");
  const values = arrayExpression([literal("a"), literal("b"), literal("c")]);
  const largeSet = newExpression("Set", [values]);
  const dynamicMap = newExpression("Map", [id("entries")]);
  methodCall(largeSet, "has", [id("value")]);
  methodCall(dynamicMap, "get", [id("key")]);

  visit(visitor, "NewExpression", largeSet);
  visit(visitor, "NewExpression", dynamicMap);
  visit(visitor, "NewExpression", newExpression("Set", [arrayExpression([literal("a")])]));
  visit(visitor, "NewExpression", newExpression("Set"));

  assert.equal(reports.length, 0);
});

test("no-small-collection-conversion ignores shadowed constructors through Oxlint", () => {
  runNative("no-small-collection-conversion", {
    valid: [
      'function read(Map) { return new Map([["a", 1]]).get("a"); }',
      'import { Set } from "./set.js"; new Set(["a"]).has("a");',
      'class Map {} new Map([["a", 1]]).get("a");',
    ],
    invalid: [{
      code: 'new Set(["a"]).has("a");',
      errors: [{ messageId: "smallCollection", data: { collection: "Set", count: 1, min: 3 } }],
    }],
  });
});

test("prefer-flat-map respects the flattening depth", () => {
  runNative("prefer-flat-map", {
    valid: ["items.flat();", "items.map(transform).flat(2);", "items.map(transform).flat(depth);"],
    invalid: [
      { code: "items.map(transform).flat();", errors: [{ messageId: "preferFlatMap" }] },
      { code: "items.map(transform).flat(1);", errors: [{ messageId: "preferFlatMap" }] },
    ],
  });
});

test("no-identity-array-callback distinguishes useful callbacks", () => {
  runNative("no-identity-array-callback", {
    valid: ["items.map(transform);", "items.map();", "items.map(item => { work(); });",
      "items.map(item => { work(); return item; });", "items.map(({ value }) => value);",
      "items.map(() => value);", "items.map(item => item.value);", "items.filter(item => item);",
      "items.filter(item => false);"],
    invalid: [
      { code: "items.map(item => { return item; });", errors: [{ messageId: "identityMap" }] },
      { code: "items.filter(() => { return true; });", errors: [{ messageId: "alwaysTrueFilter" }] },
    ],
  });
});

test("prefer-flat-map reports map followed by flat", () => {
  const { visitor, reports } = createRule("prefer-flat-map");
  const mapCall = methodCall(id("items"), "map", [arrow([id("item")], id("item"))]);
  const flatCall = methodCall(mapCall, "flat");

  visit(visitor, "CallExpression", flatCall);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "preferFlatMap");
});

test("no-identity-array-callback reports identity map and always-true filter", () => {
  const { visitor, reports } = createRule("no-identity-array-callback");

  visit(visitor, "CallExpression", methodCall(id("items"), "map", [arrow([id("item")], id("item"))]));
  visit(visitor, "CallExpression", methodCall(id("items"), "filter", [arrow([], literal(true))]));

  assert.equal(reports.length, 2);
  assert.equal(getReport(reports, 0).messageId, "identityMap");
  assert.equal(getReport(reports, 1).messageId, "alwaysTrueFilter");
});

test("no-redundant-nullish-fallback preserves null normalization and shadowed undefined", () => {
  runNative("no-redundant-nullish-fallback", {
    valid: [
      "const normalized = null ?? undefined;",
      "const normalized = value ?? undefined;",
      "const normalized = value?.name ?? undefined;",
      "function normalize(value, undefined) { return value ?? undefined; }",
      "function normalize(undefined) { return (void 0) ?? undefined; }",
      "function normalize() { return (void 0) ?? void undefined; let undefined; }",
    ],
    invalid: [{ code: "const normalized = (void 0) ?? undefined;", errors: [{ messageId: "redundantUndefined" }] }],
  });
  const normalize = (value: unknown) => value ?? undefined;
  assert.equal(normalize(null), undefined);
  assert.notEqual(normalize(null), null);
});

test("no-redundant-nullish-fallback reports undefined fallbacks", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const voidZero = unary("void", literal(0));
  const voidUndefined = unary("void", id("undefined"));
  const voidBinary = unary("void", binary(literal(1), "+", literal(2)));
  const voidBigIntBinary = unary("void", binary(bigintLiteral(1n), "+", bigintLiteral(2n)));
  const voidRegex = unary("void", literal(/value/));

  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), id("undefined"), "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), voidZero, "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), voidUndefined, "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), voidBinary, "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), voidBigIntBinary, "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), voidRegex, "??"));

  assert.equal(reports.length, 6);
  reports.forEach((report) => assert.equal(report.messageId, "redundantUndefined"));
});

test("no-redundant-nullish-fallback evaluates static operators", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const arithmeticOperators = ["+", "-", "*", "/", "%", "**"];
  const bitwiseOperators = ["&", "|", "^", "<<", ">>", ">>>"];
  const comparisonOperators = ["==", "!=", "===", "!==", "<", "<=", ">", ">="];
  const binaryOperators = arithmeticOperators.concat(bitwiseOperators, comparisonOperators);
  const binaryArguments = binaryOperators.map((operator) => binary(literal(4), operator, literal(2)));
  const bigintOperators = ["+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>"];
  const bigintArguments = bigintOperators.map((operator) =>
    binary(bigintLiteral(4n), operator, bigintLiteral(2n)),
  );
  const numberUnaryArguments = ["!", "+", "-", "~", "delete", "typeof", "void"].map(
    (operator) => unary(operator, literal(1)),
  );
  const bigintUnaryArguments = [unary("-", bigintLiteral(1n)), unary("~", bigintLiteral(1n))];
  const unaryArguments = numberUnaryArguments.concat(bigintUnaryArguments);
  const mixedBigIntArguments = [
    binary(bigintLiteral(1n), "+", literal(" item")),
    binary(bigintLiteral(1n), "<", literal(2)),
  ];
  const logicalArguments = [
    logical(literal(true), literal(1), "&&"),
    logical(literal(false), literal(1), "||"),
    logical(literal(null), literal(1), "??"),
    logical(literal(false), binary(bigintLiteral(1n), "+", literal(1)), "&&"),
    logical(literal(true), binary(bigintLiteral(1n), "+", literal(1)), "||"),
    logical(literal(1), binary(bigintLiteral(1n), "+", literal(1)), "??"),
  ];
  const staticArguments = binaryArguments.concat(
    bigintArguments,
    unaryArguments,
    mixedBigIntArguments,
    logicalArguments,
  );

  staticArguments.forEach((argument) => {
    visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), unary("void", argument), "??"));
  });

  assert.equal(reports.length, staticArguments.length);
});

test("no-redundant-nullish-fallback allows effectful void fallbacks", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const logMissCall = call(id("logMiss"));
  const effectfulVoid = unary("void", logMissCall);
  const effectfulBinaryVoid = unary("void", binary(logMissCall, "+", literal(1)));

  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), effectfulVoid, "??"));
  visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), effectfulBinaryVoid, "??"));

  assert.equal(reports.length, 0);
});

test("no-redundant-nullish-fallback allows throwing void fallbacks", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const throwingArguments = [
    binary(bigintLiteral(1n), "+", literal(1)),
    binary(bigintLiteral(1n), "/", bigintLiteral(0n)),
    binary(bigintLiteral(1n), "**", unary("-", bigintLiteral(1n))),
    binary(bigintLiteral(1n), ">>>", bigintLiteral(1n)),
    binary(literal(1), "in", literal(2)),
    unary("+", bigintLiteral(1n)),
    logical(literal(true), binary(bigintLiteral(1n), "+", literal(1)), "&&"),
  ];

  throwingArguments.forEach((argument) => {
    visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), unary("void", argument), "??"));
  });

  assert.equal(reports.length, 0);
});

test("no-redundant-nullish-fallback skips oversized BigInt evaluation", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const oversizedShift = bigintLiteral(1_000_000n);
  const oversizedArguments = [
    binary(bigintLiteral(2n), "**", bigintLiteral(1_000_000n)),
    binary(bigintLiteral(1n), "<<", oversizedShift),
    binary(bigintLiteral(1n), ">>", unary("-", bigintLiteral(1_000_000n))),
  ];

  oversizedArguments.forEach((argument) => {
    visit(visitor, "LogicalExpression", logical(unary("void", literal(0)), unary("void", argument), "??"));
  });

  assert.equal(reports.length, 0);
});

test("no-redundant-nullish-fallback evaluates BigInt through Oxlint", () => {
  const code = [
    "(void 0) ?? void (1n + 2n);",
    "(void 0) ?? void (1n + 1);",
    "(void 0) ?? void (1n / 0n);",
    "(void 0) ?? void (1n ** -1n);",
  ].join("\n");
  runNative("no-redundant-nullish-fallback", {
    valid: ["(void 0) ?? void (2n ** 1000000n);"],
    invalid: [{ code, errors: [{ messageId: "redundantUndefined", line: 1 }] }],
  });
});

test("prefer-object-lookup reports long equality OR chains", () => {
  const { visitor, reports } = createRule("prefer-object-lookup");
  const first = binary(id("type"), "===", literal("a"));
  const second = binary(id("type"), "===", literal("b"));
  const third = binary(id("type"), "===", literal("c"));
  const chain = logical(logical(first, second, "||"), third, "||");

  visit(visitor, "LogicalExpression", chain);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "preferLookup");
});

test("prefer-object-lookup handles deep chains without recursive traversal", () => {
  const { visitor, reports } = createRule("prefer-object-lookup");
  const values = Array.from({ length: 20_000 }, (_, index) => index);
  const first = binary(id("kind"), "===", literal(-1));
  const chain = values.reduce((left, value) => {
    const right = binary(id("kind"), "===", literal(value));
    return logical(left, right, "||");
  }, first);
  visit(visitor, "LogicalExpression", chain);
  assert.equal(reports.length, 1);
  assert.equal(getReportData(reports, 0).name, "kind");
});

test("prefer-object-lookup allows custom equality operators", () => {
  const { visitor, reports } = createRule("prefer-object-lookup", [
    { min: 2, operators: ["is"] },
  ]);
  const first = binary(id("type"), "is", literal("a"));
  const second = binary(id("type"), "is", literal("b"));
  const chain = logical(first, second, "||");

  visit(visitor, "LogicalExpression", chain);

  assert.equal(reports.length, 1);
  assert.equal(getReport(reports, 0).messageId, "preferLookup");
});

test("hoist-if-operators reports parsed conditions through Oxlint", () => {
  runNative("hoist-if-operators", {
    valid: ["if (ready) { run(); }"],
    invalid: [{
      code: "if (ready && enabled) { run(); }",
      errors: [{ messageId: "tooMany", data: { count: 1, max: 0 } }],
    }],
  });
});

test("agent computed-value options report unnamed values through Oxlint", () => {
  const code = [
    "function getRoute(url) {",
    "  const route = { name: getRouteName(url.pathname) };",
    "  return getRouteName(url.pathname);",
    "}",
  ].join("\n");
  const config = plugin.configs.agentRecommended.rules["legibility/no-computed-values"];
  assert.ok(Array.isArray(config));
  const options = [{ objectValues: "named", returnValues: "named" }];
  assert.deepEqual(config.slice(1), options);
  runNative("no-computed-values", {
    valid: [],
    invalid: [{
      code, options,
      errors: [{ messageId: "unnamedObjectValue" }, { messageId: "unnamedReturnValue" }],
    }],
  });
});


test("no-unnecessary-async respects destructured and local filesystem bindings", () => {
  const imports = 'import { readFile } from "node:fs/promises";';
  const declarations = [
    "const { readFile } = client;", "const { readFile = fallback } = client;",
    "const { nested: { readFile } } = client;", "const { ...readFile } = client;",
    "const [readFile] = client;", "const [...readFile] = client;",
    "function readFile() {}", "class readFile {}",
  ];
  const valid = declarations.map((declaration) =>
    `${imports} async function load() { ${declaration} const result = await readFile(file); return result; }`,
  );
  runNative("no-unnecessary-async", { valid, invalid: [] });
});

test("no-unnecessary-async respects destructured parameters and catch bindings", () => {
  const imports = 'import { readFile } from "node:fs/promises";';
  runNative("no-unnecessary-async", {
    valid: [
      `${imports} async function load({ readFile }) { const value = await readFile(file); return value; }`,
      `${imports} async function load(readFile = fallback) { const value = await readFile(file); return value; }`,
      `${imports} async function load() { try {} catch (readFile) { const value = await readFile(file); } }`,
      `${imports} async function load() { try {} catch {} await request(); }`,
      "async function load() { for await (const entry of stream) consume(entry); }",
    ],
    invalid: [],
  });
});

test("no-unnecessary-async ignores shadowed filesystem imports through Oxlint", () => {
  const code = [
    'import { readFile } from "node:fs/promises";',
    'import { promises as fs } from "node:fs";',
    'async function readConfig() { return await readFile("config.json", "utf8"); }',
    'async function readData() { const value = await fs.readFile("data.json"); return value; }',
    'async function request() { const value = await fetch("/data"); return value.json(); }',
    'async function readParameter(readFile) { const value = await readFile("remote"); return value; }',
    'async function readClient() { const fs = client; const value = await fs.readFile("remote"); return value; }',
  ].join("\n");
  runNative("no-unnecessary-async", {
    valid: [],
    invalid: [{
      code,
      errors: [
        { line: 3, messageId: "synchronousFilesystem" },
        { line: 4, messageId: "synchronousFilesystem" },
      ],
    }],
  });
});

test("max-function-parameters handles TypeScript signatures and this parameters", () => {
  const code = [
    "declare function declared(a: string, b: string, c: string, d: string, e: string): void;",
    "type Handler = (a: string, b: string, c: string, d: string, e: string) => void;",
    "function runtime(this: void, a: string, b: string, c: string, d: string): void {}",
  ].join("\n");
  runNative("max-function-parameters", {
    valid: [],
    invalid: [{
      code,
      errors: [
        { line: 1, messageId: "tooManyParameters" },
        { line: 2, messageId: "tooManyParameters" },
      ],
    }],
  });
});

test("comment rules inspect parsed comments through Oxlint", () => {
  const identifier = ["chat", "gpt"].join("");
  const attribution = ["Generated by", identifier].join(" ");
  const code = ["/*", ` * ${attribution}.`, " */", "const value = true;"].join("\n");
  const valid = ["/**", " * APPROVED: Explain the value.", " */", "const value = true;"].join("\n");
  const options = [{ matchers: [], prefixIdentifiers: ["APPROVED"] }];
  runNative("no-automated-comment-attribution", {
    valid: [valid], invalid: [{ code, errors: [{ messageId: "prohibitedAttribution" }] }],
  });
  runNative("no-unmatched-comments", {
    valid: [{ code: valid, options }],
    invalid: [{ code, options, errors: [{ messageId: "unmatched" }] }],
  });
  runNative("no-stacked-comments", {
    valid: [code, valid],
    invalid: [{
      code: "// APPROVED: First explanation.\n// APPROVED: Second explanation.\nconst value = true;",
      errors: [{ messageId: "stackedComment" }],
    }],
  });
});

// RuleTester registers each case separately; retain one visitor set to exercise cross-file state.
function createReusableRule(name: string): NativeRule {
  const rule = getRule(name);
  let activeContext: RuleContext;
  let visitor: RuleListener | undefined;
  const context = new Proxy({} as RuleContext, {
    get(_target, key) {
      const value = Reflect.get(activeContext, key, activeContext);
      if (typeof value === "function") return value.bind(activeContext);
      return value;
    },
  });
  return {
    meta: rule.meta,
    createOnce(nextContext: RuleContext) {
      activeContext = nextContext;
      visitor ??= rule.createOnce(context);
      return visitor;
    },
  } as unknown as NativeRule;
}

function checkNativeCase(
  name: string,
  rule: NativeRule,
  sample: RuleTester.ValidTestCase,
  errors: RuleTester.Error[],
): void {
  if (errors.length === 0) {
    ruleTester.run(name, rule, { valid: [sample], invalid: [] });
    return;
  }
  const invalid = Object.assign({}, sample, { errors });
  ruleTester.run(name, rule, { valid: [], invalid: [invalid] });
}

const optionCases = [
  {
    name: "max-function-parameters", code: "function read(a, b) {}",
    options: [{ max: 1 }], defaults: [], configured: ["tooManyParameters"],
  },
  {
    name: "hoist-if-operators", code: "if (ready && enabled) run();",
    options: [{ operators: [] }], defaults: ["tooMany"], configured: [],
  },
  {
    name: "max-expression-operators", code: "function sum() { return a + b; }",
    options: [{ max: 1, complexity: { "+": 2 }, operators: ["+"] }],
    defaults: [], configured: ["tooMany"],
  },
  {
    name: "no-complex-ternaries", code: "const value = ready ? first : second;",
    options: [{ max: 1, complexity: { "?:": 2 }, operators: ["?:"] }],
    defaults: [], configured: ["tooMany"],
  },
  {
    name: "no-computed-values", code: "const value = { result: compute() };",
    options: [{ objectValues: "named" }], defaults: [], configured: ["unnamedObjectValue"],
  },
  {
    name: "no-hidden-side-effects", code: "function save() { return store.commit(); }",
    options: [{ mutatingMethods: ["commit"] }], defaults: [], configured: ["hiddenSideEffect"],
  },
  {
    name: "no-standalone-array-mutations", code: "items.push(value);",
    options: [{ arrayMutatingMethods: [], mutatingMethods: [] }],
    defaults: ["standaloneArrayMutation"], configured: [],
  },
  {
    name: "no-quadratic-patterns", code: "for (const item of items) users.find(match);",
    options: [{ searchMethods: [] }], defaults: ["searchInLoop"], configured: [],
  },
  {
    name: "max-control-flow-depth", code: "if (ready) { if (enabled) run(); }",
    options: [{ max: 1 }], defaults: [], configured: ["tooDeep"],
  },
  {
    name: "max-array-chain-depth", code: "items.map(convert).filter(keep);",
    options: [{ max: 1 }], defaults: [], configured: ["tooMany"],
  },
  {
    name: "no-repeated-collection-search", code: "users.find(first); users.find(second);",
    options: [{ searchMethods: [] }], defaults: ["repeatedSearch"], configured: [],
  },
  {
    name: "no-redundant-boolean-logic", code: "const value = !ready === true;",
    options: [{ equalityOperators: [] }], defaults: ["booleanComparison"], configured: [],
  },
  {
    name: "prefer-positive-condition-names", code: "const isNotReady = state === ready;",
    options: [{ booleanOperators: [] }], defaults: ["negativeName"], configured: [],
  },
  {
    name: "no-small-collection-conversion", code: "new Set([1]).has(1);",
    options: [{ min: 1 }], defaults: ["smallCollection"], configured: [],
  },
  {
    name: "prefer-object-lookup", code: "const value = kind === 'a' || kind === 'b';",
    options: [{ min: 2 }], defaults: [], configured: ["preferLookup"],
  },
  {
    name: "no-direct-node-bin-smoke", code: "execSync('node src/index.js --help');",
    options: [{ entryPatterns: [] }], defaults: ["directNodeBin"], configured: [],
  },
  {
    name: "require-executable-shebang", code: "export const value = true;",
    options: [{ files: [] }], defaults: ["missingShebang"], configured: [],
  },
  {
    name: "no-automated-comment-attribution", code: "// @author robot",
    options: [{ identifiers: ["robot"] }], defaults: [], configured: ["prohibitedAttribution"],
  },
  {
    name: "no-unmatched-comments", code: "// APPROVED: retain this",
    options: [{ prefixIdentifiers: ["APPROVED"] }], defaults: ["unmatched"], configured: [],
  },
  {
    name: "require-filename-matches-dirname", code: "export const value = true;",
    options: [{ schema: "index" }], defaults: ["missingSchema"], configured: [],
  },
];

optionCases.forEach(({ name, code, options, defaults, configured }) => {
  test(`${name} refreshes options on a reused visitor and restores defaults`, () => {
    const rule = createReusableRule(name);
    const sample = { code, filename: "/repo/src/index.ts", cwd: "/repo" };
    const changed = Object.assign({}, sample, { options });
    const defaultErrors = defaults.map((messageId) => ({ messageId }));
    const configuredErrors = configured.map((messageId) => ({ messageId }));
    checkNativeCase(name, rule, sample, defaultErrors);
    checkNativeCase(name, rule, changed, configuredErrors);
    checkNativeCase(name, rule, sample, defaultErrors);
  });
});

const filesystemImportCases = [
  { declaration: 'import { readFile } from "node:fs/promises";', method: "readFile" },
  { declaration: 'import * as fs from "node:fs/promises";', method: "fs.readFile" },
  { declaration: 'import { promises as fs } from "node:fs";', method: "fs.readFile" },
  { declaration: 'import fs from "node:fs";', method: "fs.promises.readFile" },
];

filesystemImportCases.forEach(({ declaration, method }) => {
  test(`no-unnecessary-async resets ${declaration} across files`, () => {
    const name = "no-unnecessary-async";
    const rule = createReusableRule(name);
    const body = `async function read() { const value = await ${method}("config"); return value; }`;
    const code = declaration + "\n" + body;
    const errors = [{ messageId: "synchronousFilesystem" }];
    checkNativeCase(name, rule, { code }, errors);
    checkNativeCase(name, rule, { code: body }, []);
    checkNativeCase(name, rule, { code }, errors);
  });
});

test("max-expression-operators resets its per-file duplicate-report cache", () => {
  const { visitor, reports } = createRule("max-expression-operators", [{ max: 1 }]);
  const expression = logical(logical(id("ready"), id("enabled")), id("allowed"));
  const node = { type: "ReturnStatement", argument: expression };
  visit(visitor, "ReturnStatement", node);
  visit(visitor, "ReturnStatement", node);
  assert.equal(reports.length, 1);
  runHook(visitor, "after");
  runHook(visitor, "before");
  visit(visitor, "ReturnStatement", node);
  assert.equal(reports.length, 2);
});

test("filename and source readers follow the current file on reused visitors", () => {
  const { context, visitor, reports } = createRule("require-executable-shebang");
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
  context.sourceCode = { text: "#!/usr/bin/env node\n" };
  runHook(visitor, "before");
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
  context.filename = "/repo/src/helpers.ts";
  context.sourceCode = { text: "export const value = true;" };
  runHook(visitor, "before");
  visit(visitor, "Program", { type: "Program" });
  assert.equal(reports.length, 1);
});

const lifecycleHooks = ["before", "after"] as const;

lifecycleHooks.forEach((hook) => {
  test(`max-control-flow-depth clears unfinished traversal state in ${hook}`, () => {
    const { visitor, reports } = createRule("max-control-flow-depth", [{ max: 1 }]);
    visit(visitor, "IfStatement", { type: "IfStatement" });
    visit(visitor, "FunctionDeclaration", { type: "FunctionDeclaration" });
    visit(visitor, "IfStatement", { type: "IfStatement" });
    runHook(visitor, hook);
    visit(visitor, "IfStatement", { type: "IfStatement" });
    assert.equal(reports.length, 0);
  });
});

lifecycleHooks.forEach((hook) => {
  test(`no-quadratic-patterns clears unfinished loop state in ${hook}`, () => {
    const { visitor, reports } = createRule("no-quadratic-patterns");
    const search = methodCall(id("users"), "find");
    const body = block([expressionStatement(search)]);
    const loop = { type: "ForStatement", body };
    body.parent = loop;
    visit(visitor, "ForStatement", loop);
    visit(visitor, "CallExpression", search);
    assert.equal(reports.length, 1);
    runHook(visitor, hook);
    visit(visitor, "CallExpression", search);
    assert.equal(reports.length, 1);
  });
});

lifecycleHooks.forEach((hook) => {
  test(`no-repeated-collection-search clears unfinished scopes in ${hook}`, () => {
    const { visitor, reports } = createRule("no-repeated-collection-search");
    visit(visitor, "Program", { type: "Program" });
    visit(visitor, "CallExpression", methodCall(id("users"), "find"));
    runHook(visitor, hook);
    visit(visitor, "CallExpression", methodCall(id("users"), "find"));
    assert.equal(reports.length, 0);
  });
});

lifecycleHooks.forEach((hook) => {
  test(`no-single-use-renaming-alias clears unfinished scopes in ${hook}`, () => {
    const { visitor, reports } = createRule("no-single-use-renaming-alias");
    visit(visitor, "Program", { type: "Program" });
    visit(visitor, "VariableDeclarator", { type: "VariableDeclarator", id: id("alias"), init: id("value") });
    visit(visitor, "Identifier", { type: "Identifier", name: "alias", parent: { type: "ReturnStatement" } });
    runHook(visitor, hook);
    visit(visitor, "Program:exit", { type: "Program" });
    assert.equal(reports.length, 0);
  });
});
