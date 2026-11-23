#!/usr/bin/env node
// Śledzenie wybranych meczów na żywo co 3 minuty (api-football PRO).
// Zapisuje oś czasu statystyk do tools/.sledz.json — mecze.mjs liczy z niej dynamikę "ostatnie 10 min".
// Użycie: node tools/sledz.mjs "Gouna" "Degla"   (kończy się sam, gdy wszystkie mecze się skończą, max 3 h)
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const FILE = new URL('./.sledz.json', import.meta.url);
const EVERY = 180_000, MAX_MS = 3 * 3600_000, t0 = Date.now();
const names = process.argv.slice(2).map(s => s.toLowerCase());
const af = async p => (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json();
const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };

async function tick() {
  const db = load();
  const live = (await af('/fixtures?live=all')).response || [];
  const hits = live.filter(f => names.some(n => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
  for (const f of hits) {
    const st = (await af(`/fixtures/statistics?fixture=${f.fixture.id}`)).response || [];
    const snap = { el: f.fixture.status.elapsed, g: [f.goals.home, f.goals.away], ts: Date.now() };
    for (const t of st) {
      const m = Object.fromEntries(t.statistics.map(s => [s.type, s.value]));
      snap[t.team.name] = { shots: +m['Total Shots'] || 0, sot: +m['Shots on Goal'] || 0, box: +m['Shots insidebox'] || 0, cor: +m['Corner Kicks'] || 0, xg: parseFloat(m.expected_goals) || 0 };
    }
    (db[f.fixture.id] ||= { h: f.teams.home.name, a: f.teams.away.name, t: [] }).t.push(snap);
  }
  writeFileSync(FILE, JSON.stringify(db));
  const stamp = new Date().toLocaleTimeString('pl-PL');
  console.log(`${stamp} śledzę ${hits.length}/${names.length}: ` + hits.map(f => `${f.teams.home.name} ${f.goals.home}:${f.goals.away} ${f.teams.away.name} ${f.fixture.status.elapsed}'`).join(' · '));
  return hits.length;
}

while (Date.now() - t0 < MAX_MS) {
  const n = await tick().catch(e => (console.log('błąd:', e.message), 1));
  if (n === 0 && Date.now() - t0 > EVERY) { console.log('wszystkie mecze zakończone — koniec śledzenia'); break; }
  await new Promise(r => setTimeout(r, EVERY));
}
