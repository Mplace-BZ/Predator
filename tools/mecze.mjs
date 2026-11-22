#!/usr/bin/env node
// Skan meczów na żywo pod rozmowę z Claude (plan darmowy api-football).
// Użycie: node tools/mecze.mjs "Marseille" "Atalanta" "Getafe"
// Dla każdego meczu: wynik, minuta, gole, czerwone kartki, xG i strzały,
// forma, minuty goli w sezonie, kursy na żywo, pogoda + szansa gola słabszej / silniejszej drużyny.
// Limit darmowy: 100 zapytań/dzień, ~10/min → 4 zapytania na mecz + 1 na listę live.

const KEY = '3821c5caa752d0533003cfa14a4c2650'; // ten sam klucz jest publicznie w index.html
const B = 'https://v3.football.api-sports.io';
const GAP_MS = 6500; // odstęp między zapytaniami (limit na minutę)
let last = 0;

async function af(path) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(B + path, { headers: { 'x-apisports-key': KEY } });
  const j = await r.json();
  const err = j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length);
  if (err) throw new Error(path + ' → ' + JSON.stringify(j.errors));
  return j;
}

const pois = lam => 1 - Math.exp(-lam);
const pct = x => Math.round(x * 100) + '%';

async function weather(city) {
  try {
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)).json();
    const p = g.results?.[0]; if (!p) return 'brak';
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,precipitation,wind_speed_10m`)).json();
    const c = w.current;
    return `${c.temperature_2m}°C, opad ${c.precipitation} mm, wiatr ${c.wind_speed_10m} km/h`;
  } catch { return 'brak'; }
}

function minutes(m) {
  return Object.entries(m || {}).filter(([k]) => !k.startsWith('106'))
    .map(([k, v]) => `${k}:${v.total ?? 0}`).join(' ');
}

async function one(f) {
  const id = f.fixture.id, el = f.fixture.status.elapsed ?? 0, st = f.fixture.status.short;
  const H = f.teams.home.name, A = f.teams.away.name, gh = f.goals.home, ga = f.goals.away;
  const [stats, ev, pr, od] = [await af(`/fixtures/statistics?fixture=${id}`), await af(`/fixtures/events?fixture=${id}`),
    await af(`/predictions?fixture=${id}`), await af(`/odds/live?fixture=${id}`).catch(() => ({ response: [] }))];
  const S = {}; for (const t of stats.response) S[t.team.name] = Object.fromEntries(t.statistics.map(s => [s.type, s.value]));
  const xg = n => parseFloat(S[n]?.expected_goals) || null;
  const p = pr.response[0], th = p?.teams.home, ta = p?.teams.away;
  const out = [];
  out.push(`\n=== ${H} ${gh}:${ga} ${A} | ${el}' ${st} | ${f.league.name} | ${f.fixture.venue?.name}, ${f.fixture.venue?.city}`);
  out.push('Zdarzenia: ' + (ev.response.filter(e => e.type === 'Goal' || /Red/.test(e.detail)).map(e => `${e.time.elapsed}' ${e.team.name} ${e.detail}`).join(' · ') || 'brak'));
  for (const n of [H, A]) { const s = S[n] || {}; out.push(`  ${n}: xG ${s.expected_goals ?? '-'} · strzały ${s['Total Shots'] ?? '-'} (celne ${s['Shots on Goal'] ?? '-'}) · w polu karnym ${s['Shots insidebox'] ?? '-'} · posiadanie ${s['Ball Possession'] ?? '-'} · rożne ${s['Corner Kicks'] ?? '-'} · czerwone ${s['Red Cards'] ?? 0}`); }
  if (p) {
    for (const t of [th, ta]) {
      const L = t.league;
      out.push(`  ${t.name}: forma liga ${(L.form || '').slice(-6)} · ost.5: strzela ${t.last_5.goals.for.average}, traci ${t.last_5.goals.against.average} · sezon ${L.fixtures.played.total} m. ${L.goals.for.total.total}:${L.goals.against.total.total}`);
      out.push(`     gole strzelone wg minut: ${minutes(L.goals.for.minute)}`);
      out.push(`     gole stracone wg minut:  ${minutes(L.goals.against.minute)}`);
    }
  }
  // Model: tempo xG w meczu (50%) + forma ost. 5 (50%), pozostały czas + ~4 min doliczonego
  const rem = Math.max(0, (el < 45 && st !== 'HT' ? 45 + 47 - el : 94 - el));
  for (const [t, opp, n] of [[th, ta, H], [ta, th, A]]) {
    if (!t) continue;
    const form = Math.sqrt(parseFloat(t.last_5.goals.for.average) * parseFloat(opp.last_5.goals.against.average)) / 90;
    const live = el > 15 && xg(n) != null ? xg(n) / el : form;
    const lam = (live + form) / 2 * rem;
    out.push(`  Szansa: ${n} strzeli jeszcze gola ≈ ${pct(pois(lam))} (tylko gra dziś ${pct(pois(live * rem))}, tylko forma ${pct(pois(form * rem))}, zostało ~${rem}')`);
  }
  // Tryb agresywny (prośba Chrisa 2026-11-22): czy PRZEGRYWAJĄCY strzeli — nie "czy kurs się opłaca".
  // Sygnały: gra przegrywającego ≥80% xG prowadzącego (anomalia: wynik ≠ gra), przewaga 2+ goli
  // po 60' (prowadzący odpuszcza/zmienia), końcówka 75'+ przy 1 golu różnicy (przegrywający rzuca się).
  if (gh !== ga && gh != null) {
    const [tr, ld] = gh < ga ? [H, A] : [A, H];
    const diff = Math.abs(gh - ga), why = [];
    const xt = xg(tr), xl = xg(ld);
    if (xt != null && xl != null && xt >= 0.8 * xl) why.push(`xG ${xt} vs ${xl} — gra lepiej niż wynik`);
    if (diff >= 2 && el >= 60) why.push(`prowadzący +${diff} po 60' — odpuszcza`);
    if (diff === 1 && el >= 75) why.push(`1 gol różnicy w ${el}' — rzuca się do przodu`);
    const sot = S[tr]?.['Shots on Goal'] ?? 0;
    if (sot === 0 && el >= 40) why.push(`ale 0 celnych strzałów`);
    const pos = why.filter(w => !w.startsWith('ale')).length, dead = sot === 0 && el >= 40;
    const verdict = pos >= 1 && !dead ? (pos >= 2 ? '🔥 TAK' : 'TAK (ryzykownie)') : 'NIE';
    out.push(`  AGRESYWNIE — ${tr} strzeli: ${verdict}${why.length ? ' · ' + why.join(' · ') : ''}`);
  }
  const want = /Team Score a Goal|Team Goals|Which team will score|Both Teams to Score$|Last Team to Score|Match Goals/;
  for (const r of od.response) for (const b of r.odds) if (want.test(b.name))
    out.push(`  Kurs ${b.name}: ` + b.values.filter(v => !v.suspended).slice(0, 6).map(v => `${v.value}${v.handicap ? ' ' + v.handicap : ''} @${v.odd}`).join(' | '));
  if (!od.response.length) out.push('  Kursy na żywo: brak');
  out.push('  Pogoda: ' + await weather(f.fixture.venue?.city || ''));
  return out.join('\n');
}

const names = process.argv.slice(2).map(s => s.toLowerCase());
const live = await af('/fixtures?live=all');
const hits = live.response.filter(f => !names.length || names.some(n => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
const miss = names.filter(n => !hits.some(f => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
console.log(`Live: ${live.response.length} meczów, wybrane: ${hits.length}` + (miss.length ? ` · nie znaleziono: ${miss.join(', ')}` : ''));
for (const f of hits) { try { console.log(await one(f)); } catch (e) { console.log(`\n=== ${f.teams.home.name}-${f.teams.away.name}: BŁĄD ${e.message}`); } }
