#!/usr/bin/env node
// Alarm na żywo dla kilku meczów naraz (api-football PRO). Sprawdza co 60 s.
// Kończy się (i budzi Claude) przy pierwszym zdarzeniu: gol, czerwona kartka albo drużyna zaczyna naciskać
// (w oknie 5 min: celny strzał i co najmniej 2 strzały, albo 3 rożne).
// Użycie: node tools/alarm.mjs "Ceuta" "Monza" "Levante"
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const ONLY_PRESS = process.argv.includes('--nacisk'); // tylko nacisk (gole i kartki Chris widzi w STS)
const names = process.argv.slice(2).filter(a => !a.startsWith('--')).map(s => s.toLowerCase());
const af = async p => (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json();
const state = {}; let seen = false; // czekamy, aż mecze wystartują // id -> { score, reds, hist: { team: [{el,shots,sot,cor}] } }

function fire(msg) { console.log('ALARM: ' + msg); process.exit(0); }

for (let i = 0; i < 180; i++) {
  const live = (await af('/fixtures?live=all')).response || [];
  const hits = live.filter(f => names.some(n => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
  if (hits.length) seen = true;
  if (!hits.length && seen) fire('wszystkie śledzone mecze zakończone');
  for (const f of hits) {
    const id = f.fixture.id, el = f.fixture.status.elapsed, sc = `${f.goals.home}:${f.goals.away}`;
    const label = `${f.teams.home.name} ${sc} ${f.teams.away.name} (${el}')`;
    const s = (state[id] ||= { score: sc, reds: 0, hist: {} });
    if (sc !== s.score) { if (!ONLY_PRESS) fire(`GOL — ${label}`); s.score = sc; }
    const st = (await af(`/fixtures/statistics?fixture=${id}`)).response || [];
    let reds = 0;
    for (const t of st) {
      const m = Object.fromEntries(t.statistics.map(x => [x.type, x.value]));
      reds += +m['Red Cards'] || 0;
      const now = { el, shots: +m['Total Shots'] || 0, sot: +m['Shots on Goal'] || 0, cor: +m['Corner Kicks'] || 0 };
      const h = (s.hist[t.team.name] ||= []); h.push(now);
      const base = h.filter(x => x.el <= el - 5).pop();
      if (base) {
        const d = { shots: now.shots - base.shots, sot: now.sot - base.sot, cor: now.cor - base.cor };
        if ((d.sot >= 1 && d.shots >= 2) || d.cor >= 3)
          fire(`NACISK ${t.team.name} — od ${base.el}' do ${el}': strzały +${d.shots}, celne +${d.sot}, rożne +${d.cor} · ${label}`);
      }
    }
    if (reds > s.reds && i > 0 && !ONLY_PRESS) fire(`CZERWONA KARTKA — ${label}`);
    s.reds = reds;
  }
  console.log(`${new Date().toLocaleTimeString('pl-PL')} ` + hits.map(f => `${f.teams.home.name} ${f.goals.home}:${f.goals.away} ${f.fixture.status.elapsed}'`).join(' · '));
  await new Promise(r => setTimeout(r, 60_000));
}
