#!/usr/bin/env node
// Czuwanie nad kilkoma meczami (co 60 s, 1 zapytanie): kończy się i budzi Claude, gdy w którymś meczu
// padnie gol, będzie czerwona kartka, zacznie się/skończy przerwa albo mecz minie podaną minutę.
// Użycie: node tools/czuwaj.mjs 1635728:60,70 1635718:55   (fixtureId:minuty-progi)
const KEY = '3821c5caa752d0533003cfa14a4c2650';
const af = async p => { for (let k = 0; k < 4; k++) { try { return (await (await fetch('https://v3.football.api-sports.io' + p, { headers: { 'x-apisports-key': KEY } })).json()).response || []; } catch { await new Promise(r => setTimeout(r, 10_000)); } } return []; };
const spec = Object.fromEntries(process.argv.slice(2).map(a => { const [id, m = ''] = a.split(':'); return [id, m.split(',').filter(Boolean).map(Number)]; }));
import fs from 'fs'; import os from 'os'; import path from 'path';
const MEM = path.join(os.tmpdir(), 'czuwaj-' + Object.keys(spec).sort().join('-') + '.json'); // historia statystyk przetrwa restart budzika
const prev = {}, { hist = {}, lastP = {} } = fs.existsSync(MEM) ? JSON.parse(fs.readFileSync(MEM, 'utf8')) : {};
const t = () => new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
for (;;) {
  const fx = await af(`/fixtures?ids=${Object.keys(spec).join('-')}`), out = [];
  for (const f of fx) {
    const id = String(f.fixture.id), st = f.fixture.status.short, el = f.fixture.status.elapsed || 0;
    const redOk = e => e.type === 'Card' && /Red/.test(e.detail) && !f.events.some(v => v.type === 'Var' && /red card cancelled/i.test(v.detail || '') && v.player?.id === e.player?.id);
    const reds = f.events.filter(redOk).length, sc = `${f.goals.home}:${f.goals.away}`;
    const name = `${f.teams.home.name} ${sc} ${f.teams.away.name} (${st === 'HT' ? 'przerwa' : el + "'"})`;
    const p = prev[id];
    if (p) {
      if (p.sc !== sc && !p.sc.includes('null')) { const g = f.events.filter(e => e.type === 'Goal' && !/Missed/.test(e.detail)).at(-1); out.push(`GOL — ${name}${g ? ` · ${g.time.elapsed}' ${g.team.name}${/Penalty/.test(g.detail) ? ' (karny)' : ''}` : ''}`); }
      if (reds < p.reds) out.push(`CZERWONA ANULOWANA (VAR) — ${name}`);
      if (reds > p.reds) { const r = f.events.filter(redOk).at(-1); out.push(`CZERWONA — ${name} · ${r.time.elapsed}' ${r.team.name}`); }
      if (p.st !== st && ['HT', 'FT', 'AET', 'PEN'].includes(st)) out.push(`${st === 'HT' ? 'PRZERWA' : 'KONIEC'} — ${name}`);
      for (const m of spec[id]) if (p.el < m && el >= m && ['1H', '2H'].includes(st)) out.push(`MINUTA ${m} — ${name}`);
    }
    // NACISK: w ostatnich 10 minutach drużyna, która nie prowadzi, ma ≥2 celne strzały albo ≥4 strzały i ≥2 rożne (raz na 15 min na drużynę)
    const stat = (side, k) => +((f.statistics || []).find(x => x.team.id === f.teams[side].id)?.statistics.find(x => x.type === k)?.value || 0);
    const snap = ['home', 'away'].map(sd => ({ sog: stat(sd, 'Shots on Goal'), sh: stat(sd, 'Total Shots'), co: stat(sd, 'Corner Kicks') }));
    (hist[id] ||= []).push({ el, snap }); const old = hist[id].find(x => el - x.el <= 10 && el - x.el >= 8) || hist[id][0];
    if (['1H', '2H'].includes(st) && old && el - old.el >= 6) ['home', 'away'].forEach((sd, i) => {
      const d = { sog: snap[i].sog - old.snap[i].sog, sh: snap[i].sh - old.snap[i].sh, co: snap[i].co - old.snap[i].co };
      const my = i ? f.goals.away : f.goals.home, their = i ? f.goals.home : f.goals.away, key = id + sd;
      if (my <= their && (d.sog >= 2 || (d.sh >= 4 && d.co >= 2)) && (!lastP[key] || el - lastP[key] >= 15)) { lastP[key] = el; out.push(`NACISK ${f.teams[sd].name} — ${name} · od ${old.el}' do ${el}': strzały +${d.sh}, celne +${d.sog}, rożne +${d.co}`); }
    });
    prev[id] = { sc, reds, st, el };
  }
  console.log(t(), fx.map(f => `${f.teams.home.name} ${f.goals.home ?? '-'}:${f.goals.away ?? '-'} ${f.teams.away.name} ${f.fixture.status.short} ${f.fixture.status.elapsed ?? ''}`).join(' · '));
  fs.writeFileSync(MEM, JSON.stringify({ hist, lastP }));
  if (out.length) { out.forEach(x => console.log('SYGNAŁ: ' + x)); process.exit(0); }
  if (fx.length && fx.every(f => ['FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.fixture.status.short))) process.exit(0);
  await new Promise(r => setTimeout(r, 60_000));
}
