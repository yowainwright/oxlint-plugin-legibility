# Agent Rules

This package provides Oxlint JS plugin rules for readable, performance-conscious code. Follow established Oxlint and Node.js APIs. Custom code needs evidence and source links.

- Check existing files, code, issues, pull requests, and git history before creating or editing artifacts.
- Do not stage or commit unless explicitly asked. External publishing also requires an active matching Greploop permission window.
- Keep architecture notes in `tmp/*.md` aligned before commit-ready work.
- Keep checkouts, verification copies, and build work inside this workspace. Ask before modifying another repository.
- No snowflakes. Reuse the project's tools and patterns; do not introduce new architecture.

## Communication Style

- Teach before acting: give a small amount of context with cited evidence.
- Be terse. No preamble, request-parroting, sign-offs, or obvious next steps.
- State uncertainty plainly. Do not fake confidence.
- Before editing, name the exact source, file, tool, API, or pattern being used.
- If the default path is unclear, ask one precise question instead of listing options.
- If the user pushes back, use `grill-me`: at most two focused questions, one at a time, with a recommended answer.

## Core Defaults

- Use pnpm for dependency management and `pnpm-lock.yaml` as the lockfile. Use Nub for package scripts and Node execution.
- Use the latest stable TypeScript 7 release for type checking and declaration emission.
- Follow [Microsoft's compatibility aliases](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0): `@typescript/native` provides TypeScript 7's `tsc`; `typescript` provides the TypeScript 6 API required by `type-coverage`. Recheck this compatibility dependency when that tool supports TypeScript 7.
- Use [Rolldown](https://rolldown.rs/in-depth/module-types) for JavaScript compilation, including ESM, CommonJS, and CLI artifacts. TypeScript must not emit JavaScript.
- Use Node.js `node:test`, `node:assert/strict`, and [`node --test`](https://nodejs.org/api/test.html) for tests. Do not add Bun or Deno test runners.
- Follow the existing Oxlint `createOnce` rules and `oxlint/plugins-dev` RuleTester patterns.
- Keep functions single-purpose and under 20 lines. Prefer immutable values, early returns, and named conditions over nesting.
- Keep generated `bin/`, `dist/`, and `.build/` artifacts out of source edits. Update their sources in `scripts/` and `src/`.
- Read `package.json` for build and validation commands. Run relevant checks and one focused cleanup pass after non-trivial edits.

## Stop Conditions

- Before editing, name the exact default tool, API, or pattern being used.
- If you cannot name it, do not edit.
- Ask: "I'm at `<file>`, implementing `<specific behavior>`. Which `<specific default API or pattern>` should I use?"
- Ask one buffer question only after the default path is exhausted.
- Do not invent wrappers, bespoke infrastructure, or new architecture.
