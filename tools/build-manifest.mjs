#!/usr/bin/env node
// Regenerate the patch set: compare a **baseline** tree against the live DSH app
// tree, then (with --write) emit `manifest.json`, `patched/`, `patches/` and the
// non-npm baselines under `baseline/`. It never writes to the app tree.
//
//   node tools/build-manifest.mjs           # report only
//   node tools/build-manifest.mjs --write   # rewrite manifest.json / patched / patches / baseline
//
// The baseline comes from the public npm tarballs:
//   https://registry.npmjs.org/@deepseek-ai/<pkg>/-/<pkg>-<version>.tgz
// extracted to `.cache/pristine/<pkg>/package/**`.
//
// One exception: the desktop app ships its own build of the browser bundle, so the
// generated CSS scaffolding (the `//#region \0dsh-css:` builder-path comment and the
// `const css = "..."` line, whose CSS-module class prefix is a build hash) differs
// from the published CI build. Those lines are generated, never patched here, so the
// baseline takes them from the shipped file and the result is stored under
// `baseline/` for machines that cannot fetch npm.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const WRITE = argv.includes('--write');
const ROOT = resolve(opt('root', process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app'));
const PRISTINE = resolve(opt('pristine', join(HERE, '.cache', 'pristine')));
const APP_PKGS = join(ROOT, 'node_modules', '@deepseek-ai');
const STAGE = join(HERE, '.cache', 'patchgen');

const sha256 = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');
const hashOf = (text) => createHash('sha256').update(text).digest('hex');
const slash = (p) => p.split(sep).join('/');
const walk = async (dir, base = dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (!entry.name.endsWith('.dsh-retire.bak')) out.push(slash(relative(base, full)));
  }
  return out.sort();
};

/** Generated CSS scaffolding that a different build legitimately rewrites. */
const GENERATED_PATTERNS = [
  /\/\/#region \\0dsh-css:[^\n]*/,
  /const css = "[^\n]*";/,
  /const tagId = "[^\n]*";/,
  /var TeamAction_module_css_default = \{[\s\S]*?\n\t+\};/
];

/** The baseline the app build started from: pristine text, generated lines from the shipped file. */
function appVariant(pristineText, liveText) {
  let text = pristineText;
  let swapped = 0;
  for (const pattern of GENERATED_PATTERNS) {
    const before = text.match(pattern)?.[0];
    const shipped = liveText.match(pattern)?.[0];
    if (before === void 0 || shipped === void 0 || before === shipped) continue;
    text = text.replace(before, () => shipped);
    swapped++;
  }
  return { text, swapped };
}

const packages = (await readdir(PRISTINE, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const files = [];
const derived = [];
const notes = [];
let version;

for (const pkg of packages) {
  const pristineRoot = join(PRISTINE, pkg, 'package');
  const liveRoot = join(APP_PKGS, pkg);
  if (!existsSync(pristineRoot)) {
    notes.push(`SKIP      ${pkg} — no pristine tree under .cache/pristine`);
    continue;
  }
  if (!existsSync(liveRoot)) {
    notes.push(`MISSING   ${pkg} — not installed in ${APP_PKGS}`);
    continue;
  }
  version ??= JSON.parse(await readFile(join(liveRoot, 'package.json'), 'utf8')).version;
  notes.push(pkg);
  const pristineFiles = await walk(pristineRoot);
  const liveFiles = await walk(liveRoot);
  for (const rel of liveFiles.filter((f) => !pristineFiles.includes(f))) {
    notes.push(`  !! added in the app, not in the manifest: ${rel}`);
  }
  for (const rel of pristineFiles) {
    if (rel === 'package.json') {
      // The installer reorders the dependency keys, so the shipped bytes differ
      // without any semantic change. Never patch a manifest file.
      notes.push(`  skip     ${rel} (installer key order only)`);
      continue;
    }
    const live = join(liveRoot, rel);
    if (!existsSync(live)) {
      notes.push(`  (absent) ${rel} — the shipped app strips docs and .d.ts`);
      continue;
    }
    const pristineText = await readFile(join(pristineRoot, rel), 'utf8');
    const liveText = await readFile(live, 'utf8');
    const { text: baselineText, swapped } = appVariant(pristineText, liveText);
    if (baselineText === liveText) continue;
    const bytes = (await readFile(live)).length;
    files.push({ package: pkg, path: rel, bytes, pristine: hashOf(baselineText), patched: await sha256(live) });
    notes.push(`  patched  ${rel}  ${bytes} B  baseline ${swapped === 0 ? '= npm tarball' : `(+${swapped} generated line(s) from the shipped build)`}`);
    if (swapped > 0) derived.push({ package: pkg, path: rel, text: baselineText, pristine: pristineText });
  }
}

console.log(`root       ${ROOT}`);
console.log(`pristine   ${PRISTINE}`);
console.log(`version    ${version ?? '(unknown)'}`);
console.log(notes.join('\n'));
console.log(`\n${files.length} patched file(s) across ${new Set(files.map((f) => f.package)).size} package(s), ${derived.length} derived baseline(s)`);

if (!WRITE) {
  console.log(`\n(report only; pass --write to rewrite manifest.json, patched/, patches/ and baseline/)`);
  process.exit(0);
}

// ── manifest.json ──────────────────────────────────────────────────────────
await writeFile(join(HERE, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  patchName: 'dsh-agent-team-retire-model-panel',
  expectedPackageVersion: version,
  generatedFrom: `npm tarball ${version} (pristine) vs installed DSH desktop app`,
  files
}, null, 2)}\n`);

// ── patched/ + baseline/ + patches/ ────────────────────────────────────────
await rm(STAGE, { recursive: true, force: true });
for (const dir of ['patched', 'baseline', 'patches']) await rm(join(HERE, dir), { recursive: true, force: true });
for (const pkg of packages) {
  const staged = join(STAGE, pkg);
  await mkdir(join(staged, 'a'), { recursive: true });
  await mkdir(join(staged, 'b'), { recursive: true });
  const pkgFiles = files.filter((f) => f.package === pkg);
  for (const entry of pkgFiles) {
    const live = join(APP_PKGS, pkg, entry.path);
    const derivedEntry = derived.find((d) => d.package === pkg && d.path === entry.path);
    const baselineText = derivedEntry?.text ?? await readFile(join(PRISTINE, pkg, 'package', entry.path), 'utf8');
    for (const [side, text] of [['a', baselineText], ['b', await readFile(live, 'utf8')]]) {
      await mkdir(dirname(join(staged, side, entry.path)), { recursive: true });
      await writeFile(join(staged, side, entry.path), text);
    }
    await mkdir(dirname(join(HERE, 'patched', pkg, entry.path)), { recursive: true });
    await copyFile(live, join(HERE, 'patched', pkg, entry.path));
    if (derivedEntry !== undefined) {
      await mkdir(dirname(join(HERE, 'baseline', pkg, entry.path)), { recursive: true });
      await writeFile(join(HERE, 'baseline', pkg, entry.path), baselineText);
    }
  }
  let diff = '';
  try {
    diff = execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'diff', '--no-index', '--unified=3', '--no-color', 'a', 'b'], {
      cwd: staged,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    diff = error.stdout ?? '';
  }
  if (diff !== '') {
    await mkdir(join(HERE, 'patches'), { recursive: true });
    await writeFile(join(HERE, 'patches', `${pkg}.patch`), diff);
  }
  console.log(`wrote    patches/${pkg}.patch (${diff.split('\n').length - 1} lines), ${pkgFiles.length} file(s)`);
}
console.log(`wrote    manifest.json (${files.length} files), patched/, ${derived.length} de-novo baseline file(s)`);
