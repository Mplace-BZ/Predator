#!/usr/bin/env node
// Alarm momentum: kończy się (i budzi Claude), gdy wskazana drużyna zaczyna naciskać, padnie gol albo mecz się skończy.
// Użycie: node tools/alarm.mjs "Al Shamal"   — sprawdza co 2 min, okno 6 min
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const team = process.argv[2].toLowerCase();
const af = async p => (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json();
const hist = []; let score0 = null;
for (let i = 0; i < 40; i++) {
  const f = ((await af('/fixtures?live=all')).response || []).find(f => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(team));
  if (!f) { console.log('ALARM: mecz zakończony / zniknął z live'); process.exit(0); }
  const sc = `${f.goals.home}:${f.goals.away}`, el = f.fixture.status.elapsed;
  if (score0 && sc !== score0) { console.log(`ALARM: GOL — ${f.teams.home.name} ${sc} ${f.teams.away.name} (${el}')`); process.exit(0); }
  score0 ||= sc;
  const st = (await af(`/fixtures/statistics?fixture=${f.fixture.id}`)).response || [];
  const t = st.find(x => x.team.name.toLowerCase().includes(team));
  if (t) {
    const m = Object.fromEntries(t.statistics.map(s => [s.type, s.value]));
    const now = { el, shots: +m['Total Shots'] || 0, sot: +m['Shots on Goal'] || 0, cor: +m['Corner Kicks'] || 0 };
    hist.push(now);
    const base = hist.filter(h => h.el <= el - 6).pop();
    if (base) {
      const d = { shots: now.shots - base.shots, sot: now.sot - base.sot, cor: now.cor - base.cor };
      if (d.sot >= 1 || d.shots >= 2 || d.cor >= 2) { console.log(`ALARM: ${t.team.name} naciska — od ${base.el}' do ${el}': strzały +${d.shots}, celne +${d.sot}, rożne +${d.cor} (wynik ${sc})`); process.exit(0); }
    }
    console.log(`${new Date().toLocaleTimeString('pl-PL')} ${el}' ${sc} ${t.team.name}: strzały ${now.shots} celne ${now.sot} rożne ${now.cor}`);
  }
  await new Promise(r => setTimeout(r, 120_000));
}
