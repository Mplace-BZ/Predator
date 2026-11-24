#!/usr/bin/env node
// Skaner „🔴 BET”: co 60 s przegląda wszystkie mecze z kursami na żywo (1 zapytanie /odds/live + 1 /fixtures?live=all).
// Kończy się (budzi Claude), gdy kurs na „kolejny gol w meczu” jest ≥1,90 i wyższy od uczciwego po podatku 12%.
// Szansa: Poisson, średnia 2,7 gola/90' mieszana z tempem meczu (tylko w górę), pozostały czas do 93'.
// Pomija: kraje bez STS, mecze już ogłoszone (--bez=fixtureId,...), wynik różnicą 3+ (prowadzący odpuszcza).
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const NO_STS = ['Russia', 'Belarus', 'Iran'];
const skip = new Set(((process.argv.find(a => a.startsWith('--bez=')) || '').slice(6)).split(',').filter(Boolean).map(Number));
const af = async p => { for (let k = 0; k < 3; k++) { try { return (await (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json()).response || []; } catch { await new Promise(r => setTimeout(r, 10_000)); } } return []; };

for (let i = 0; i < 240; i++) {
  const live = await af('/fixtures?live=all'), L = Object.fromEntries(live.map(f => [f.fixture.id, f]));
  const hits = [];
  for (const o of await af('/odds/live')) {
    const f = L[o.fixture.id]; if (!f || skip.has(f.fixture.id) || NO_STS.includes(f.league.country)) continue;
    const st = f.fixture.status.short, el = f.fixture.status.elapsed || 0; if (!['1H', '2H'].includes(st)) continue;
    const gh = f.goals.home, ga = f.goals.away, g = gh + ga; if (Math.abs(gh - ga) >= 3) continue;
    const mg = (o.odds.find(b => b.id === 25)?.values || []).find(v => v.value === 'Over' && +v.handicap === g + 0.5 && !v.suspended); if (!mg) continue;
    const odd = +mg.odd, base = 2.7, tempo = el >= 20 ? Math.min(6, g / el * 90) : base, rate = tempo > base ? (base + tempo) / 2 : base;
    const p = 1 - Math.exp(-rate * Math.max(1, 93 - el) / 90), need = 1 / (p * 0.88);
    if (odd >= 1.9 && odd >= need) hits.push({ f, el, odd, need, p });
  }
  if (hits.length) {
    hits.sort((a, b) => b.odd / b.need - a.odd / a.need);
    for (const h of hits.slice(0, 3)) console.log(`BET: ${h.f.league.country} ${h.f.league.name} | ${h.f.teams.home.name} ${h.f.goals.home}:${h.f.goals.away} ${h.f.teams.away.name} (${h.el}') | kolejny gol (+${h.f.goals.home + h.f.goals.away}.5) kurs ${h.odd} · opłaca się od ${h.need.toFixed(2)} · szansa ${Math.round(h.p * 100)}% · id ${h.f.fixture.id}`);
    process.exit(0);
  }
  console.log(`${new Date().toLocaleTimeString('pl-PL')} brak okazji (${live.length} meczów)`);
  await new Promise(r => setTimeout(r, 60_000));
}
