#!/usr/bin/env node
// Generate the installable plugin's browser bundle from the patched vendor bundle.
//
// `lib/panel/client.js` is a build artifact: it is `patched/dsh-experimental-client-ui-agent-team/lib/client.js`
// (the panel this repository adds to DSH Agent Teams) published under this package's own
// module id, with the parts that need the hot-patch half or the author's machine removed
// (the roster controls row: retire + re-route; the team rest switch: the `resting` phase;
// the local-model gate panel: an unrelated local tool on 127.0.0.1:11499) and the add
// command pointed at this package's own `/teammates` command.
//
//   node tools/build-plugin.mjs            # rewrite lib/panel/client.js
//   node tools/build-plugin.mjs --check    # fail when the artifact is out of date
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(HERE, 'patched', 'dsh-experimental-client-ui-agent-team', 'lib', 'client.js');
const TARGET = join(HERE, 'lib', 'panel', 'client.js');
const PACKAGE = 'dsh-agent-team-panel';

/**
 * Remove the roster controls row: this half cannot retire a member (the shipped
 * runtime has no `retired` phase) and cannot re-route one (a teammate's model is
 * frozen into its subagent descriptor, so switching it rebuilds the member). The
 * plugin offers model choice where the shipped runtime supports it — at creation.
 */
function withoutControlsRow(text) {
	const start = text.indexOf('const controls = isLead ? false : (0, react_jsx_runtime.jsxs)("div", {');
	if (start < 0) throw new Error('the controls row marker was not found');
	const next = text.indexOf('return (0, react_jsx_runtime.jsxs)("div", {', start);
	if (next < 0) throw new Error('the statement after the controls row was not found');
	return `${text.slice(0, start)}const controls = false;\n\t\t\t${text.slice(next)}`;
}

/**
 * Remove the team rest switch and the local-model gate panel from the panel body.
 * Resting is a hot-patch phase (`resting` in the roster state machine) that the
 * shipped runtime rejects, so `/team rest` cannot work here; the gate panel drives
 * `tools/llm-gate.mjs` of an unrelated local project, hardcoded to
 * `http://127.0.0.1:11499`. Both would be buttons that fail for a stranger.
 */
function withoutRestAndGate(text) {
	const site = /\(0, react_jsx_runtime\.jsx\)\(LocalModelGate, \{ t \}\), \(0, react_jsx_runtime\.jsx\)\(TeamRestSwitch, \{[\s\S]*?\}\),/;
	if (!site.test(text)) throw new Error('the rest switch / local-model gate render site was not found');
	return text.replace(site, '');
}

function transform(source) {
	let text = source;
	const replaceOnce = (from, to, label) => {
		const count = text.split(from).length - 1;
		if (count !== 1) throw new Error(`${label}: expected exactly one occurrence, found ${count}`);
		text = text.replace(from, to);
	};
	replaceOnce(
		'id: "@deepseek-ai/dsh-experimental-client-ui-agent-team"',
		`id: "${PACKAGE}"`,
		'module id'
	);
	replaceOnce(
		'"@deepseek-ai/dsh-experimental-client-ui-agent-team/TeamAction.module.css"',
		`"${PACKAGE}/TeamAction.module.css"`,
		'stylesheet id'
	);
	replaceOnce('/team add ${name}', '/teammates add ${name}', 'add command');
	text = withoutRestAndGate(withoutControlsRow(text));
	if (!text.includes('const controls = false;')) throw new Error('the controls row survived the rewrite');
	if (!text.includes('memberRetire:')) throw new Error('the locale dictionary was damaged by the rewrite');
	return `${text}\n`;
}

const artifact = transform(await readFile(SOURCE, 'utf8'));
const current = await readFile(TARGET, 'utf8').catch(() => undefined);

if (process.argv.includes('--check')) {
	if (current !== artifact) {
		console.error('lib/panel/client.js is out of date; run: node tools/build-plugin.mjs');
		process.exit(1);
	}
	console.log('BUILD-PLUGIN OK: lib/panel/client.js matches the patched vendor bundle');
	process.exit(0);
}

await writeFile(TARGET, artifact);
console.log(`wrote lib/panel/client.js (${artifact.length} B) from patched/dsh-experimental-client-ui-agent-team/lib/client.js`);
console.log('  - module id  ->', PACKAGE);
console.log('  - add command -> /teammates add <name> [--fork] [--model p/m] -- <prompt>');
console.log('  - retire, re-route, rest and local-model-gate controls removed (hot-patch half / author machine only)');
