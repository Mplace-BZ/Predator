#!/usr/bin/env node
// Wyjściowe składy przed meczem: czeka do podanej godziny (Warszawa), potem co 2 min sprawdza, czy są składy,
// liczy, ilu „podstawowych” (11 najczęściej grających od początku w ostatnich 8 meczach) wychodzi w pierwszej jedenastce,
// dopisuje wynik do notatki .md, przebudowuje stronę i kończy się (budzi Claude).
// Użycie: node tools/lm-sklady.mjs 18:00 research/lm-2026-11-25.md lm.html 1635728 1635718
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = '3821c5caa752d0533003cfa14a4c2650';
const af = async p => { for (let k = 0; k < 4; k++) { try { return (await (await fetch('https://v3.football.api-sports.io' + p, { headers: { 'x-apisports-key': KEY } })).json()).response || []; } catch { await new Promise(r => setTimeout(r, 10_000)); } } return []; };
const [from, md, html, ...ids] = process.argv.slice(2);
const now = () => new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
while (now() < from) await new Promise(r => setTimeout(r, 60_000));
const lines = [];
for (const id of ids) {
  let lu = [];
  for (let k = 0; k < 40 && lu.length < 2; k++) { lu = await af(`/fixtures/lineups?fixture=${id}`); if (lu.length < 2) await new Promise(r => setTimeout(r, 120_000)); }
  const f = (await af(`/fixtures?id=${id}`))[0];
  const row = [];
  for (const t of lu) {
    const last = (await af(`/fixtures?team=${t.team.id}&last=8`)).filter(x => x.fixture.id !== +id);
    const cnt = {};
    for (const x of last) { const l = (await af(`/fixtures/lineups?fixture=${x.fixture.id}`)).find(y => y.team.id === t.team.id); if (l) for (const p of l.startXI) cnt[p.player.id] = (cnt[p.player.id] || 0) + 1; }
    const regs = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 11).map(([pid]) => +pid);
    const n = t.startXI.filter(p => regs.includes(p.player.id)).length;
    const out = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 11).filter(([pid]) => !t.startXI.some(p => p.player.id === +pid)).length;
    row.push(`${t.team.name} ${n} z 11 podstawowych${n <= 4 ? ' (REZERWY, nie gram na tę drużynę)' : n <= 7 ? ' (sporo zmian, sprawdź kto nie gra)' : ' (pełny skład)'}`);
  }
  // Lekcja 2026-11-25 (Bayern bez Kane'a, a narzędzie pisało „pełny skład”): podstawowi liczeni z ostatnich meczów nie widzą gwiazd z długą kontuzją — dopisujemy nieobecnych z listy kontuzji
  const inj = (await af(`/injuries?fixture=${id}`)).filter(x => x.player.type === 'Missing Fixture');
  for (const t of [f.teams.home, f.teams.away]) { const miss = inj.filter(x => x.team.id === t.id).map(x => x.player.name); if (miss.length) row.push(`${t.name} BEZ: ${miss.join(', ')}`); }
  const line = `- **${f.teams.home.name} – ${f.teams.away.name}:** ${row.length ? row.join('; ') : 'składów brak'}.`;
  lines.push(line); console.log(line.replace(/\*\*/g, ''));
}
const file = path.join(ROOT, md);
let s = fs.readFileSync(file, 'utf8');
const H = '## 5. Wyjściowe składy';
if (!s.includes(H)) s += `\n${H}\n\nPodstawowi = 11 zawodników, którzy najczęściej zaczynali w ostatnich 8 meczach (wszystkie rozgrywki). 8 i więcej to pełny skład, 5–7 sporo zmian (często kontuzje), 4 i mniej to rezerwy. Wczoraj City wyszło z 6 podstawowymi i tak odrobiło 0:1, Palmeiras z 0 przegrał 0:3.\n`;
s += `\n${now()}:\n\n${lines.join('\n')}\n`;
fs.writeFileSync(file, s);
execFileSync('node', [path.join(ROOT, 'tools/wiki.mjs'), md, html], { stdio: 'inherit' });
