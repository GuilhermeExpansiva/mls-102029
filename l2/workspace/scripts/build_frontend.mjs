#!/usr/bin/env node

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = resolve(ROOT_DIR, 'config.json');

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

async function collectFrontendEntrypoints() {
  const results = new Set([resolve(ROOT_DIR, '_102033_', 'l2', 'shared', 'bootstrap.ts')]);
  const config = loadConfig();
  for (const [projectId, projectConfig] of Object.entries(config.projects ?? {})) {
    const modules = projectConfig.modules ?? [];
    for (const moduleConfig of modules) {
      const builtModulePath = resolve(ROOT_DIR, 'dist', 'local', `_${projectId}_`, 'l2', moduleConfig.moduleId, 'module.js');
      if (!existsSync(builtModulePath)) {
        continue;
      }

      const mod = await import(pathToFileURL(builtModulePath).href);
      const frontendDefinition = mod.moduleFrontendDefinition;
      if (!frontendDefinition?.routes?.length) {
        continue;
      }

      for (const route of frontendDefinition.routes) {
        const resolved = resolveSourcePath(route.entrypoint, ROOT_DIR);
        if (resolved) {
          results.add(resolved);
        }
      }

      for (const renderer of [frontendDefinition.headerRenderer, frontendDefinition.asideRenderer]) {
        const resolved = renderer?.entrypoint ? resolveSourcePath(renderer.entrypoint, ROOT_DIR) : undefined;
        if (resolved) {
          results.add(resolved);
        }
      }
    }
  }

  return [...results].sort();
}

function resolveSourcePath(specifier, resolveDir) {
  const sourceBase = specifier.startsWith('/')
    ? resolve(ROOT_DIR, specifier.slice(1))
    : resolve(resolveDir, specifier);

  const candidates = [sourceBase];
  if (extname(sourceBase) === '.js') {
    candidates.push(sourceBase.slice(0, -3) + '.ts');
    candidates.push(sourceBase.slice(0, -3) + '.tsx');
  }
  if (!extname(sourceBase)) {
    candidates.push(`${sourceBase}.ts`);
    candidates.push(`${sourceBase}.tsx`);
    candidates.push(join(sourceBase, 'index.ts'));
    candidates.push(join(sourceBase, 'index.tsx'));
  }

  return candidates.find((candidate) => existsSync(candidate));
}

function createWorkspaceResolverPlugin() {
  return {
    name: 'workspace-resolver',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^\/_\d+_\/(?:core|l1|l2)\// }, (args) => {
        const resolved = resolveSourcePath(args.path, args.resolveDir);
        return resolved ? { path: resolved } : null;
      });

      buildApi.onResolve({ filter: /^\.\.?\// }, (args) => {
        const resolved = resolveSourcePath(args.path, args.resolveDir);
        return resolved ? { path: resolved } : null;
      });
    },
  };
}

function parseArgs(argv) {
  const args = { target: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target') {
      args.target = argv[index + 1] ?? '';
      index += 1;
    }
  }
  if (!args.target) {
    throw new Error('Missing required argument --target <name>.');
  }
  return args;
}

async function main() {
  const { target } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const publicationTarget = config.publication?.targets?.[target];
  if (!publicationTarget) {
    throw new Error(`Unknown publication target "${target}".`);
  }

  const entryPoints = await collectFrontendEntrypoints();
  const outdir = resolve(ROOT_DIR, 'dist', target);

  await build({
    absWorkingDir: ROOT_DIR,
    entryPoints,
    outdir,
    outbase: ROOT_DIR,
    platform: 'browser',
    format: 'esm',
    bundle: true,
    splitting: true,
    sourcemap: publicationTarget.sourcemap === true,
    minify: publicationTarget.minify === true,
    target: ['es2022'],
    chunkNames: '_chunks/[name]-[hash]',
    plugins: [createWorkspaceResolverPlugin()],
    logLevel: 'info',
  });

  const relativeOutDir = relative(ROOT_DIR, outdir) || 'dist';
  console.log(`[build_frontend] target=${target} entrypoints=${entryPoints.length} outdir=${relativeOutDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
