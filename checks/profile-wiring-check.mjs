// Verifies the applier's profile wiring end to end, inside a throw-away fixture: a
// fake app root whose seven target files already match the manifest (so the file side
// is a no-op) plus a fake DSH home whose profile is missing the Agent Teams bundle.
//
// Asserts: --check reports NOT-WIRED and exits 1; apply adds the bundle and keeps a
// backup; --check then reports PATCHED + WIRED and exits 0; --revert restores the
// original package.json; and the app-side files are never rewritten either way.
//
//   node checks/profile-wiring-check.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(HERE, '.cache', 'wiring-fixture');
const APP = join(FIXTURE, 'app');
const HOME = join(FIXTURE, 'home');
const PROFILE = join(HOME, 'profiles', 'web');
const PROFILE_PKG = join(PROFILE, 'package.json');
const BUNDLE = '@deepseek-ai/dsh-experimental-agent-team-profile';

const failures = [];
const check = (name, condition, detail = "") => {
	if (condition) console.log(`  PASS  ${name}`);
	else failures.push(`${name}${detail === "" ? "" : ` — ${detail}`}`);
};
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const manifest = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'));
const originalProfile = `${JSON.stringify({
	name: 'dsh-profile-web',
	private: true,
	dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }
}, null, 2)}\n`;

// ── fixture: patched app files + an unwired profile ────────────────────────
await rm(FIXTURE, { recursive: true, force: true });
await mkdir(APP, { recursive: true });
await mkdir(PROFILE, { recursive: true });
// The applier identifies a DSH install by the app manifest's package name.
const APP_MANIFEST = `${JSON.stringify({ name: 'dsh-plugin-desktop', version: '2.0.17' }, null, 2)}\n`;
await writeFile(join(APP, 'package.json'), APP_MANIFEST);
await writeFile(PROFILE_PKG, originalProfile);
for (const entry of manifest.files) {
	const pkgDir = join(APP, 'node_modules', '@deepseek-ai', entry.package);
	await mkdir(dirname(join(pkgDir, entry.path)), { recursive: true });
	await writeFile(join(pkgDir, 'package.json'), `${JSON.stringify({ name: `@deepseek-ai/${entry.package}`, version: manifest.expectedPackageVersion }, null, 2)}\n`);
	await copyFile(join(HERE, 'patched', entry.package, entry.path), join(pkgDir, entry.path));
}

const run = (args, extraEnv) => {
	const env = { ...process.env, ...extraEnv };
	if (extraEnv?.DSH_APP_ROOT === void 0) delete env.DSH_APP_ROOT;
	try {
		const stdout = execFileSync(process.execPath, [join(HERE, 'apply.mjs'), '--profile', PROFILE, ...args], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
		return { code: 0, output: stdout };
	} catch (error) {
		return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
	}
};
const bundles = async () => JSON.parse(await readFile(PROFILE_PKG, 'utf8')).dsh.profile.bundles;

// `--root` must point at the fixture, never at the installed app.
const before = { root: APP };

// ── 1. unwired profile: --check must fail ─────────────────────────────────
const first = run(['--root', APP, '--check']);
check('--check reports the files as patched', first.output.includes('PATCHED  patched=7'), first.output.trim().split('\n').pop());
check('--check reports the profile as NOT-WIRED', first.output.includes('NOT-WIRED'), first.output);
check('--check exits 1 while the bundle is missing', first.code === 1, `exit=${first.code}`);

// ── 2. apply wires the profile and keeps a backup ─────────────────────────
const applied = run(['--root', APP]);
check('apply exits 0', applied.code === 0, `exit=${applied.code}`);
check('apply adds the Agent Teams bundle', (await bundles()).includes(BUNDLE), JSON.stringify(await bundles()));
check('apply keeps a package.json backup', existsSync(`${PROFILE_PKG}.dsh-team.bak`));
check('apply leaves the other bundles alone', (await bundles())[0] === '@deepseek-ai/dsh-base');
check('apply did not rewrite the app package.json', (await readFile(join(APP, 'package.json'), 'utf8')) === APP_MANIFEST);

const second = run(['--root', APP, '--check']);
check('--check exits 0 once wired', second.code === 0, `exit=${second.code}`);
check('--check reports WIRED', second.output.includes('WIRED'), second.output);

// ── 3. every patched file still matches the manifest ──────────────────────
let mismatched = '';
for (const entry of manifest.files) {
	const bytes = await readFile(join(APP, 'node_modules', '@deepseek-ai', entry.package, entry.path));
	if (sha256(bytes) !== entry.patched) mismatched = `${entry.package}/${entry.path}`;
}
check('the app files were never rewritten', mismatched === '', mismatched);

// ── 4. revert restores the original profile ───────────────────────────────
const reverted = run(['--root', APP, '--revert']);
check('--revert exits 0', reverted.code === 0, `exit=${reverted.code}`);
check('--revert removes the Agent Teams bundle', !(await bundles()).includes(BUNDLE), JSON.stringify(await bundles()));
check('--revert restores the original bytes', (await readFile(PROFILE_PKG, 'utf8')) === originalProfile);
check('--revert consumes the backup', !existsSync(`${PROFILE_PKG}.dsh-team.bak`));
check('--check exits 1 again after revert', run(['--root', APP, '--check']).code === 1);

// ── 5. the applier finds the install itself ───────────────────────────────
// A second copy of the fixture app under %LOCALAPPDATA%\Programs must win over the
// machine's own install, so `--root` is only needed when detection is ambiguous.
const detectedApp = join(FIXTURE, 'local', 'Programs', 'DSH Desktop', 'resources', 'app');
await mkdir(dirname(detectedApp), { recursive: true });
await cp(APP, detectedApp, { recursive: true });
const detected = run(['--check'], { LOCALAPPDATA: join(FIXTURE, 'local') });
check('auto-detects the install under %LOCALAPPDATA%\\Programs', detected.output.includes(`root       ${detectedApp}`), detected.output.split('\n')[0]);
check('detection still reports the file state', detected.output.includes('PATCHED  patched=7'), detected.output);

console.log(failures.length === 0 ? 'PROFILE-WIRING-CHECK OK（失败 0 项）' : `PROFILE-WIRING-CHECK FAILED（${failures.length} 项）`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
