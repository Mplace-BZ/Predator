// Pobiera gole i czerwone kartki z minutami dla zakończonych meczów (api-football PRO).
// Użycie: node research/pobierz-zdarzenia.mjs 2025 39 140 135 78 61
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
const K = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const [season, ...leagues] = process.argv.slice(2);
const OUT = new URL(`./zdarzenia-${season}.json`, import.meta.url);
const db = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let last = 0;
async function af(p) {
  const w = last + 220 - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); last = Date.now();
  for (let i = 0; i < 3; i++) {
    const j = await (await fetch(B + p, { headers: { 'x-apisports-key': K } })).json();
    if (j.errors && Object.keys(j.errors).length) { if (JSON.stringify(j.errors).includes('rateLimit')) { await new Promise(r => setTimeout(r, 15000)); continue; } throw new Error(JSON.stringify(j.errors)); }
    return j;
  }
}
for (const lg of leagues) {
  const fx = (await af(`/fixtures?league=${lg}&season=${season}&status=FT-AET-PEN`)).response;
  console.log(`liga ${lg}: ${fx.length} meczów`);
  let n = 0;
  for (const f of fx) {
    const id = f.fixture.id; if (db[id]) continue;
    const ev = (await af(`/fixtures/events?fixture=${id}`)).response;
    db[id] = { lg, h: f.teams.home.name, a: f.teams.away.name, ft: [f.score.fulltime.home, f.score.fulltime.away],
      ev: ev.filter(e => (e.type === 'Goal' && !/Missed/.test(e.detail)) || (e.type === 'Card' && /Red/.test(e.detail)))
        .map(e => ({ m: e.time.elapsed + (e.time.extra || 0) / 100, t: e.team.name === f.teams.home.name ? 'h' : 'a', k: e.type === 'Goal' ? 'G' : 'R' })) };
    if (++n % 50 === 0) { writeFileSync(OUT, JSON.stringify(db)); console.log(`  ${n}/${fx.length}`); }
  }
  writeFileSync(OUT, JSON.stringify(db));
}
console.log('gotowe, meczów w bazie:', Object.keys(db).length);
