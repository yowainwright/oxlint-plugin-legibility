import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import mergeTsconfigs from "merge-tsconfigs";
import { rolldown } from "rolldown";

import {
  agentBinRoot,
  binRoot,
  cjsEntryPath,
  cjsRoot,
  compiledAgentRoot,
  distRoot,
  lintChangedDestination,
  lintChangedSource,
  pluginCjsOutput,
  pluginConfig,
  pluginEntryPath,
  pluginEsmOutput,
  pluginTsconfigPath,
  repoConstantsDestination,
  repoConstantsSource,
  strictArgs,
  tscPath,
} from "./constants.ts";
import { isDirectRun, preserveExitCode, runRelease, runRepoDirect } from "./utils.ts";
import {
  writeOxlintFixtureConfigs,
} from "../../tests/fixtures/oxlint/configs.ts";

export function buildBin(): void {
  rmSync(binRoot, { force: true, recursive: true });
  mkdirSync(agentBinRoot, { recursive: true });
  copyFileSync(lintChangedSource, lintChangedDestination);
  copyFileSync(repoConstantsSource, repoConstantsDestination);
  const agentScriptPaths = copyAgentScripts();
  const installPath = copyAgentInstallAlias();
  const executablePaths = [lintChangedDestination, installPath].concat(agentScriptPaths);

  executablePaths.forEach(makeExecutable);
}

export function buildConfig(): void {
  mergeTsconfigs(pluginConfig);
}

function runCommand(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status === 0) return true;

  process.exitCode = result.status ?? 1;
  return false;
}

function runTsc(args: string[]): boolean {
  return runCommand(tscPath, args);
}

export async function buildPlugin(): Promise<void> {
  cleanDist();
  buildConfig();
  const declarationsEmitted = runTsc(["-p", pluginTsconfigPath]);
  if (!declarationsEmitted) return;

  await bundlePlugin();
  writeCjsArtifacts();
}

async function bundlePlugin(): Promise<void> {
  const bundle = await rolldown({ input: pluginEntryPath, platform: "node", external: ["oxlint"] });
  try {
    await bundle.write(pluginEsmOutput);
    await bundle.write(pluginCjsOutput);
  } finally {
    await bundle.close();
  }
}

export async function buildRuntime(): Promise<void> {
  rmSync(".build/scripts", { force: true, recursive: true });
  const input = ["scripts/agent/index.ts", "scripts/repo/utils.ts"];
  const bundle = await rolldown({ input, platform: "node" });
  try {
    await bundle.write({
      dir: ".build/scripts",
      format: "esm",
      preserveModules: true,
      preserveModulesRoot: "scripts",
    });
  } finally {
    await bundle.close();
  }
}

function cleanDist(): void {
  rmSync(distRoot, { force: true, recursive: true });
}

function writeCjsArtifacts(): void {
  const cjsEntry = '"use strict";\nmodule.exports = require("./cjs/index.cjs").default;\n';

  mkdirSync(cjsRoot, { recursive: true });
  writeFileSync(cjsEntryPath, cjsEntry);
}

export function typecheckStrict(): void {
  buildConfig();
  runTsc(["-p", pluginTsconfigPath].concat(strictArgs));
}

export function buildOxlintFixtureConfigs(root?: string): void {
  writeOxlintFixtureConfigs(root);
}

export function build(target: string | undefined): void | Promise<void> {
  const isBinTarget = target === undefined || target === "bin";
  if (isBinTarget) return buildBin();
  if (target === "config") return buildConfig();
  if (target === "oxlint-fixtures") return buildOxlintFixtureConfigs();
  if (target === "plugin") return buildPlugin();
  if (target === "runtime") return buildRuntime();
  if (target === "strict") return typecheckStrict();
  throw new Error(`Unknown build target: ${target ?? "(missing)"}`);
}

function copyAgentScripts(): string[] {
  const files = readdirSync(compiledAgentRoot);
  const javaScriptFiles = files.filter(isJavaScriptFile);
  return javaScriptFiles.map(copyAgentScript);
}

function isJavaScriptFile(file: string): boolean {
  return file.endsWith(".js");
}

function copyAgentScript(file: string): string {
  const source = join(compiledAgentRoot, file);
  const destination = join(agentBinRoot, file);
  copyFileSync(source, destination);
  return destination;
}

function copyAgentInstallAlias(): string {
  const source = join(agentBinRoot, "index.js");
  const destination = join(agentBinRoot, "install.js");
  copyFileSync(source, destination);
  return destination;
}

function makeExecutable(path: string): void {
  chmodSync(path, 0o755);
}

async function runRepoCli(args: readonly string[]): Promise<number> {
  const command = args[0];
  const buildCommands = ["plugin", "runtime", "bin", "config", "oxlint-fixtures", "strict"];
  const isBuildCommand = buildCommands.includes(command ?? "");
  if (isBuildCommand) {
    await build(command);
    return 0;
  }

  if (command === "release") return runRelease({ args: args.slice(1) });
  return runRepoDirect(args);
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  try {
    process.exitCode = preserveExitCode(await runRepoCli(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
