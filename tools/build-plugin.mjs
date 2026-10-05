#!/usr/bin/env node
// Generate the installable plugin's browser bundle from the patched vendor bundle.
//
// `lib/panel/client.js` is a build artifact: it is `patched/dsh-experimental-client-ui-agent-team/lib/client.js`
// (the panel this repository adds to DSH Agent Teams) published under this package's own
// module id, with the retire control removed (retirement lives in the hot-patch half of
// this repository until upstream accepts it) and the add command pointed at this
// package's own `/teammates` command.
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

/** Index of the `}` that closes the `{` at `open`. */
function matchBrace(text, open) {
	let depth = 0;
	for (let index = open; index < text.length; index += 1) {
		const char = text[index];
		if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	throw new Error(`unbalanced braces from offset ${open}`);
}

/** Remove the `<button …retire…>` element (and the comma before it) from the controls row. */
function withoutRetireButton(text) {
	const marker = text.indexOf('title: t("memberRetire")');
	if (marker < 0) throw new Error('the retire button marker was not found');
	const open = text.lastIndexOf(', (0, react_jsx_runtime.jsx)("button", {', marker);
	if (open < 0) throw new Error('the retire button element start was not found');
	const brace = text.indexOf("{", open);
	const end = matchBrace(text, brace) + 2; // `}` then `)`
	return `${text.slice(0, open)}${text.slice(end)}`;
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
	text = withoutRetireButton(text);
	if (text.includes('title: t("memberRetire")')) throw new Error('the retire control survived the rewrite');
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
console.log('  - retire control removed (it belongs to the hot-patch half until upstream accepts it)');
