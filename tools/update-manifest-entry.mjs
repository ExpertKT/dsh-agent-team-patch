/**
 * Recompute the one manifest entry whose patched file this branch changed.
 *
 * `tools/build-manifest.mjs` is the canonical regenerator, but it rewrites
 * `patches/` and `baseline/` from a CI build this machine does not have, and it
 * needs a live patched app tree. This script instead proves the *other six*
 * entries still hash exactly as committed and updates only the entry for the
 * file this branch edited, so a reviewer sees a single-entry manifest diff.
 *
 *   node tools/update-manifest-entry.mjs
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(HERE, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

let updated = 0;
const mismatched = [];
for (const file of manifest.files) {
	const path = join(HERE, 'patched', file.package, file.path);
	const bytes = (await readFile(path)).length;
	const patched = await sha256(path);
	if (patched === file.patched && bytes === file.bytes) continue;
	// Only the file this branch edited may differ from the committed manifest.
	if (file.package !== 'dsh-experimental-tool-agent-team' || file.path !== 'lib/index.js') {
		mismatched.push(`${file.package}/${file.path}`);
		continue;
	}
	console.log(`update ${file.package}/${file.path}: ${file.bytes} -> ${bytes} B`);
	console.log(`  patched ${file.patched} -> ${patched}`);
	file.bytes = bytes;
	file.patched = patched;
	updated += 1;
}

if (mismatched.length > 0) {
	console.error(`unexpected drift outside this branch's change: ${mismatched.join(', ')}`);
	process.exit(1);
}
if (updated === 0) {
	console.log('manifest.json already current');
	process.exit(0);
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote manifest.json (${updated} entry updated)`);
