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

// Odsetek: przegrywający strzeli jeszcze gola (research/analiza-tez.mjs, 3849 meczów 2025)
const HIST = { 1: { 55: .46, 60: .43, 65: .39, 70: .35, 75: .31, 80: .26 }, 2: { 55: .44, 60: .39, 65: .35, 70: .30, 75: .25, 80: .21 }, 3: { 55: .40, 60: .34, 65: .30, 70: .25, 75: .20, 80: .15 } };
function histTrail(el, diff, ldRed) {
  if (el < 53) return null;
  const m = [55, 60, 65, 70, 75, 80].reduce((b, x) => Math.abs(x - el) < Math.abs(b - el) ? x : b, 55);
  const p = HIST[Math.min(diff, 3)][m];
  return ldRed && el >= 70 && diff <= 2 ? p + 0.10 : p;
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
    FAST ? { response: [] } : await af(`/predictions?fixture=${id}`),
    FAST ? { response: [] } : await af(`/odds/live?fixture=${id}`).catch(() => ({ response: [] }))];
  const S = {}; for (const t of stats.response) S[t.team.name] = Object.fromEntries(t.statistics.map(s => [s.type, s.value]));
  const xg = n => parseFloat(S[n]?.expected_goals) || null;
  const p = pr.response[0], th = p?.teams.home, ta = p?.teams.away;
  const out = [];
  out.push(`\n=== ${H} ${gh}:${ga} ${A} | ${el}' ${st} | ${f.league.name} | ${f.fixture.venue?.name}, ${f.fixture.venue?.city}`);
  out.push('Zdarzenia: ' + (ev.response.filter(e => e.type === 'Goal' || /Red/.test(e.detail)).map(e => `${e.time.elapsed}' ${e.team.name} ${e.detail}`).join(' · ') || 'brak'));
  for (const n of [H, A]) { const s = S[n] || {}; out.push(`  ${n}: xG ${s.expected_goals ?? '-'} · strzały ${s['Total Shots'] ?? '-'} (celne ${s['Shots on Goal'] ?? '-'}) · w polu karnym ${s['Shots insidebox'] ?? '-'} · posiadanie ${s['Ball Possession'] ?? '-'} · rożne ${s['Corner Kicks'] ?? '-'} · czerwone ${s['Red Cards'] ?? 0}`); }
  // Trend od poprzedniego skanu (lekcja 2026-11-23 Neftchi-Al-Hilal: typowałem Al-Hilal, a w 2. połowie
  // miał 1 strzał i 0 celnych). API daje tylko sumy z całego meczu, więc różnicę liczymy między skanami.
  {
    const snap = n => ({ el, shots: +S[n]?.['Total Shots'] || 0, sot: +S[n]?.['Shots on Goal'] || 0, cor: +S[n]?.['Corner Kicks'] || 0, xg: xg(n) || 0 });
    // Preferuj oś czasu z tools/sledz.mjs: odczyt sprzed ~10 min (najpóźniejszy z el <= teraz-10)
    let prev = CACHE[id];
    try {
      const tl = JSON.parse(readFileSync(new URL('./.sledz.json', import.meta.url), 'utf8'))[id]?.t || [];
      const old = tl.filter(x => x.el <= el - 10).pop();
      if (old) prev = { el: old.el, [H]: old[H], [A]: old[A] };
    } catch {}
    if (prev && prev.el < el) {
      for (const n of [H, A]) {
        const a = prev[n], b = snap(n); if (!a) continue;
        const d = { shots: b.shots - a.shots, sot: b.sot - a.sot, cor: b.cor - a.cor, xg: +(b.xg - a.xg).toFixed(2) };
        const dead = el - prev.el >= 10 && d.sot === 0 && d.shots <= 1 ? '  ⚠️ NIE ATAKUJE — nie typuj jej gola' : (el - prev.el < 10 ? '  (okno <10 min — za krótkie na wniosek)' : '');
        out.push(`  Od ${prev.el}' do ${el}': ${n} strzały +${d.shots} (celne +${d.sot}) · rożne +${d.cor} · xG +${d.xg}${dead}`);
      }
    } else out.push('  Trend: brak poprzedniego skanu — uruchom skan ponownie za kilka minut, żeby zobaczyć, kto naciska TERAZ');
    CACHE[id] = { el, [H]: snap(H), [A]: snap(A) };
  }
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
    // Teza "prowadzący +2/+3 odpuszcza" NIE potwierdziła się na 3849 meczach 2025 (im większa strata, tym rzadziej
    // przegrywający strzela) — nie jest już sygnałem. Potwierdziła się czerwona kartka prowadzącego od 75'.
    const ldRed = ev.response.some(e => /Red/.test(e.detail) && e.team.name === ld) && !ev.response.some(e => /Red/.test(e.detail) && e.team.name === tr);
    if (ldRed && el >= 70) why.push(`prowadzący gra w osłabieniu (historycznie +10 pkt proc.)`);
    if (diff === 1 && el >= 75) why.push(`1 gol różnicy w ${el}' — rzuca się do przodu`);
    const hasStats = S[tr] && S[tr]['Shots on Goal'] != null, sot = hasStats ? +S[tr]['Shots on Goal'] : null;
    if (hasStats && sot === 0 && el >= 40) why.push(`ale 0 celnych strzałów`);
    if (!hasStats) why.push('BRAK STATYSTYK z meczu — typ tylko z wyniku i czasu');
    const pos = why.filter(w => !w.startsWith('ale') && !w.startsWith('BRAK')).length, dead = hasStats && sot === 0 && el >= 40;
    const verdict = pos >= 1 && !dead ? (pos >= 2 ? '🔥 TAK' : 'TAK (ryzykownie)') : 'NIE';
    out.push(`  AGRESYWNIE — ${tr} strzeli: ${verdict}${why.length ? ' · ' + why.join(' · ') : ''}`);
    const hp = histTrail(el, diff, ldRed);
    if (hp) out.push(`  Historia (3849 meczów, 10 lig, 2025): przegrywający strzela w ${Math.round(hp * 100)}% → uczciwy kurs ${(1 / hp).toFixed(2)}`);
  }
  // Heurystyka Chrisa (2026-11-23): po golu kontaktowym (przegrywający zmniejsza stratę albo wyrównuje)
  // obie drużyny idą na maksa — mecz się otwiera, kolejny gol bardziej prawdopodobny.
  {
    let h = 0, a = 0, contact = null;
    for (const e of ev.response.filter(e => e.type === 'Goal' && !/Missed/.test(e.detail))) {
      const home = e.team.name === H, behind = home ? h < a : a < h;
      if (home) h++; else a++;
      contact = behind ? { min: e.time.elapsed, team: e.team.name } : null;
    }
    // Historia 2025: efekt słaby/niestabilny; wyraźny tylko 70-75' przy 1 golu różnicy (70% vs 56%, n=96).
    if (contact && el - contact.min <= 15)
      out.push(`  GOL KONTAKTOWY ${contact.min}' (${contact.team}) — ` + (Math.abs(gh - ga) === 1 && el >= 68 && el <= 78
        ? '🔥 70-75\' przy 1 golu różnicy: historycznie gol pada częściej (70% vs 56%)'
        : 'historycznie efekt słaby — nie traktuj jako pewniaka'));
  }
  const want = /Team Score a Goal|Team Goals|Which team will score|Both Teams to Score$|Last Team to Score|Match Goals/;
  for (const r of od.response) for (const b of r.odds) if (want.test(b.name))
    out.push(`  Kurs ${b.name}: ` + b.values.filter(v => !v.suspended).slice(0, 6).map(v => `${v.value}${v.handicap ? ' ' + v.handicap : ''} @${v.odd}`).join(' | '));
  if (!od.response.length && !FAST) out.push('  Kursy na żywo: brak');
  if (!FAST) out.push('  Pogoda: ' + await weather(f.fixture.venue?.city || ''));
  return out.join('\n');
}

import { readFileSync, writeFileSync } from 'node:fs';
const CACHE_FILE = new URL('./.mecze-cache.json', import.meta.url);
let CACHE = {}; try { CACHE = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch {}
process.on('exit', () => { try { writeFileSync(CACHE_FILE, JSON.stringify(CACHE)); } catch {} });

// --szybko: tylko statystyki + zdarzenia (2 zapytania na mecz) — do odświeżania trendu co kilka minut
const FAST = process.argv.includes('--szybko');
const names = process.argv.slice(2).filter(a => !a.startsWith('--')).map(s => s.toLowerCase());
const live = await af('/fixtures?live=all');
const hits = live.response.filter(f => !names.length || names.some(n => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
const miss = names.filter(n => !hits.some(f => (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase().includes(n)));
console.log(`Live: ${live.response.length} meczów, wybrane: ${hits.length}` + (miss.length ? ` · nie znaleziono: ${miss.join(', ')}` : ''));
for (const f of hits) { try { console.log(await one(f)); } catch (e) { console.log(`\n=== ${f.teams.home.name}-${f.teams.away.name}: BŁĄD ${e.message}`); } }
