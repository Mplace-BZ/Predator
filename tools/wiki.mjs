#!/usr/bin/env node
// Wiki typowania: research/wiki.md → sciaga/wiki.html (strona lokalna obok ściągi i portfela).
// Użycie: node tools/wiki.mjs   (po każdej zmianie research/wiki.md)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const lines = fs.readFileSync(path.join(ROOT, 'research/wiki.md'), 'utf8').split('\n');
let html = '', i = 0, title = 'Wiki typowania';
const VERD = { 'TAK': 'ok', 'NIE': 'no', 'SŁABO': 'mid', 'TAK, ale lekko': 'mid' };
while (i < lines.length) {
  const l = lines[i];
  if (l.startsWith('# ')) { title = l.slice(2); i++; }
  else if (l.startsWith('### ')) { html += `<h3>${inl(l.slice(4))}</h3>`; i++; }
  else if (l.startsWith('## ')) { html += `<h2>${inl(l.slice(3))}</h2>`; i++; }
  else if (l.startsWith('- ')) { html += '<ul>'; while (i < lines.length && lines[i].startsWith('- ')) html += `<li>${inl(lines[i++].slice(2))}</li>`; html += '</ul>'; }
  else if (l.startsWith('|')) {
    const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++].split('|').slice(1, -1).map(c => c.trim()));
    html += '<div class="card"><table><tr>' + rows[0].map(c => `<th>${inl(c)}</th>`).join('') + '</tr>' + rows.slice(2).map(r => '<tr>' + r.map(c => `<td${VERD[c] ? ` class="v ${VERD[c]}"` : ''}>${inl(c)}</td>`).join('') + '</tr>').join('') + '</table></div>';
  } else if (l.trim()) { html += `<p>${inl(l)}</p>`; i++; } else i++;
}
const out = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#001e28;--panel:#00141e;--lh:#0b2a36;--line:#0e3442;--text:#e6eef0;--dim:#8ba0a8;--red:#ff0046;--acc:#FF5A1F;--pos:#4ADE80;--warn:#FFB347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 Manrope,system-ui,-apple-system,sans-serif}
.top{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--panel)}.top h1{margin:0;font-size:18px}.top h1 b{color:var(--acc)}.meta{color:var(--dim);font-size:12px}
.wrap{max-width:1000px;margin:0 auto;padding:16px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}.pills a{background:#0d2f3c;color:var(--text);border:1px solid transparent;border-radius:8px;padding:7px 14px;font:700 12px/1 inherit;letter-spacing:.06em;text-decoration:none}.pills a:hover{border-color:#2b6577}.pills a.on{background:var(--red)}.pills a.r{margin-left:auto}
h2{font-size:16px;margin:28px 0 10px}h3{font-size:13px;margin:18px 0 6px;color:var(--warn)}p{margin:8px 0;color:var(--text)}ul{margin:6px 0;padding-left:20px}li{margin:5px 0}
.card{background:var(--panel);border-radius:12px;overflow-x:auto;margin:10px 0}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dim);padding:10px 12px;background:var(--lh);font-weight:600}
td{padding:10px 12px;border-top:1px solid var(--line);vertical-align:top;font-variant-numeric:tabular-nums}.v{font-weight:800;white-space:nowrap}.ok{color:var(--pos)}.no{color:var(--red)}.mid{color:var(--warn)}
</style></head><body>
<div class="top"><h1>Wiki <b>typowania</b></h1><span class="meta">nasza wiedza: liczby, lekcje, przeczucia do sprawdzenia · zaktualizowano ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</span></div>
<div class="wrap">
<div class="pills"><a href="index.html#all">ALL</a><a href="index.html#must">MUST</a><a href="index.html#szansa">CHANCE</a><a href="index.html#ryzyko">RISK</a><a href="index.html#fav">FAVOURITE</a><a href="index.html#moje">MY BETS</a><a href="index.html#hist">HISTORY</a><a class="r" href="portfel.html">AI BOT</a><a class="on" href="wiki.html">WIKI</a></div>
${html}
</div></body></html>`;
fs.mkdirSync(path.join(ROOT, 'sciaga'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'sciaga/wiki.html'), out);
console.log('gotowe: sciaga/wiki.html');
