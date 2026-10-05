// 直接打印每个队友会话记录里的 modelSelection 原文（上一次正则太脆，这次只做切片）
import { readdirSync, readFileSync, statSync } from 'node:fs';
const dir = 'C:\\Users\\Maverick\\.dsh\\storages\\session_projcache\\sessions';
const names = ['baren-luna', 'qc-luna', 'bond-luna', 'ui-luna', 'baren', 'ui', 'bond', 'qc', 'ui-glm'];
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const rows = [];
for (const f of files) {
  const txt = readFileSync(`${dir}\\${f}`, 'utf8');
  const who = names.find((n) => txt.includes(`You are teammate \\"${n}\\"`));
  if (who === undefined) continue;
  const i = txt.lastIndexOf('"modelSelection"');
  const slice = i < 0 ? '(文件里没有 modelSelection)' : txt.slice(i, i + 220).replace(/\s+/g, ' ');
  rows.push({ who, file: f, mtime: statSync(`${dir}\\${f}`).mtime.toISOString(), slice });
}
rows.sort((a, b) => a.who.localeCompare(b.who));
for (const r of rows) {
  console.log(`--- ${r.who}  ${r.file}  ${r.mtime}`);
  console.log(r.slice);
}
console.log(`\n命中 ${rows.length} 个队友会话（共 ${files.length} 个会话文件）`);
