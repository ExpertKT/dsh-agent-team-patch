#!/usr/bin/env node
// DSH agent-team「退休队友」热补丁 —— 幂等安装/卸载器。
//
// 改的是发行代码（resources/app/node_modules），DSH 升级即失效；本脚本只做两件确定性的事：
//   1) 先把包版本和每个目标文件的 sha256 核对一遍（对不上就拒绝，不猜、不覆盖）；
//   2) 按 manifest.json 把 patched/ 里的字节拷过去（幂等：已打过就是 no-op），原件留 .dsh-retire.bak。
//
// 用法：
//   node apply.mjs                 # 应用（幂等）
//   node apply.mjs --check         # 只看状态，不写盘；已全打上则 exit 0，否则 exit 1
//   node apply.mjs --revert        # 从 .dsh-retire.bak 还原
//   node apply.mjs --root <dir>    # 指定 DSH 资源根目录（默认取 DSH_APP_ROOT 或本机路径）
//   node apply.mjs --force         # 目标文件被第三方改过（drift）时仍然覆盖
//
// 应用后必须重启 DSH，服务端插件无热重载。
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT_PKG = 'node_modules/@deepseek-ai';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};

const HELP = `DSH agent-team retire patch — idempotent applier

  node apply.mjs [--root <DSH resources/app>] [--check|--revert] [--force]

  (no flags)  apply the patch (no-op if already applied)
  --check     report status only; exit 0 when every file is patched, 1 otherwise
  --revert    restore the *.dsh-retire.bak backups created by a previous apply
  --force     overwrite files whose hash matches neither pristine nor patched
  --root      DSH resources/app directory (default: $DSH_APP_ROOT, then
              F:/DSHDesktop/DSH Desktop/resources/app)

After applying, restart DSH: server-side plugins are not hot-reloaded.
`;

if (flag('help')) {
  console.log(HELP);
  process.exit(0);
}

if (argv.some((a) => !a.startsWith('--') && !['apply', 'check', 'revert'].includes(a) && a !== opt('root', null))) {
  console.error(`unexpected argument; try --help`);
  process.exit(2);
}

const MANIFEST = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'));
const ROOT = resolve(opt('root', process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app'));
const MODE = flag('revert') ? 'revert' : flag('check') || flag('verify') ? 'check' : 'apply';
const FORCE = flag('force');

const pkgDir = (pkg) => join(ROOT, ROOT_PKG, pkg);
const targetOf = (e) => join(pkgDir(e.package), e.path);
const sourceOf = (e) => join(HERE, 'patched', e.package, e.path);
const backupOf = (e) => `${targetOf(e)}.dsh-retire.bak`;

const sha256 = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');
const exists = (p) => existsSync(p);

/** 'patched' | 'pristine' | 'drift' | 'missing' */
async function classify(e) {
  const t = targetOf(e);
  if (!exists(t)) return 'missing';
  const h = await sha256(t);
  if (h === e.patched) return 'patched';
  if (h === e.pristine) return 'pristine';
  return 'drift';
}

const packages = [...new Set(MANIFEST.files.map((e) => e.package))];

async function versionOf(pkg) {
  const p = join(pkgDir(pkg), 'package.json');
  if (!exists(p)) return undefined;
  try {
    return JSON.parse(await readFile(p, 'utf8')).version;
  } catch {
    return undefined;
  }
}

console.log(`patch      ${MANIFEST.patchName} (expects @deepseek-ai/* ${MANIFEST.expectedPackageVersion})`);
console.log(`root       ${ROOT}`);
console.log(`mode       ${MODE}${FORCE ? ' --force' : ''}`);

if (!exists(join(ROOT, 'package.json'))) {
  console.error(`\n[FAIL] ${ROOT} 不像是 DSH 资源目录（没有 package.json）。用 --root 指到 resources/app。`);
  process.exit(2);
}

// ── 1. 版本闸门 ────────────────────────────────────────────────────────────
let versionBad = 0;
for (const pkg of packages) {
  const v = await versionOf(pkg);
  const good = v === MANIFEST.expectedPackageVersion;
  if (!good) versionBad++;
  console.log(`version    ${pkg}  ${v ?? '(missing)'}  ${good ? 'OK' : `!= ${MANIFEST.expectedPackageVersion}`}`);
}
if (versionBad > 0 && MODE !== 'revert') {
  console.error(`\n[FAIL] ${versionBad} 个包版本不符，补丁是按 ${MANIFEST.expectedPackageVersion} 做的。升级 DSH 后需要重新生成补丁。`);
  process.exit(2);
}
if (versionBad > 0) console.error(`\n[WARN] 版本不符，但仍按 backup 还原。`);

// ── 2. 逐文件处理 ──────────────────────────────────────────────────────────
const states = [];
for (const e of MANIFEST.files) states.push({ e, state: await classify(e) });

for (const { e, state } of states) {
  console.log(`  ${state.padEnd(8)} ${e.package}/${e.path.replace(/\\/g, '/')}`);
}

const count = (s) => states.filter((x) => x.state === s).length;

if (MODE === 'check') {
  const ok = count('patched') === states.length;
  console.log(`\n${ok ? 'PATCHED' : 'NOT-PATCHED'}  patched=${count('patched')} pristine=${count('pristine')} drift=${count('drift')} missing=${count('missing')}`);
  process.exit(ok ? 0 : 1);
}

if (MODE === 'revert') {
  let done = 0;
  for (const { e, state } of states) {
    const b = backupOf(e);
    if (!exists(b)) {
      console.log(`  skip     ${e.package}/${e.path.replace(/\\/g, '/')} （没有 backup；state=${state}）`);
      continue;
    }
    if (state === 'patched' || FORCE) {
      await copyFile(b, targetOf(e));
      await rm(b);
      const back = (await sha256(targetOf(e))) === e.pristine;
      console.log(`  ${back ? 'reverted' : 'REVERTED-DIFF'} ${e.package}/${e.path.replace(/\\/g, '/')}${back ? '' : '  (还原后哈希与 pristine 不符)'}`);
      done++;
    } else {
      console.log(`  skip     ${e.package}/${e.path.replace(/\\/g, '/')} （已是 ${state}，不是打过补丁的状态；--force 可强还原）`);
    }
  }
  console.log(`\n还原 ${done} 个文件。重启 DSH 生效。`);
  process.exit(0);
}

// MODE === 'apply'
const blocked = count('drift') + count('missing');
if (blocked > 0 && !FORCE) {
  console.error(`\n[FAIL] 有 ${blocked} 个文件既不是原始版本、也不是打过补丁的版本 —— 无法安全覆盖。`);
  console.error(`       先人工核对（可能是 DSH 自身升级了），或确认后加 --force。`);
  process.exit(2);
}
if (count('patched') === states.length) {
  console.log(`\nALREADY-APPLIED（${states.length} 个文件全部已是补丁版本，未写盘）。重启 DSH 即可生效。`);
  process.exit(0);
}

let changed = 0;
let backedUp = 0;
for (const { e, state } of states) {
  if (state === 'patched') continue;
  const t = targetOf(e);
  if (!exists(backupOf(e)) && exists(t)) {
    await copyFile(t, backupOf(e));
    backedUp++;
  }
  await mkdir(dirname(t), { recursive: true });
  await copyFile(sourceOf(e), t);
  const now = await sha256(t);
  const good = now === e.patched;
  console.log(`  applied  ${e.package}/${e.path.replace(/\\/g, '/')}${good ? '' : '  (!! 写入后哈希不符)'}`);
  changed++;
  if (!good) process.exitCode = 1;
}

console.log(`\nAPPLIED  ${changed} 个文件（新建 backup ${backedUp} 个）。`);
console.log(`重启 DSH 生效；node ${join(HERE, 'checks', 'reuse-check.mjs')} 可离线复核。`);
console.log(`卸载：node apply.mjs --revert`);
