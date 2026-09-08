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
import type { AstNode, RuleContext, RuleListener, RuleReport } from "../../../src/types.ts";

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
  const rule = plugin.rules[name] as unknown as NativeRule;
  ruleTester.run(name, rule, cases);
}

function runHook(visitor: RuleListener, name: "before" | "after"): void {
  const hook = visitor[name];
  if (hook) Reflect.apply(hook, visitor, []);
}

function createContext(options: any[] = [], overrides: any = {}) {
  const reports: RuleReport[] = [];
  const sourceCode = {
    ast: { type: "Program" },
    text: "const value = true;\n",
    getText: (node?: AstNode) => node?.__text ?? "",
    isGlobalReference: () => true,
  };
  const context = Object.assign({
    options,
    filename: "/repo/src/index.js",
    cwd: "/repo",
    sourceCode,
    report: (report: RuleReport) => reports.push(report),
  }, overrides);
  return { context, reports };
}

function createRule(name: string, options: any[] = [], overrides: any = {}) {
  const { context, reports } = createContext(options, overrides);
  const visitor = plugin.rules[name].createOnce(context);
  runHook(visitor, "before");
  return { context, reports, visitor };
}

function createCommentRule(name: string, comments: any[], options: any[] = []) {
  return createRule(name, options, {
    sourceCode: {
      text: "",
      getAllComments: () => comments,
      getText(node) {
        if (!node) return "";
        return typeof node.__text === "string" ? node.__text : "";
      },
    },
  });
}

function comment(type: "Block" | "Line", value: string, text: string): any {
  return { type, value, __text: text };
}

function locatedComment(
  type: "Block" | "Line",
  value: string,
  text: string,
  startLine: number,
  endLine = startLine,
): any {
  const start = { column: 0, line: startLine };
  const end = { column: text.length, line: endLine };
  const node = comment(type, value, text);
  node.loc = { start, end };
  return node;
}

function call(callee: any, args: any[] = []): any {
  const node: any = {
    type: "CallExpression",
    callee,
    arguments: args,
  };
  if (callee && typeof callee === "object") callee.parent = node;
  args
    .filter((arg) => arg && typeof arg === "object")
    .forEach((arg) => {
      arg.parent = node;
    });
  return node;
}

function member(object: any, property: string): any {
  const node: any = {
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

function methodCall(object: any, property: string, args: any[] = []): any {
  const memberNode = member(object, property);
  const node = call(memberNode, args);
  memberNode.parent = node;
  return node;
}

function expressionStatement(expression: any): any {
  const node: any = {
    type: "ExpressionStatement",
    expression,
  };
  expression.parent = node;
  return node;
}

function block(body: any[] = []): any {
  const node: any = {
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

function literal(value: any): any {
  return {
    type: "Literal",
    value,
    __text: JSON.stringify(value),
  };
}

function bigintLiteral(value: bigint): any {
  return {
    type: "Literal",
    value,
    bigint: String(value),
    __text: `${value}n`,
  };
}

function arrayExpression(elements: any[]): any {
  const node: any = { type: "ArrayExpression", elements };
  elements.forEach((element) => {
    if (element && typeof element === "object") element.parent = node;
  });
  return node;
}

function newExpression(name: string, args: any[] = []): any {
  const callee = id(name);
  const node: any = { type: "NewExpression", callee, arguments: args };
  callee.parent = node;
  args.forEach((arg) => {
    if (arg && typeof arg === "object") arg.parent = node;
  });
  return node;
}

function objectProperty(name: string): any {
  const key = id(name);
  const value = id(name);
  const node: any = {
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

function objectPattern(names: string[]): any {
  const properties = names.map(objectProperty);
  const node: any = { type: "ObjectPattern", properties };
  properties.forEach((property) => {
    property.parent = node;
  });
  return node;
}

function assignmentPattern(left: any, right: any): any {
  const node: any = { type: "AssignmentPattern", left, right };
  left.parent = node;
  right.parent = node;
  return node;
}

function binary(left: any, operator: string, right: any): any {
  const node: any = {
    type: "BinaryExpression",
    operator,
    left,
    right,
  };
  left.parent = node;
  right.parent = node;
  return node;
}

function logical(left: any, right: any, operator = "&&"): any {
  const node: any = {
    type: "LogicalExpression",
    operator,
    left,
    right,
  };
  left.parent = node;
  right.parent = node;
  return node;
}

function unary(operator: string, argument: any): any {
  const node: any = { type: "UnaryExpression", operator, argument };
  argument.parent = node;
  return node;
}

function arrow(params: any[], body: any): any {
  const node: any = {
    type: "ArrowFunctionExpression",
    params,
    body,
  };
  params.forEach((param) => {
    param.parent = node;
  });
  if (body && typeof body === "object") body.parent = node;
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
    assert.equal(plugin.rules[name].meta.docs?.recommended, true);
    assert.equal(recommended[`legibility/${name}`], "warn");
    assert.equal(strict[`legibility/${name}`], "error");
  });
  STRICT_ONLY_RULE_NAMES.forEach((name) => {
    assert.equal(plugin.rules[name].meta.docs?.recommended, false);
    assert.equal(recommended[`legibility/${name}`], undefined);
    assert.equal(strict[`legibility/${name}`], "error");
  });
  OPT_IN_RULE_NAMES.forEach((name) => {
    assert.equal(plugin.rules[name].meta.docs?.recommended, false);
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

  visitor.FunctionDeclaration(node);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooManyParameters");
  assert.deepEqual(reports[0].data, { name: "sendRequest", count: 5, max: 4 });
});

test("max-function-parameters reports oversized object parameters", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const pattern = objectPattern(names);
  const defaultValue = { type: "ObjectExpression", properties: [] };
  const node = arrow([assignmentPattern(pattern, defaultValue)], block());
  const { visitor, reports } = createRule("max-function-parameters");

  visitor.ArrowFunctionExpression(node);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooManyObjectProperties");
  assert.deepEqual(reports[0].data, { name: "Function", count: 9, max: 8 });
});

test("max-function-parameters supports independent limits", () => {
  const options = [{ max: 1, maxObjectProperties: 2 }];
  const objectParameter = objectPattern(["first", "second", "third"]);
  const node = arrow([objectParameter, id("extra")], block());
  const { visitor, reports } = createRule("max-function-parameters", options);

  visitor.ArrowFunctionExpression(node);

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

  visitor.ArrowFunctionExpression(node);

  assert.equal(reports.length, 0);
});

test("no-unmatched-comments bans comments by default and ignores shebangs", () => {
  const comments = [
    comment("Line", " Explain the branch.", "// Explain the branch."),
    comment("Block", "*\n * Explain the API.\n ", "/**\n * Explain the API.\n */"),
    { type: "Shebang", value: "/usr/bin/env node", __text: "#!/usr/bin/env node" },
  ];
  const { visitor, reports } = createCommentRule("no-unmatched-comments", comments);

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 2);
  assert.equal(reports[0].messageId, "unmatched");
  assert.equal(reports[1].messageId, "unmatched");
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

  visitor.Program({ type: "Program" });

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

  customRule.visitor.Program({ type: "Program" });
  banAllRule.visitor.Program({ type: "Program" });
  invalidRule.visitor.Program({ type: "Program" });

  assert.equal(customRule.reports.length, 0);
  assert.equal(banAllRule.reports.length, 1);
  assert.equal(invalidRule.reports.length, 1);
});

test("comment rules accept direct sources without text readers", () => {
  const comments = [comment("Line", " APPROVED: preserve this", "// APPROVED: preserve this")];
  const sourceCode = { getAllComments: () => comments };
  const options = [{ prefixIdentifiers: ["APPROVED"] }];
  const { visitor, reports } = createRule("no-unmatched-comments", options, { sourceCode });

  visitor.Program({ type: "Program" });

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

  allowedRule.visitor.Program({ type: "Program" });
  rejectedRule.visitor.Program({ type: "Program" });

  assert.equal(allowedRule.reports.length, 0);
  assert.equal(rejectedRule.reports.length, 2);
});

test("no-stacked-comments reports comments on consecutive lines", () => {
  const comments = [
    locatedComment("Line", " First comment.", "// First comment.", 1),
    locatedComment("Line", " Second comment.", "// Second comment.", 2),
  ];
  const { visitor, reports } = createCommentRule("no-stacked-comments", comments);

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "stackedComment");
  assert.equal(reports[0].node, comments[1]);
});

test("no-stacked-comments accepts comments separated by blank lines", () => {
  const comments = [
    locatedComment("Line", " First comment.", "// First comment.", 1),
    locatedComment("Line", " Second comment.", "// Second comment.", 3),
    locatedComment("Block", " Third comment. ", "/* Third comment. */", 5),
  ];
  const { visitor, reports } = createCommentRule("no-stacked-comments", comments);

  visitor.Program({ type: "Program" });

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

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "useJsdoc");
  assert.equal(typeof reports[0].fix, "function");
  assert.equal(plugin.rules["require-jsdoc-multiline-comments"].meta.fixable, "code");
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

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 2);
  assert.equal(reports[0].data.identifier, firstIdentifier);
  assert.equal(reports[1].data.identifier, secondIdentifier);
});

test("no-automated-comment-attribution ignores ordinary technology references", () => {
  const identifier = ["chat", "gpt"].join("");
  const value = ` Send a request to ${identifier}. @author Jeff`;
  const comments = [comment("Line", value, "// request")];
  const { visitor, reports } = createCommentRule(
    "no-automated-comment-attribution",
    comments,
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-automated-comment-attribution supports custom identifiers", () => {
  const comments = [comment("Line", " @author robot", "// @author robot")];
  const { visitor, reports } = createCommentRule(
    "no-automated-comment-attribution",
    comments,
    [{ identifiers: ["robot"] }],
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.identifier, "robot");
});

function lintFilename(filename: string, options: any): any[] {
  const { visitor, reports } = createRule("require-filename-matches-dirname", [options], {
    cwd: "/repo",
    filename,
  });
  visitor.Program({ type: "Program" });
  return reports;
}

test("require-filename-matches-dirname requires a schema", () => {
  const reports = lintFilename("/repo/src/components/foo/index.ts", { minDepth: 2 });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "missingSchema");
});

test("require-filename-matches-dirname enforces the dirname schema", () => {
  const options = { schema: "dirname", minDepth: 2 };
  const unrelatedReports = lintFilename("/repo/src/components/foo/useAuth.ts", options);
  const qualifierReports = lintFilename("/repo/src/components/foo/foo.effect.ts", options);

  assert.equal(unrelatedReports[0].messageId, "mismatch");
  assert.equal(qualifierReports[0].messageId, "mismatch");
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
  assert.equal(reports[0].messageId, "mismatch");
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
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "mixedCasing");
});

test("no-mixed-filename-casing reports camelCase mixed with hyphens", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/myFile-helper.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
});

test("no-mixed-filename-casing reports mixed separators", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my-file_helper.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
});

test("no-mixed-filename-casing allows kebab-case", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my-file.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows camelCase", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/myFile.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows PascalCase", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/MyFile.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows snake_case", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/src/my_file.ts" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("no-mixed-filename-casing allows dotfile names", () => {
  const { visitor, reports } = createRule("no-mixed-filename-casing", [], { filename: "/repo/.oxlintrc.js" });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("max-expression-operators reports operator-heavy expressions", () => {
  const { visitor, reports } = createRule("max-expression-operators", [{ max: 1 }]);
  const expression = logical(logical(id("a"), id("b")), id("c"));

  visitor.ReturnStatement({ type: "ReturnStatement", argument: expression });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooMany");
  assert.equal(reports[0].data.count, 2);
});

test("max-expression-operators allows custom operators and complexity weights", () => {
  const { visitor, reports } = createRule("max-expression-operators", [
    { complexity: { "+": 3 }, max: 2, operators: ["+"] },
  ]);

  visitor.ReturnStatement({
    type: "ReturnStatement",
    argument: binary(id("a"), "+", id("b")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.count, 3);
});

test("max-expression-operators respects explicitly empty operator lists", () => {
  const { visitor, reports } = createRule("max-expression-operators", [
    { max: 0, operators: [] },
  ]);

  visitor.ReturnStatement({
    type: "ReturnStatement",
    argument: logical(id("a"), id("b")),
  });

  assert.equal(reports.length, 0);
});

test("hoist-if-operators reports boolean-heavy if conditions", () => {
  const { visitor, reports } = createRule("hoist-if-operators");

  visitor.IfStatement({
    type: "IfStatement",
    test: logical(id("ready"), id("enabled")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooMany");
});

test("hoist-if-operators allows custom condition operators", () => {
  const { visitor, reports } = createRule("hoist-if-operators", [
    { max: 0, operators: ["==="] },
  ]);

  visitor.IfStatement({
    type: "IfStatement",
    test: binary(id("status"), "===", literal("ready")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.count, 1);
});

test("no-quadratic-patterns reports search calls inside loops", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns");
  const search = methodCall(id("items"), "find");
  const body = block([expressionStatement(search)]);
  const loop = { type: "ForStatement", body };
  body.parent = loop;

  visitor.ForStatement(loop);
  visitor.CallExpression(search);
  visitor["ForStatement:exit"](loop);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "searchInLoop");
});

test("no-quadratic-patterns allows custom search methods", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns", [
    { searchMethods: ["lookup"] },
  ]);
  const search = methodCall(id("items"), "lookup");
  const body = block([expressionStatement(search)]);
  const loop = { type: "ForStatement", body };
  body.parent = loop;

  visitor.ForStatement(loop);
  visitor.CallExpression(search);
  visitor["ForStatement:exit"](loop);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "searchInLoop");
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

  visitor.ForOfStatement(loop);
  visitor.CallExpression(filter);
  visitor["ForOfStatement:exit"](loop);

  assert.equal(reports.length, 0);
});

test("no-quadratic-patterns reports nested iteration", () => {
  const { visitor, reports } = createRule("no-quadratic-patterns");
  const innerIteration = methodCall(id("children"), "map", [arrow([id("child")], id("child"))]);
  const outerIteration = methodCall(id("items"), "map", [arrow([id("item")], innerIteration)]);

  visitor.CallExpression(outerIteration);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "nestedIteration");
  assert.deepEqual(reports[0].data, { outer: "map", inner: "map" });
});

test("require-executable-shebang reports configured executable sources without shebangs", () => {
  const { visitor, reports } = createRule("require-executable-shebang");

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "missingShebang");
});

test("require-executable-shebang accepts Deno shebangs by default", () => {
  const { visitor, reports } = createRule("require-executable-shebang", [], {
    sourceCode: {
      text: "#!/usr/bin/env deno run --allow-read\nconsole.log('ok');\n",
      getText: () => "",
    },
  });

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 0);
});

test("text rules read the current sourceCode directly", () => {
  const sourceText = "#!/usr/bin/env node\nlog('ok');\n";
  const sourceCode = { getText: () => sourceText };
  const { visitor, reports } = createRule("require-executable-shebang", [], { sourceCode });
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 0);
});

test("require-executable-shebang matches configured wildcard paths", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/*/src/index.ts"] }],
    { filename: "/repo/packages/cli/src/index.ts", cwd: "/repo" },
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "missingShebang");
});

test("require-executable-shebang accepts bounded wildcard path segments", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/cli-*/src/index.ts"] }],
    { filename: "/repo/packages/cli-tool/src/index.ts", cwd: "/repo" },
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "missingShebang");
});

test("require-executable-shebang ignores wildcard path segment mismatches", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/cli-*/src/index.ts"] }],
    { filename: "/repo/packages/web/src/index.ts", cwd: "/repo" },
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 0);
});

test("require-executable-shebang matches recursive wildcard paths", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/**/src/index.ts"] }],
    { filename: "/repo/packages/tools/cli/src/index.ts", cwd: "/repo" },
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "missingShebang");
});

test("require-executable-shebang ignores wildcard patterns longer than the path", () => {
  const { visitor, reports } = createRule(
    "require-executable-shebang",
    [{ files: ["packages/*/src/index.ts"] }],
    { filename: "/repo/packages/src/index.ts", cwd: "/repo" },
  );

  visitor.Program({ type: "Program" });

  assert.equal(reports.length, 0);
});

test("no-direct-node-bin-smoke reports direct node smoke tests", () => {
  const { visitor, reports } = createRule("no-direct-node-bin-smoke");
  const execSync = call(id("execSync"), [literal("node src/index.js --help")]);

  visitor.CallExpression(execSync);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "directNodeBin");
});

test("no-direct-node-bin-smoke matches nested wildcard bin paths", () => {
  const { visitor, reports } = createRule("no-direct-node-bin-smoke");
  const execSync = call(id("execSync"), [literal("node packages/cli/dist/index.js --help")]);

  visitor.CallExpression(execSync);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "directNodeBin");
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

  visitor.ConditionalExpression(expression);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "nested");
});

test("no-complex-ternaries allows custom ternary complexity", () => {
  const { visitor, reports } = createRule("no-complex-ternaries", [
    { complexity: { "?:": 2 }, max: 1, operators: ["?:"] },
  ]);

  visitor.ConditionalExpression({
    type: "ConditionalExpression",
    test: id("ready"),
    consequent: id("enabled"),
    alternate: id("disabled"),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.count, 2);
});

test("no-computed-values reports computed object values", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ max: 1 }]);

  visitor.Property({
    type: "Property",
    value: logical(logical(id("a"), id("b")), id("c")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "computedObjectValue");
});

test("no-computed-values allows unnamed object values by default", () => {
  const { visitor, reports } = createRule("no-computed-values");
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visitor.Property({
    type: "Property",
    value: routeName,
  });

  assert.equal(reports.length, 0);
});

test("no-computed-values reports unnamed call object values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ objectValues: "named" }]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visitor.Property({
    type: "Property",
    value: routeName,
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnamedObjectValue");
  assert.equal(reports[0].node, routeName);
});

test("no-computed-values reports unnamed return values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [{ returnValues: "named" }]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);

  visitor.ReturnStatement({
    type: "ReturnStatement",
    argument: routeName,
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnamedReturnValue");
  assert.equal(reports[0].node, routeName);
});

test("no-computed-values reports returned object once in named return mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);
  const property: any = { type: "Property", value: routeName };
  const object: any = { type: "ObjectExpression", properties: [property] };
  const returnStatement: any = { type: "ReturnStatement", argument: object };
  property.parent = object;
  object.parent = returnStatement;

  visitor.Property(property);
  visitor.ReturnStatement(returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnamedReturnValue");
  assert.equal(reports[0].node, object);
});

test("no-computed-values reports nested returned objects once in named return mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"), [member(id("url"), "pathname")]);
  const innerProperty: any = { type: "Property", value: routeName };
  const innerObject: any = { type: "ObjectExpression", properties: [innerProperty] };
  const outerProperty: any = { type: "Property", value: innerObject };
  const outerObject: any = { type: "ObjectExpression", properties: [outerProperty] };
  const returnStatement: any = { type: "ReturnStatement", argument: outerObject };
  innerProperty.parent = innerObject;
  innerObject.parent = outerProperty;
  outerProperty.parent = outerObject;
  outerObject.parent = returnStatement;

  visitor.Property(innerProperty);
  visitor.Property(outerProperty);
  visitor.ReturnStatement(returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnamedReturnValue");
  assert.equal(reports[0].node, outerObject);
});

test("no-computed-values reports object values inside JSX returns in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);
  const routeName = call(id("getRouteName"));
  const property: any = { type: "Property", value: routeName };
  const object: any = { type: "ObjectExpression", properties: [property] };
  const expression: any = { type: "JSXExpressionContainer", expression: object };
  const attribute: any = { type: "JSXAttribute", value: expression };
  const openingElement: any = { type: "JSXOpeningElement", attributes: [attribute] };
  const element: any = { type: "JSXElement", openingElement };
  const returnStatement: any = { type: "ReturnStatement", argument: element };
  property.parent = object;
  object.parent = expression;
  expression.parent = attribute;
  attribute.parent = openingElement;
  openingElement.parent = element;
  element.parent = returnStatement;

  visitor.Property(property);
  visitor.ReturnStatement(returnStatement);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnamedObjectValue");
  assert.equal(reports[0].node, routeName);
});

test("no-computed-values allows named and literal values in named mode", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { objectValues: "named", returnValues: "named" },
  ]);

  visitor.Property({
    type: "Property",
    value: id("route"),
  });
  visitor.Property({
    type: "Property",
    value: literal("settings"),
  });
  visitor.Property({
    type: "Property",
    value: { type: "TemplateLiteral", expressions: [] },
  });
  visitor.ReturnStatement({
    type: "ReturnStatement",
    argument: id("route"),
  });
  visitor.ReturnStatement({
    type: "ReturnStatement",
    argument: literal("settings"),
  });

  assert.equal(reports.length, 0);
});

test("no-computed-values allows custom computed operator complexity", () => {
  const { visitor, reports } = createRule("no-computed-values", [
    { complexity: { "+": 2 }, max: 1, operators: ["+"] },
  ]);

  visitor.Property({
    type: "Property",
    value: binary(id("subtotal"), "+", id("tax")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.count, 2);
});

test("no-hidden-side-effects reports nested assignments", () => {
  const { visitor, reports } = createRule("no-hidden-side-effects");
  const assignment = {
    type: "AssignmentExpression",
    parent: { type: "ReturnStatement" },
  };

  visitor.AssignmentExpression(assignment);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "hiddenSideEffect");
});

test("no-hidden-side-effects allows custom mutating methods", () => {
  const { visitor, reports } = createRule("no-hidden-side-effects", [
    { mutatingMethods: ["commit"] },
  ]);
  const commitCall = methodCall(id("store"), "commit");
  commitCall.parent = { type: "ReturnStatement", argument: commitCall };

  visitor.CallExpression(commitCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "hiddenSideEffect");
});

test("no-standalone-array-mutations reports standalone mutating calls", () => {
  const { visitor, reports } = createRule("no-standalone-array-mutations");
  const pushCall = methodCall(id("items"), "push");
  pushCall.parent = {
    type: "ExpressionStatement",
    expression: pushCall,
  };

  visitor.CallExpression(pushCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "standaloneArrayMutation");
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

  visitor.CallExpression(appendCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "standaloneArrayMutation");
});

test("prefer-concat-object-assign reports each spread literal once", () => {
  const { visitor, reports } = createRule("prefer-concat-object-assign");
  const spreadElements = [{ type: "SpreadElement" }, { type: "SpreadElement" }];
  const spreadProperties = [{ type: "SpreadElement" }, { type: "SpreadElement" }];
  const arrayExpression = { type: "ArrayExpression", elements: spreadElements };
  const objectExpression = { type: "ObjectExpression", properties: spreadProperties };

  visitor.ArrayExpression(arrayExpression);
  visitor.ObjectExpression(objectExpression);

  assert.equal(reports.length, 2);
  assert.equal(reports[0].messageId, "arraySpread");
  assert.equal(reports[0].node, arrayExpression);
  assert.equal(reports[1].messageId, "objectSpread");
  assert.equal(reports[1].node, objectExpression);
});

test("prefer-concat-object-assign allows literals without spread", () => {
  const { visitor, reports } = createRule("prefer-concat-object-assign");
  const elements = [{ type: "Literal", value: "item" }];
  const properties = [{ type: "Property" }];

  visitor.ArrayExpression({ type: "ArrayExpression", elements });
  visitor.ObjectExpression({ type: "ObjectExpression", properties });

  assert.equal(reports.length, 0);
});

test("prefer-early-return reports else branches after an exiting consequent", () => {
  const { visitor, reports } = createRule("prefer-early-return");
  const alternate = { type: "BlockStatement", body: [] };

  visitor.IfStatement({
    type: "IfStatement",
    test: id("failed"),
    consequent: {
      type: "BlockStatement",
      body: [{ type: "ReturnStatement" }],
    },
    alternate,
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].node, alternate);
});

test("max-control-flow-depth reports branches beyond the configured depth", () => {
  const { visitor, reports } = createRule("max-control-flow-depth", [{ max: 2 }]);
  const outer = { type: "IfStatement" };
  const middle = { type: "IfStatement", parent: outer };
  const inner = { type: "IfStatement", parent: middle };

  visitor.IfStatement(outer);
  visitor.IfStatement(middle);
  visitor.IfStatement(inner);
  visitor["IfStatement:exit"](inner);
  visitor["IfStatement:exit"](middle);
  visitor["IfStatement:exit"](outer);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooDeep");
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

  visitor.IfStatement(outer);
  visitor.FunctionDeclaration(fn);
  visitor.IfStatement(first);
  visitor.IfStatement(second);
  visitor.IfStatement(third);
  visitor["IfStatement:exit"](third);
  visitor["IfStatement:exit"](second);
  visitor["IfStatement:exit"](first);
  visitor["FunctionDeclaration:exit"](fn);
  visitor["IfStatement:exit"](outer);

  assert.equal(reports.length, 0);
});

test("max-array-chain-depth reports long array callback chains once", () => {
  const { visitor, reports } = createRule("max-array-chain-depth", [{ max: 2 }]);
  const filterCall = methodCall(id("items"), "filter");
  const mapCall = methodCall(filterCall, "map");
  const someCall = methodCall(mapCall, "some");

  visitor.CallExpression(filterCall);
  visitor.CallExpression(mapCall);
  visitor.CallExpression(someCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].node, someCall);
  assert.equal(reports[0].data.chain, "filter.map.some");
});

test("max-array-chain-depth allows custom iteration methods", () => {
  const { visitor, reports } = createRule("max-array-chain-depth", [
    { iterationMethods: ["collect", "select"], max: 1 },
  ]);
  const collectCall = methodCall(id("items"), "collect");
  const selectCall = methodCall(collectCall, "select");

  visitor.CallExpression(collectCall);
  visitor.CallExpression(selectCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.chain, "collect.select");
});

test("no-repeated-collection-search reports repeated scoped scans", () => {
  const { visitor, reports } = createRule("no-repeated-collection-search");

  visitor.Program({ type: "Program" });
  visitor.CallExpression(methodCall(id("users"), "find"));
  visitor.CallExpression(methodCall(id("users"), "find"));
  visitor["Program:exit"]({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "repeatedSearch");
});

test("no-repeated-collection-search allows custom search methods", () => {
  const { visitor, reports } = createRule("no-repeated-collection-search", [
    { searchMethods: ["lookup"] },
  ]);

  visitor.Program({ type: "Program" });
  visitor.CallExpression(methodCall(id("users"), "lookup"));
  visitor.CallExpression(methodCall(id("users"), "lookup"));
  visitor["Program:exit"]({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.method, "lookup");
});

test("no-redundant-boolean-logic reports boolean comparisons and ternaries", () => {
  const { visitor, reports } = createRule("no-redundant-boolean-logic");

  visitor.BinaryExpression(binary(id("isReady"), "===", literal(true)));
  visitor.ConditionalExpression({
    type: "ConditionalExpression",
    test: id("isReady"),
    consequent: literal(true),
    alternate: literal(false),
  });

  assert.equal(reports.length, 2);
  assert.equal(reports[0].messageId, "booleanComparison");
  assert.equal(reports[1].messageId, "booleanTernary");
});

test("no-redundant-boolean-logic allows custom equality operators", () => {
  const { visitor, reports } = createRule("no-redundant-boolean-logic", [
    { equalityOperators: ["~~"] },
  ]);

  visitor.BinaryExpression(binary(id("isReady"), "~~", literal(true)));

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "booleanComparison");
});

test("no-trivial-wrapper-functions reports parameter-forwarding wrappers", () => {
  const { visitor, reports } = createRule("no-trivial-wrapper-functions");
  const wrapper = arrow([id("userId")], call(id("fetchUser"), [id("userId")]));
  wrapper.parent = {
    type: "VariableDeclarator",
    id: id("getUser"),
  };

  visitor.ArrowFunctionExpression(wrapper);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "trivialWrapper");
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

  visitor.ArrowFunctionExpression(asyncWrapper);
  visitor.FunctionDeclaration(generatorWrapper);

  assert.equal(reports.length, 0);
});

test("prefer-positive-condition-names reports negative boolean names", () => {
  const { visitor, reports } = createRule("prefer-positive-condition-names");

  visitor.VariableDeclarator({
    type: "VariableDeclarator",
    id: id("isNotReady"),
    init: literal(false),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "negativeName");
});

test("prefer-positive-condition-names allows custom boolean operators", () => {
  const { visitor, reports } = createRule("prefer-positive-condition-names", [
    { booleanOperators: ["matches"] },
  ]);

  visitor.VariableDeclarator({
    type: "VariableDeclarator",
    id: id("isNotReady"),
    init: binary(id("status"), "matches", literal("ready")),
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "negativeName");
});

test("no-single-use-renaming-alias reports aliases used once", () => {
  const { visitor, reports } = createRule("no-single-use-renaming-alias");
  const alias = {
    type: "VariableDeclarator",
    id: id("userData"),
    init: id("user"),
  };

  visitor.Program({ type: "Program" });
  visitor.VariableDeclarator(alias);
  visitor.Identifier({
    type: "Identifier",
    name: "userData",
    parent: { type: "ReturnStatement" },
  });
  visitor["Program:exit"]({ type: "Program" });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "singleUseAlias");
});

test("prefer-guard-clauses reports whole-function wrapped branches", () => {
  const { visitor, reports } = createRule("prefer-guard-clauses");

  visitor.FunctionDeclaration({
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
  assert.equal(reports[0].messageId, "preferGuard");
});

test("no-unnecessary-block-callback reports callbacks that only return", () => {
  const { visitor, reports } = createRule("no-unnecessary-block-callback");
  const callback = arrow([id("item")], {
    type: "BlockStatement",
    body: [{ type: "ReturnStatement", argument: id("item") }],
  });
  call(id("map"), [callback]);

  visitor.ArrowFunctionExpression(callback);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "unnecessaryBlock");
});

test("no-unnecessary-async catches no-op async and direct return await", () => {
  const { visitor, reports } = createRule("no-unnecessary-async");
  const noAwait = arrow([], block());
  noAwait.async = true;
  const returnedAwait: any = { type: "AwaitExpression", argument: call(id("load")) };
  const directReturn: any = { type: "ReturnStatement", argument: returnedAwait };
  returnedAwait.parent = directReturn;
  const returnAwait = arrow([], block([directReturn]));
  returnAwait.async = true;

  visitor.ArrowFunctionExpression(noAwait);
  visitor.ArrowFunctionExpression(returnAwait);

  assert.deepEqual(
    reports.map((report) => report.messageId),
    ["unnecessaryAsync", "unnecessaryReturnAwait"],
  );
});

test("no-unnecessary-async keeps async functions with meaningful awaited work", () => {
  const { visitor, reports } = createRule("no-unnecessary-async");
  const awaited: any = { type: "AwaitExpression", argument: call(id("load")) };
  const statement = expressionStatement(awaited);
  const node = arrow([], block([statement, { type: "ReturnStatement", argument: id("value") }]));
  node.async = true;

  visitor.ArrowFunctionExpression(node);

  assert.equal(reports.length, 0);
});

test("no-small-collection-conversion reports small Map and Set inputs", () => {
  const { visitor, reports } = createRule("no-small-collection-conversion");
  const setNode = newExpression("Set", [arrayExpression([literal("a"), literal("b")])]);
  const mapEntry = arrayExpression([literal("a"), literal(1)]);
  const mapNode = newExpression("Map", [arrayExpression([mapEntry])]);
  methodCall(setNode, "has", [id("value")]);
  methodCall(mapNode, "get", [id("key")]);

  visitor.NewExpression(setNode);
  visitor.NewExpression(mapNode);

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
  const references = [{ identifier: setNode.callee }];
  const variable = { defs: [], references };
  const scopeManager = { scopes: [{ set: new Map([["Set", variable]]) }] };
  const sourceCode = { text: "", scopeManager };
  const { visitor, reports } = createRule("no-small-collection-conversion", [], { sourceCode });
  methodCall(setNode, "has", [id("value")]);
  visitor.NewExpression(setNode);
  assert.equal(reports.length, 1);
});

test("no-small-collection-conversion ignores useful or unknown collection sizes", () => {
  const { visitor, reports } = createRule("no-small-collection-conversion");
  const values = arrayExpression([literal("a"), literal("b"), literal("c")]);
  const largeSet = newExpression("Set", [values]);
  const dynamicMap = newExpression("Map", [id("entries")]);
  methodCall(largeSet, "has", [id("value")]);
  methodCall(dynamicMap, "get", [id("key")]);

  visitor.NewExpression(largeSet);
  visitor.NewExpression(dynamicMap);
  visitor.NewExpression(newExpression("Set", [arrayExpression([literal("a")])]));
  visitor.NewExpression(newExpression("Set"));

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

test("prefer-flat-map reports map followed by flat", () => {
  const { visitor, reports } = createRule("prefer-flat-map");
  const mapCall = methodCall(id("items"), "map", [arrow([id("item")], id("item"))]);
  const flatCall = methodCall(mapCall, "flat");

  visitor.CallExpression(flatCall);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "preferFlatMap");
});

test("no-identity-array-callback reports identity map and always-true filter", () => {
  const { visitor, reports } = createRule("no-identity-array-callback");

  visitor.CallExpression(methodCall(id("items"), "map", [arrow([id("item")], id("item"))]));
  visitor.CallExpression(methodCall(id("items"), "filter", [arrow([], literal(true))]));

  assert.equal(reports.length, 2);
  assert.equal(reports[0].messageId, "identityMap");
  assert.equal(reports[1].messageId, "alwaysTrueFilter");
});

test("no-redundant-nullish-fallback reports undefined fallbacks", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const voidZero = unary("void", literal(0));
  const voidUndefined = unary("void", id("undefined"));
  const voidBinary = unary("void", binary(literal(1), "+", literal(2)));
  const voidBigIntBinary = unary("void", binary(bigintLiteral(1n), "+", bigintLiteral(2n)));
  const voidRegex = unary("void", literal(/value/));

  visitor.LogicalExpression(logical(id("value"), id("undefined"), "??"));
  visitor.LogicalExpression(logical(id("value"), voidZero, "??"));
  visitor.LogicalExpression(logical(id("value"), voidUndefined, "??"));
  visitor.LogicalExpression(logical(id("value"), voidBinary, "??"));
  visitor.LogicalExpression(logical(id("value"), voidBigIntBinary, "??"));
  visitor.LogicalExpression(logical(id("value"), voidRegex, "??"));

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
    visitor.LogicalExpression(logical(id("value"), unary("void", argument), "??"));
  });

  assert.equal(reports.length, staticArguments.length);
});

test("no-redundant-nullish-fallback allows effectful void fallbacks", () => {
  const { visitor, reports } = createRule("no-redundant-nullish-fallback");
  const logMissCall = call(id("logMiss"));
  const effectfulVoid = unary("void", logMissCall);
  const effectfulBinaryVoid = unary("void", binary(logMissCall, "+", literal(1)));

  visitor.LogicalExpression(logical(id("value"), effectfulVoid, "??"));
  visitor.LogicalExpression(logical(id("value"), effectfulBinaryVoid, "??"));

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
    visitor.LogicalExpression(logical(id("value"), unary("void", argument), "??"));
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
    visitor.LogicalExpression(logical(id("value"), unary("void", argument), "??"));
  });

  assert.equal(reports.length, 0);
});

test("no-redundant-nullish-fallback evaluates BigInt through Oxlint", () => {
  const code = [
    "input ?? void (1n + 2n);",
    "input ?? void (1n + 1);",
    "input ?? void (1n / 0n);",
    "input ?? void (1n ** -1n);",
  ].join("\n");
  runNative("no-redundant-nullish-fallback", {
    valid: ["input ?? void (2n ** 1000000n);"],
    invalid: [{ code, errors: [{ messageId: "redundantUndefined", line: 1 }] }],
  });
});

test("prefer-object-lookup reports long equality OR chains", () => {
  const { visitor, reports } = createRule("prefer-object-lookup");
  const first = binary(id("type"), "===", literal("a"));
  const second = binary(id("type"), "===", literal("b"));
  const third = binary(id("type"), "===", literal("c"));
  const chain = logical(logical(first, second, "||"), third, "||");

  visitor.LogicalExpression(chain);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "preferLookup");
});

test("prefer-object-lookup allows custom equality operators", () => {
  const { visitor, reports } = createRule("prefer-object-lookup", [
    { min: 2, operators: ["is"] },
  ]);
  const first = binary(id("type"), "is", literal("a"));
  const second = binary(id("type"), "is", literal("b"));
  const chain = logical(first, second, "||");

  visitor.LogicalExpression(chain);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "preferLookup");
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
  const rule = plugin.rules[name];
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
    name: "no-redundant-boolean-logic", code: "const value = ready === true;",
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
  visitor.ReturnStatement(node);
  visitor.ReturnStatement(node);
  assert.equal(reports.length, 1);
  runHook(visitor, "after");
  runHook(visitor, "before");
  visitor.ReturnStatement(node);
  assert.equal(reports.length, 2);
});

test("filename and source readers follow the current file on reused visitors", () => {
  const { context, visitor, reports } = createRule("require-executable-shebang");
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
  context.sourceCode = { text: "#!/usr/bin/env node\n" };
  runHook(visitor, "before");
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
  context.filename = "/repo/src/helpers.ts";
  context.sourceCode = { text: "export const value = true;" };
  runHook(visitor, "before");
  visitor.Program({ type: "Program" });
  assert.equal(reports.length, 1);
});

(["before", "after"] as const).forEach((hook) => {
  test(`max-control-flow-depth clears unfinished traversal state in ${hook}`, () => {
    const { visitor, reports } = createRule("max-control-flow-depth", [{ max: 1 }]);
    visitor.IfStatement({ type: "IfStatement" });
    visitor.FunctionDeclaration({ type: "FunctionDeclaration" });
    visitor.IfStatement({ type: "IfStatement" });
    runHook(visitor, hook);
    visitor.IfStatement({ type: "IfStatement" });
    assert.equal(reports.length, 0);
  });

  test(`no-quadratic-patterns clears unfinished loop state in ${hook}`, () => {
    const { visitor, reports } = createRule("no-quadratic-patterns");
    const search = methodCall(id("users"), "find");
    const body = block([expressionStatement(search)]);
    const loop = { type: "ForStatement", body };
    body.parent = loop;
    visitor.ForStatement(loop);
    visitor.CallExpression(search);
    assert.equal(reports.length, 1);
    runHook(visitor, hook);
    visitor.CallExpression(search);
    assert.equal(reports.length, 1);
  });

  test(`no-repeated-collection-search clears unfinished scopes in ${hook}`, () => {
    const { visitor, reports } = createRule("no-repeated-collection-search");
    visitor.Program({ type: "Program" });
    visitor.CallExpression(methodCall(id("users"), "find"));
    runHook(visitor, hook);
    visitor.CallExpression(methodCall(id("users"), "find"));
    assert.equal(reports.length, 0);
  });

  test(`no-single-use-renaming-alias clears unfinished scopes in ${hook}`, () => {
    const { visitor, reports } = createRule("no-single-use-renaming-alias");
    visitor.Program({ type: "Program" });
    visitor.VariableDeclarator({ type: "VariableDeclarator", id: id("alias"), init: id("value") });
    visitor.Identifier({ type: "Identifier", name: "alias", parent: { type: "ReturnStatement" } });
    runHook(visitor, hook);
    visitor["Program:exit"]({ type: "Program" });
    assert.equal(reports.length, 0);
  });
});
