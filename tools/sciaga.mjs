#!/usr/bin/env node
// Ściąga meczowa na dziś: 3 koszyki (MUSZĄ / SZANSA / RYZYKO), lokalny plik HTML.
// Użycie: node tools/sciaga.mjs [YYYY-MM-DD]  → sciaga/index.html (poza gitem — repo jest publiczne)
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const DATE = process.argv[2] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const LEAGUES = { 2: ['⭐', 'Liga Mistrzów'], 135: ['🇮🇹', 'Serie A'], 136: ['🇮🇹', 'Serie B'], 40: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Championship'], 39: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Premier League'], 41: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'League One'], 179: ['🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Szkocja'], 3: ['🟠', 'Liga Europy'], 848: ['🟢', 'Liga Konferencji'] };
let last = 0;
async function af(p) {
  const w = last + 250 - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); last = Date.now();
  return (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json();
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = x => (x == null || x === '' ? null : +x);

async function weather(city, iso) {
  try {
    // Kilka wyników → bierzemy największe miasto w Europie (Como we Włoszech, a nie w USA)
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.split(',')[0])}&count=10`)).json();
    const eu = (g.results || []).filter(r => r.latitude > 34 && r.latitude < 72 && r.longitude > -25 && r.longitude < 45);
    const p = (eu.length ? eu : g.results || []).sort((a, b) => (b.population || 0) - (a.population || 0))[0]; if (!p) return null;
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=UTC&start_date=${iso.slice(0, 10)}&end_date=${iso.slice(0, 10)}`)).json();
    const i = new Date(iso).getUTCHours();
    return { t: Math.round(w.hourly.temperature_2m[i]), rain: w.hourly.precipitation[i], wind: Math.round(w.hourly.wind_speed_10m[i]) };
  } catch { return null; }
}

// 1. Mecze dnia
const fx = (await af(`/fixtures?date=${DATE}&timezone=Europe/Warsaw`)).response
  .filter(f => LEAGUES[f.league.id] && ['NS', 'TBD'].includes(f.fixture.status.short))
  .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));

// 2. Tabele
const table = {};
for (const lg of [...new Set(fx.map(f => `${f.league.id}|${f.league.season}`))]) {
  const [id, season] = lg.split('|');
  const st = (await af(`/standings?league=${id}&season=${season}`)).response?.[0]?.league?.standings || [];
  for (const grp of st) for (const t of grp) table[`${id}|${t.team.id}`] = { rank: t.rank, n: grp.length, pts: t.points, form: t.form || '' };
}

// 3. Kto MUSI (Liga Mistrzów: top 8 = 1/8, 9-24 = baraż, 25+ = odpada)
function must(lid, teamId) {
  const t = table[`${lid}|${teamId}`]; if (!t || lid !== 2) return null;
  if (t.rank >= 20 && t.rank <= 30) return `MUSI (${t.rank}. — walka o top 24)`;
  if (t.rank >= 6 && t.rank <= 11) return `walczy o top 8 (${t.rank}.)`;
  return null;
}

const rows = [];
for (const f of fx) {
  const [flag, lname] = LEAGUES[f.league.id];
  const H = f.teams.home, A = f.teams.away;
  const pr = (await af(`/predictions?fixture=${f.fixture.id}`)).response?.[0];
  const od = (await af(`/odds?fixture=${f.fixture.id}`)).response?.[0];
  const bk = od?.bookmakers?.find(b => b.name === 'Bet365') || od?.bookmakers?.[0];
  const bet = id => bk?.bets?.find(b => b.id === id)?.values || [];
  const o1 = num(bet(1).find(v => v.value === 'Home')?.odd), ox = num(bet(1).find(v => v.value === 'Draw')?.odd), o2 = num(bet(1).find(v => v.value === 'Away')?.odd);
  const ou = num(bet(5).find(v => v.value === 'Over 2.5')?.odd), btts = num(bet(8).find(v => v.value === 'Yes')?.odd);
  const hl = pr?.teams.home.league, al = pr?.teams.away.league;
  const hGF = num(hl?.goals.for.average.home), hGA = num(hl?.goals.against.average.home), aGF = num(al?.goals.for.average.away), aGA = num(al?.goals.against.average.away);
  const avgGoals = [hGF, hGA, aGF, aGA].every(x => x != null) ? (hGF + aGA + aGF + hGA) / 2 : null;
  const tH = table[`${f.league.id}|${H.id}`], tA = table[`${f.league.id}|${A.id}`];
  const mH = must(f.league.id, H.id), mA = must(f.league.id, A.id);
  const wx = await weather(f.fixture.venue?.city || '', f.fixture.date);

  // Koszyk: MUSZĄ > RYZYKO > SZANSA > reszta
  let tier = 'reszta', plan = '';
  const awayFav = o2 && o1 && o2 < o1 && o2 <= 2.1;
  if (mH || mA) {
    tier = 'must';
    const who = mH && /MUSI/.test(mH) ? H.name : mA && /MUSI/.test(mA) ? A.name : mH ? H.name : A.name;
    plan = `Gdy ${who} nie wygrywa po 60' → gol ${who}`;
  } else if (awayFav && (hGF ?? 0) >= 1.0) {
    tier = 'ryzyko';
    plan = `Gdy ${A.name} prowadzi → gol ${H.name}`;
  } else if ((ou && ou <= 1.62) || (avgGoals && avgGoals >= 3.0)) {
    tier = 'szansa';
    plan = '0:0 lub 1:1 po 55\' → padnie gol (~1,9)';
  }
  rows.push({ time: f.fixture.date.slice(11, 16), flag, lname, H: H.name, A: A.name, tH, tA, mH, mA, avgGoals, o1, ox, o2, ou, btts, wx, tier, plan });
}

// 4. HTML
const f2 = x => (x == null ? '–' : x.toFixed(2).replace('.', ','));
const f1 = x => (x == null ? '–' : x.toFixed(1).replace('.', ','));
const pos = t => (t ? `${t.rank}.` : '–');
const wxs = w => !w ? '–' : `${w.rain >= 0.5 ? '🌧' : w.wind >= 30 ? '💨' : '☁️'} ${w.t}° · ${w.wind} km/h`;
const goalsCls = g => (g == null ? '' : g >= 3.2 ? 'hot' : g >= 2.7 ? 'warm' : '');
const tiers = [
  ['must', '🔥 MUSZĄ — tu gramy', 'Drużyna musi wygrać (tabela). Gramy jej gola, gdy nie wygrywa.'],
  ['szansa', '🟢 SZANSA — dużo goli', 'Wysoka średnia goli albo niski kurs na +2,5. Gramy „padnie gol” w 2. połowie.'],
  ['ryzyko', '🎲 RYZYKO — nasza strategia', 'Faworyt na wyjeździe, gospodarz strzela u siebie. Gdy faworyt prowadzi → gol gospodarza.'],
  ['reszta', '👀 Reszta — tylko obserwuj', ''],
];
const section = ([key, title, sub]) => {
  const rs = rows.filter(r => r.tier === key); if (!rs.length) return '';
  return `<section class="tier ${key}"><h2>${title} <span>${rs.length}</span></h2>${sub ? `<p class="sub">${sub}</p>` : ''}
<table><thead><tr><th>Godz.</th><th>Liga</th><th>Mecz</th><th>Tabela</th><th title="Średnia goli w ich meczach (dom/wyjazd)">Gole Ø</th><th>1 · X · 2</th><th>+2,5</th><th>Obie</th><th>Pogoda</th>${key === 'reszta' ? '' : '<th>👉 Plan na żywo</th>'}</tr></thead><tbody>
${rs.map(r => `<tr>
<td class="time">${r.time}</td>
<td class="lg">${r.flag} ${esc(r.lname)}</td>
<td class="match"><b>${esc(r.H)}</b> – <b>${esc(r.A)}</b>${r.mH ? `<div class="mustnote">${esc(r.H)}: ${esc(r.mH)}</div>` : ''}${r.mA ? `<div class="mustnote">${esc(r.A)}: ${esc(r.mA)}</div>` : ''}</td>
<td class="num">${pos(r.tH)} vs ${pos(r.tA)}</td>
<td class="num ${goalsCls(r.avgGoals)}">${f1(r.avgGoals)}</td>
<td class="num odds">${f2(r.o1)} · ${f2(r.ox)} · ${f2(r.o2)}</td>
<td class="num">${f2(r.ou)}</td>
<td class="num">${f2(r.btts)}</td>
<td class="wx">${wxs(r.wx)}</td>
${key === 'reszta' ? '' : `<td class="plan">${esc(r.plan)}</td>`}
</tr>`).join('')}</tbody></table></section>`;
};
const updated = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ściąga ${DATE} · Match Predator</title>
<style>
:root{--bg:#0d0f12;--card:#16191e;--line:#262a31;--text:#e9ecf1;--dim:#9aa3af;--acc:#FF5A1F;--pos:#4ADE80;--warn:#FFB347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 Manrope,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
header{padding:16px 24px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
header h1{margin:0;font-size:20px}header h1 b{color:var(--acc)}header .meta{color:var(--dim);font-size:12px}
.rules{display:flex;gap:8px;flex-wrap:wrap;padding:12px 24px}.rules span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:var(--dim)}
.rules b{color:var(--text)}
.tier{--akc:var(--line);margin:16px 24px 24px;background:color-mix(in srgb,var(--akc) 7%,var(--card));border:1px solid color-mix(in srgb,var(--akc) 26%,var(--line));border-radius:12px;overflow-x:auto}
.tier.must{--akc:var(--acc)}.tier.szansa{--akc:var(--pos)}.tier.ryzyko{--akc:var(--warn)}.tier.reszta{opacity:.7}
.tier h2{margin:0;padding:12px 16px;font-size:16px;border-bottom:1px solid var(--line)}.tier h2 span{color:var(--dim);font-weight:400;font-size:13px}
.sub{margin:0;padding:8px 16px;color:var(--dim);font-size:12px;border-bottom:1px solid var(--line)}
table{width:100%;min-width:760px;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);padding:8px 12px;font-weight:600}
td{padding:10px 12px;border-top:1px solid var(--line);vertical-align:top}tr:hover td{background:rgba(255,255,255,.03)}
.time{font-size:18px;font-weight:700;color:var(--acc)}.lg{white-space:nowrap;color:var(--dim)}.match b{font-weight:700}
.mustnote{color:var(--acc);font-size:12px;font-weight:600;margin-top:2px}.num{white-space:nowrap}.odds{color:var(--dim)}
.hot{color:var(--acc);font-weight:700}.warm{color:var(--warn);font-weight:600}.wx{white-space:nowrap;color:var(--dim);font-size:12px}
.plan{font-weight:600;color:var(--pos)}
@media(max-width:900px){.wx,.odds{display:none}th:nth-child(6),th:nth-child(9){display:none}}
footer{padding:16px 24px 32px;color:var(--dim);font-size:12px}
</style></head><body>
<header><h1>📋 Ściąga <b>${DATE}</b></h1><span class="meta">${rows.length} meczów · dane api-football (kursy Bet365, przedmeczowe) · odświeżono ${updated}</span></header>
<div class="rules"><span>🔥 nacisk = <b>alarm w czacie</b></span><span>🟥 czerwona prowadzącego po 75' = <b>gol przegrywającego</b></span><span>📊 kurs ok. <b>1,9</b></span><span>⏱ wchodzisz po 80' = <b>grasz do końca</b></span><span>Gole Ø: <b style="color:#FF5A1F">≥3,2</b> · <b style="color:#FFB347">≥2,7</b></span></div>
${tiers.map(section).join('')}
<footer>Kursy przedmeczowe — na żywo sprawdzaj w STS. Średnie goli z bieżącego sezonu (mała próba na początku sezonu). Odśwież: w czacie napisz „odśwież ściągę”.</footer>
</body></html>`;
mkdirSync(new URL('../sciaga/', import.meta.url), { recursive: true });
writeFileSync(new URL('../sciaga/index.html', import.meta.url), html);
console.log(`gotowe: sciaga/index.html · ${rows.length} meczów · must ${rows.filter(r => r.tier === 'must').length}, szansa ${rows.filter(r => r.tier === 'szansa').length}, ryzyko ${rows.filter(r => r.tier === 'ryzyko').length}`);
