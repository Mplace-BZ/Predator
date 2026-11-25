#!/usr/bin/env node
// Czuwanie nad kilkoma meczami (co 60 s, 1 zapytanie): kończy się i budzi Claude, gdy w którymś meczu
// padnie gol, będzie czerwona kartka, zacznie się/skończy przerwa albo mecz minie podaną minutę.
// Użycie: node tools/czuwaj.mjs 1635728:60,70 1635718:55   (fixtureId:minuty-progi)
const KEY = '3821c5caa752d0533003cfa14a4c2650';
const af = async p => { for (let k = 0; k < 4; k++) { try { return (await (await fetch('https://v3.football.api-sports.io' + p, { headers: { 'x-apisports-key': KEY } })).json()).response || []; } catch { await new Promise(r => setTimeout(r, 10_000)); } } return []; };
const spec = Object.fromEntries(process.argv.slice(2).map(a => { const [id, m = ''] = a.split(':'); return [id, m.split(',').filter(Boolean).map(Number)]; }));
const prev = {};
const t = () => new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
for (;;) {
  const fx = await af(`/fixtures?ids=${Object.keys(spec).join('-')}`), out = [];
  for (const f of fx) {
    const id = String(f.fixture.id), st = f.fixture.status.short, el = f.fixture.status.elapsed || 0;
    const reds = f.events.filter(e => /Red/.test(e.detail)).length, sc = `${f.goals.home}:${f.goals.away}`;
    const name = `${f.teams.home.name} ${sc} ${f.teams.away.name} (${st === 'HT' ? 'przerwa' : el + "'"})`;
    const p = prev[id];
    if (p) {
      if (p.sc !== sc) { const g = f.events.filter(e => e.type === 'Goal' && !/Missed/.test(e.detail)).at(-1); out.push(`GOL — ${name}${g ? ` · ${g.time.elapsed}' ${g.team.name}${/Penalty/.test(g.detail) ? ' (karny)' : ''}` : ''}`); }
      if (reds > p.reds) { const r = f.events.filter(e => /Red/.test(e.detail)).at(-1); out.push(`CZERWONA — ${name} · ${r.time.elapsed}' ${r.team.name}`); }
      if (p.st !== st && ['HT', 'FT', 'AET', 'PEN'].includes(st)) out.push(`${st === 'HT' ? 'PRZERWA' : 'KONIEC'} — ${name}`);
      for (const m of spec[id]) if (p.el < m && el >= m && ['1H', '2H'].includes(st)) out.push(`MINUTA ${m} — ${name}`);
    }
    prev[id] = { sc, reds, st, el };
  }
  console.log(t(), fx.map(f => `${f.teams.home.name} ${f.goals.home ?? '-'}:${f.goals.away ?? '-'} ${f.teams.away.name} ${f.fixture.status.short} ${f.fixture.status.elapsed ?? ''}`).join(' · '));
  if (out.length) { out.forEach(x => console.log('SYGNAŁ: ' + x)); process.exit(0); }
  if (fx.length && fx.every(f => ['FT', 'AET', 'PEN', 'PST', 'CANC'].includes(f.fixture.status.short))) process.exit(0);
  await new Promise(r => setTimeout(r, 60_000));
}
