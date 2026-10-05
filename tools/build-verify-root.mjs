#!/usr/bin/env node
// Build a throw-away **unpatched** DSH `resources/app` tree from the baselines, so the
// patch can be verified end to end without touching the installed app. Everything is
// junctioned to the real install except the three patched packages, which are copied
// from `.cache/pristine` (npm tarball) / `baseline/` (the app-variant browser bundle).
//
//   node tools/build-verify-root.mjs [--out <dir>] [--root <app>] [--pristine <dir>]
//
//   node apply.mjs --root <out> --check     # every file 'pristine', exit 1
//   DSH_APP_ROOT=<out> node checks/<x>.mjs  # fails: the checks must catch the absence
//   node apply.mjs --root <out>             # applies 7 files
//   DSH_APP_ROOT=<out> node checks/<x>.mjs  # passes
//   node apply.mjs --root <out> --revert    # back to pristine; --check exits 1 again
import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const ROOT = resolve(opt('root', process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app'));
const PRISTINE = resolve(opt('pristine', join(HERE, '.cache', 'pristine')));
const OUT = resolve(opt('out', join(HERE, '.cache', 'verify')));
const SCOPED = join(ROOT, 'node_modules', '@deepseek-ai');

const manifest = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'));
const patchedPackages = [...new Set(manifest.files.map((f) => f.package))];

if (OUT.startsWith(ROOT)) throw new Error(`refusing to build the verify root inside the app: ${OUT}`);
if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'node_modules'), { recursive: true });
await copyFile(join(ROOT, 'package.json'), join(OUT, 'package.json'));

/** Junction directories (fast, no admin), copy the rare plain files. */
async function link(entries, from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) await symlink(source, target, 'junction');
    else await copyFile(source, target);
  }
}

const scopedEntries = await readdir(SCOPED, { withFileTypes: true });
await mkdir(join(OUT, 'node_modules', '@deepseek-ai'), { recursive: true });
for (const entry of scopedEntries) {
  const source = join(SCOPED, entry.name);
  const target = join(OUT, 'node_modules', '@deepseek-ai', entry.name);
  if (patchedPackages.includes(entry.name)) continue;
  if (entry.isDirectory()) await symlink(source, target, 'junction');
  else await copyFile(source, target);
}
for (const entry of await readdir(join(ROOT, 'node_modules'), { withFileTypes: true })) {
  if (entry.name === '@deepseek-ai') continue;
  const source = join(ROOT, 'node_modules', entry.name);
  const target = join(OUT, 'node_modules', entry.name);
  if (entry.isDirectory()) await symlink(source, target, 'junction');
  else await copyFile(source, target);
}

for (const pkg of patchedPackages) {
  await cp(join(PRISTINE, pkg, 'package'), join(OUT, 'node_modules', '@deepseek-ai', pkg), { recursive: true });
  for (const file of manifest.files.filter((f) => f.package === pkg)) {
    const derived = join(HERE, 'baseline', pkg, file.path);
    if (existsSync(derived)) {
      await mkdir(dirname(join(OUT, 'node_modules', '@deepseek-ai', pkg, file.path)), { recursive: true });
      await copyFile(derived, join(OUT, 'node_modules', '@deepseek-ai', pkg, file.path));
      console.log(`derived  ${pkg}/${file.path.split('\\').join('/')}  (app-variant baseline)`);
    }
  }
  console.log(`baseline ${pkg}  <- .cache/pristine`);
}

console.log(`\nverify root ${OUT}`);
console.log(`  node apply.mjs --root "${OUT}" --check`);
console.log(`  $env:DSH_APP_ROOT = "${OUT}"; node checks/<name>.mjs`);
