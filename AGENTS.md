# Agent Rules

This package provides Oxlint JS plugin rules for readable, performance-conscious code. Follow established Oxlint and Node.js APIs. Custom code needs evidence and source links.

# Before Building

Use $grill-me for architecture and scope check-ins. Ask one focused question at a time, with at most two per check-in unless I ask for more.

1. **Does this need to be built?** Name the problem and who has it. If the need is unclear, ask before proposing code.
2. **Can we enable it without building anything?** Check existing features, configuration, tools, and workflows first. Use what already solves the problem.
3. **No snowflakes.** Prefer existing standards, libraries, protocols, and project patterns. Do not invent architecture where these already work.
4. **Build toward zero AI required.** Aim for a product people can run, understand, and maintain without AI. Turn recurring AI work into ordinary code, tests, or documented procedures where possible.
5. **Make it last five years.** Choose maintained dependencies and straightforward code. Keep the product easy to operate, update, and repair.
6. **Speed comes last.** It must never override points 1–5. First make sure the human understands and agrees on the architecture; only then plan the smallest useful MVP. A few extra hours spent planning or helping the human understand are time well spent. Do not move ahead of their understanding. Build and scale the MVP like a shuttle: keep the craft that must last, and discard the boosters—the temporary code built only for fast delivery—when their job is done.

## Communication

- Teach before acting. Explain the decision in plain language, cite the evidence, and say what you do not know.
- Keep updates short. Show what changed, what was checked, and what still needs my attention.
- If I push back or cannot keep up, pause the disputed work. Clarify with at most two focused questions unless I ask for more.

## Core Defaults

- Read the relevant code, issues, pull requests, and history before proposing changes. Check what already exists before adding files or tools.
- Make small changes I can review. Preserve unrelated work and project customizations.
- Keep shared rules, configuration, and skills global. Change project setup only when I explicitly request it.
- Keep coding details in the existing rules and project documentation. Use the project's checks and report failures plainly.

## Stop Conditions

- Before writing files, show the intended change and wait for my answer. Reading files and running checks are fine.
- If the scope or architecture needs to change, explain the decision and wait. Do not treat silence as agreement.
- Do not write tests until you can demonstrate how the architecture works to me with a concrete example I can follow.
- Plan mode is read-only. Never enable or suggest automatic approval.
- I stage, commit, push, and perform all GitHub writes. Agents prepare local changes and run checks. Greploop grants no exception. Leave destructive Git operations to me.
- Stay in this workspace. Ask before cloning, copying, or modifying another repository. Keep temporary work inside the workspace.
- Never expose secrets, publish private work, or bypass a blocked action.

---

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
s
## Core Defaults

- Use pnpm for dependency management and `pnpm-lock.yaml` as the lockfile. Use Nub for package scripts and Node execution.
- Use the latest stable TypeScript release for type checking and declaration emission.
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
