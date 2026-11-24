#!/usr/bin/env node
// Ściąga meczowa na dziś: 3 koszyki (MUSZĄ / SZANSA / RYZYKO), lokalny plik HTML.
// Użycie: node tools/sciaga.mjs [YYYY-MM-DD]  → sciaga/index.html (poza gitem — repo jest publiczne)
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const ARGS = process.argv.slice(2), PLUS = (ARGS.find(a => a.startsWith('--plus=')) || '').slice(7).split(',').filter(Boolean);
const DATE = ARGS.find(a => /^\d{4}-\d\d-\d\d$/.test(a)) || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
// [kod flagi flagcdn | null = logo ligi, KRAJ, nazwa ligi]
const LEAGUES = { 2: ['eu', 'EUROPA', 'Liga Mistrzów'], 135: ['it', 'WŁOCHY', 'Serie A'], 136: ['it', 'WŁOCHY', 'Serie B'], 40: ['gb-eng', 'ANGLIA', 'Championship'], 39: ['gb-eng', 'ANGLIA', 'Premier League'], 41: ['gb-eng', 'ANGLIA', 'League One'], 179: ['gb-sct', 'SZKOCJA', 'Premiership'], 3: ['eu', 'EUROPA', 'Liga Europy'], 848: ['eu', 'EUROPA', 'Liga Konferencji'] };
let last = 0;
const CF = new URL('./.sciaga-cache.json', import.meta.url), cache = existsSync(CF) ? JSON.parse(readFileSync(CF, 'utf8')) : {};
const TTL = p => /^\/(standings|predictions|odds|injuries|fixtures\?team|fixtures\/headtohead)/.test(p) ? 6 * 3600e3 : /^\/fixtures\?date/.test(p) ? 5 * 60e3 : 0;
async function af(p) {
  const ttl = TTL(p), c = cache[p]; if (ttl && c && Date.now() - c.ts < ttl) return c.j;
  const w = last + 400 - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); last = Date.now();
  const j = await (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json();
  const err = j.errors && Object.keys(j.errors).length; if (err) { console.error('API błąd:', JSON.stringify(j.errors)); const es = JSON.stringify(j.errors); if (/per minute/i.test(es)) { await new Promise(r => setTimeout(r, 61e3)); return af(p); } if (/limit/i.test(es)) { console.error('STOP: wyczerpany dzienny limit API — nie nadpisuję ściągi.'); process.exit(2); } }
  if (ttl && !err) { cache[p] = { ts: Date.now(), j }; writeFileSync(CF, JSON.stringify(cache)); }
  return j;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = x => (x == null || x === '' ? null : +x);

async function weather(city, iso) {
  try {
    // Kilka wyników → bierzemy największe miasto w Europie (Como we Włoszech, a nie w USA)
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.split(',')[0])}&count=10`)).json();
    const eu = (g.results || []).filter(r => r.latitude > 34 && r.latitude < 72 && r.longitude > -25 && r.longitude < 45);
    const p = (eu.length ? eu : g.results || []).sort((a, b) => (b.population || 0) - (a.population || 0))[0]; if (!p) return null;
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=temperature_2m,precipitation,wind_speed_10m,cloud_cover&timezone=UTC&start_date=${iso.slice(0, 10)}&end_date=${iso.slice(0, 10)}`)).json();
    const i = new Date(iso).getUTCHours();
    return { t: Math.round(w.hourly.temperature_2m[i]), rain: w.hourly.precipitation[i], wind: Math.round(w.hourly.wind_speed_10m[i]), cloud: w.hourly.cloud_cover?.[i] ?? 50, night: i < 7 || i > 16 };
  } catch { return null; }
}

// 1. Mecze dnia
let fx = (await af(`/fixtures?date=${DATE}&timezone=Europe/Warsaw`)).response
  .filter(f => LEAGUES[f.league.id] && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(f.fixture.status.short))
  ;
// --plus=id,id → dodatkowe mecze spoza listy lig (np. test na żywo)
// Kraje, których STS (Polska) nie oferuje
const NO_STS = ['Russia', 'Belarus', 'Iran'];
if (PLUS.length) for (const f of (await af(`/fixtures?ids=${PLUS.join('-')}&timezone=Europe/Warsaw`)).response || []) {
  if (NO_STS.includes(f.league.country)) continue;
  LEAGUES[f.league.id] ||= [null, (f.league.country === 'World' ? 'ŚWIAT' : f.league.country).toUpperCase(), f.league.name];
  if (!fx.some(x => x.fixture.id === f.fixture.id)) fx.push(f);
}
fx.sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));

// 2. Tabele
const table = {};
for (const lg of [...new Set(fx.map(f => `${f.league.id}|${f.league.season}`))]) {
  const [id, season] = lg.split('|');
  const st = (await af(`/standings?league=${id}&season=${season}`)).response?.[0]?.league?.standings || [];
  for (const grp of st) for (const t of grp) table[`${id}|${t.team.id}`] = { rank: t.rank, n: grp.length, pts: t.points, form: t.form || '', desc: t.description || '', grp: grp };
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
  const [cc, country, lname] = LEAGUES[f.league.id];
  const flag = cc ? `https://flagcdn.com/w40/${cc}.png` : f.league.logo;
  const H = f.teams.home, A = f.teams.away;
  const pr = (await af(`/predictions?fixture=${f.fixture.id}`)).response?.[0];
  const od = (await af(`/odds?fixture=${f.fixture.id}`)).response?.[0];
  const bk = od?.bookmakers?.find(b => b.name === 'Bet365') || od?.bookmakers?.[0];
  const bet = id => bk?.bets?.find(b => b.id === id)?.values || [];
  const o1 = num(bet(1).find(v => v.value === 'Home')?.odd), ox = num(bet(1).find(v => v.value === 'Draw')?.odd), o2 = num(bet(1).find(v => v.value === 'Away')?.odd);
  const ou = num(bet(5).find(v => v.value === 'Over 2.5')?.odd), btts = num(bet(8).find(v => v.value === 'Yes')?.odd);
  const hl = pr?.teams.home.league, al = pr?.teams.away.league;
  const gfH = num(hl?.goals?.for?.average?.total), gfA = num(al?.goals?.for?.average?.total);
  // H2H: ostatnie 5 meczów między nimi (bilans gospodarza i średnia goli)
  const hh = ((await af(`/fixtures/headtohead?h2h=${f.teams.home.id}-${f.teams.away.id}&last=5`)).response || []).filter(x => x.goals.home != null);
  const h2h = hh.length ? (() => { let w = 0, d = 0, l = 0, g = 0; for (const x of hh) { const my = x.teams.home.id === f.teams.home.id ? x.goals.home : x.goals.away, th = x.teams.home.id === f.teams.home.id ? x.goals.away : x.goals.home; g += my + th; my > th ? w++ : my < th ? l++ : d++; } return { w, d, l, n: hh.length, avg: g / hh.length }; })() : null;
  const hGF = num(hl?.goals.for.average.home), hGA = num(hl?.goals.against.average.home), aGF = num(al?.goals.for.average.away), aGA = num(al?.goals.against.average.away);
  const avgGoals = [hGF, hGA, aGF, aGA].every(x => x != null) ? (hGF + aGA + aGF + hGA) / 2 : null;
  const tH = table[`${f.league.id}|${H.id}`], tA = table[`${f.league.id}|${A.id}`];
  const mH = must(f.league.id, H.id), mA = must(f.league.id, A.id);
  const wx = await weather(f.fixture.venue?.city || '', f.fixture.date);
  // Następny mecz drużyny: ważny mecz w ciągu 4 dni = ryzyko rotacji składu
  const nextBig = async tm => { const nx = (await af(`/fixtures?team=${tm.id}&next=2`)).response || []; const n = nx.find(x => x.fixture.id !== f.fixture.id && x.fixture.timestamp > f.fixture.timestamp);
    if (!n) return null; const days = (n.fixture.timestamp - f.fixture.timestamp) / 86400; const big = [2, 3, 848].includes(n.league.id) || n.league.type === 'Cup';
    return days <= 4 && big && n.league.id !== f.league.id ? `za ${Math.max(1, Math.round(days))} dni: ${n.league.name}` : null; };
  const rH = await nextBig(H), rA = await nextBig(A);
  // Braki kadrowe (kontuzje, zawieszenia) — tylko do mojej analizy, w ściądze w dymku
  const inj = (await af(`/injuries?fixture=${f.fixture.id}`)).response || [];
  const injOf = tm => inj.filter(x => x.team.id === tm.id).map(x => x.player.name);

  // Koszyk: MUSZĄ > RYZYKO > SZANSA > reszta
  let tier = 'reszta', plan = '';
  const awayFav = o2 && o1 && o2 < o1 && o2 <= 2.1 && o1 <= 4.5;
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
  rows.push({ gfH, gfA, h2h, rH, rA, iH: injOf(H), iA: injOf(A), fid: f.fixture.id, time: f.fixture.date.slice(11, 16), lid: f.league.id, flag, country, lname, H: H.name, A: A.name, hLogo: H.logo, aLogo: A.logo, tH, tA, mH, mA, avgGoals, o1, ox, o2, ou, btts, wx, tier, plan });
}

// 4. HTML — wygląd w stylu listy wyników (ligi z flagami, wiersz = mecz), filtr koszyków na górze
const f2 = x => (x == null ? '–' : x.toFixed(2).replace('.', ','));
const f1 = x => (x == null ? '–' : x.toFixed(1).replace('.', ','));
const IC = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  part: '<path d="M8 4.5v1M3.5 9h1M4.9 5.9l.7.7M11.1 5.9l-.7.7"/><path d="M5.6 11.3A3 3 0 1 1 10.7 8"/><path d="M7 19h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 12.5 3.25 3.25 0 0 0 7 19z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 11.5 3.25 3.25 0 0 0 7 18z"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 7.5 3.25 3.25 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>' };
const wxIcon = w => w.rain >= 0.3 ? 'rain' : w.wind >= 30 ? 'wind' : w.cloud >= 70 ? 'cloud' : w.cloud >= 25 ? 'part' : w.night ? 'moon' : 'sun';
const wxs = w => !w ? '' : `<span title="${w.rain >= 0.3 ? 'deszcz ' + w.rain + ' mm · ' : ''}wiatr ${w.wind} km/h · zachmurzenie ${w.cloud}%">${w.t}° <svg class="wi" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${IC[wxIcon(w)]}</svg></span>`;
const goalsCls = g => (g == null ? '' : g >= 3.2 ? 'hot' : g >= 2.7 ? 'warm' : '');
const TIER = { must: ['🔥', 'MUSZĄ'], szansa: ['🟢', 'SZANSA'], ryzyko: ['🎲', 'RYZYKO'], reszta: ['👀', 'RESZTA'] };
const cnt = k => rows.filter(r => r.tier === k).length;

// Grupy lig w kolejności pierwszego meczu
const groups = [];
for (const r of rows) { let g = groups.find(x => x.lid === r.lid); if (!g) groups.push(g = { lid: r.lid, flag: r.flag, country: r.country, lname: r.lname, rs: [] }); g.rs.push(r); }

const zone = t => { if (!t) return ''; const d = t.desc.toLowerCase(); return /relegation/.test(d) ? 'SPADEK' : t.rank === 1 && !/champions league|knockout|round of 16/.test(d) ? 'LIDER' : ''; };
const formH = t => t && t.form ? `<span class="fm" title="Forma: ostatnie 5 meczów (od najstarszego)">${[...t.form.slice(-5)].map(c => `<i class="${c}"></i>`).join('')}</span>` : '';
const team = (name, logo, t, m, rot, inj) => `<div class="team"><img src="${esc(logo)}" alt="" loading="lazy"><span class="tn"${inj && inj.length ? ` title="Nie zagrają (${inj.length}): ${esc(inj.join(', '))}"` : ''}><span class="nm">${esc(name)}</span>${formH(t)}${zone(t) ? `<span class="zn">${zone(t)}</span>` : ''}${rot ? `<span class="zn rot" title="${esc(rot)} — możliwa rotacja składu">ROTACJA?</span>` : ''}</span><span class="pos" title="Miejsce w tabeli">${t ? t.rank : ''}</span><span class="musi ${m && !/MUSI/.test(m) ? 'soft' : ''}">${m ? (/MUSI/.test(m) ? 'MUSI' : 'TOP 8') : ''}</span><button class="dot" title="1 klik = interesuje mnie (pomarańczowy), 2 = śledzę (zielony), 3 = obstawiłem (czerwony), 4 = wyłącz"></button></div>`;
const row = r => `<div class="m t-${r.tier}" data-tier="${r.tier}" data-fid="${r.fid}" data-g="${r.avgGoals ?? ''}" data-gfh="${r.gfH ?? ''}" data-gfa="${r.gfA ?? ''}" data-h="${esc(r.H)}" data-a="${esc(r.A)}" data-must="${esc(r.mH && /MUSI/.test(r.mH) ? r.H : r.mA && /MUSI/.test(r.mA) ? r.A : r.mH ? r.H : r.mA ? r.A : '')}" data-lg="${esc(r.country + ': ' + r.lname)}">
<button class="star" aria-label="Ulubiony">☆</button>
<div class="time" data-t="${r.time}">${r.time}</div>
<div class="teams">${team(r.H, r.hLogo, r.tH, r.mH, r.rH, r.iH)}${team(r.A, r.aLogo, r.tA, r.mA, r.rA, r.iA)}<button class="dot dm" title="Gol w meczu (dowolna drużyna): 1 klik = interesuje, 2 = śledzę, 3 = obstawiłem, 4 = wyłącz"></button></div>
<div class="gg" title="Kto naciska (ostatnie 10 min): lewo = gospodarze, prawo = goście, góra = równo"><svg viewBox="0 0 60 36" width="60" height="36"><path d="M10 27 A20 20 0 0 1 50 27" fill="none" stroke="#163d4b" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="3" x2="30" y2="9" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><text x="21" y="36" font-size="7.5" font-weight="700" fill="#8ba0a8">H</text><text x="34" y="36" font-size="7.5" font-weight="700" fill="#8ba0a8">V</text><g class="nd" style="transform:rotate(0deg);transform-origin:30px 27px;transition:transform .8s"><line x1="30" y1="27" x2="30" y2="11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g><circle cx="30" cy="27" r="2.5" fill="currentColor"/></svg></div>
<div class="sc"><div class="sr"><i></i><i></i><b>–</b></div><div class="sr"><i></i><i></i><b>–</b></div></div>
<div class="g ${goalsCls(r.avgGoals)}" title="Średnia goli na mecz w tym sezonie: mecze gospodarzy u siebie i gości na wyjeździe. Nie jest to prognoza na ten mecz.">${f1(r.avgGoals)}<small>śr. goli</small></div>
<div class="ow"><div class="odds"><span><i>1</i>${f2(r.o1)}</span><span><i>X</i>${f2(r.ox)}</span><span><i>2</i>${f2(r.o2)}</span><span><i>+2,5</i>${f2(r.ou)}</span></div><div class="lvo hide"><div class="lvr"></div><div class="lvc"><span class="cv"></span><input class="cst" inputmode="decimal" value="10" title="Stawka — zmień, przeliczy się"> zł <button class="ccb" title="Otwórz kalkulator"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/></svg></button></div></div></div>
<div class="wx">${wxs(r.wx)}</div>
<div class="plan">${r.h2h ? `<span class="h2" title="Ostatnie ${r.h2h.n} meczów między nimi: bilans ${esc(r.H)} (wygrane-remisy-porażki) i średnia goli">H2H ${r.h2h.w}-${r.h2h.d}-${r.h2h.l} · Ø ${r.h2h.avg.toFixed(1).replace('.', ',')} gola</span>` : ''}${r.tier === 'reszta' ? '' : `<span class="badge b-${r.tier}">${TIER[r.tier][0]} ${TIER[r.tier][1]}</span><span class="pt">${esc(r.plan)}</span>`}</div>
</div>`;
const league = g => `<section class="lg" data-lid="${g.lid}"><div class="lh"><button class="star" aria-label="Ulubiona liga">☆</button><img src="${esc(g.flag)}" alt=""><span><b>${esc(g.country)}:</b> ${esc(g.lname)}</span><span class="n">${g.rs.length}</span></div>${g.rs.map(row).join('')}</section>`;

const FAV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 38C8 24 20 16 30 2c2 9 6 12 11 8 2 6 7 8 13 3 0 7 4 10 8 14 2 10-4 20-16 26L20 58z" fill="#FF5A1F"/><path d="M16 36c2-9 10-14 16-22 1 6 4 8 8 5 2 5 6 6 10 3 1 6 4 9 6 12 0 7-5 13-14 17L22 54z" fill="#FFB347"/><circle cx="25" cy="40" r="20" fill="#fff" stroke="#00141e" stroke-width="2.6"/><path d="M25 31l7.6 5.5-2.9 9h-9.4l-2.9-9z" fill="#00141e"/><path d="M25 20v11M32.6 36.5l10-3.5M29.7 45.5l6 8.5M20.3 45.5l-6 8.5M17.4 36.5l-10-3.5" stroke="#00141e" stroke-width="2.3" fill="none"/></svg>';
const updated = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ściąga ${DATE}</title><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAV)}">
<style>
:root{--bg:#001e28;--panel:#00141e;--lh:#0b2a36;--line:#0e3442;--text:#e6eef0;--dim:#8ba0a8;--red:#ff0046;--acc:#FF5A1F;--pos:#4ADE80;--warn:#FFB347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.35 Manrope,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
.top{background:var(--panel);padding:14px 16px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.top h1{margin:0;font-size:18px;letter-spacing:.02em}.top h1 b{color:var(--acc)}.top .meta{color:var(--dim);font-size:12px}
.wrap{max-width:1500px;margin:0 auto;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.side{order:2;position:sticky;top:12px;background:var(--panel);border-radius:8px;overflow:hidden;max-height:calc(100vh - 24px);display:flex;flex-direction:column}
.side h3{margin:0;background:var(--lh);padding:10px 12px;font-size:13px;letter-spacing:.04em}.side .hl{overflow-y:auto}
.side .empty{color:var(--dim);font-size:12px;padding:14px 12px}
.hint{--k:var(--acc);margin:10px;padding:12px 14px;border-radius:10px;font-size:12px;background:color-mix(in srgb,var(--k) 16%,var(--panel));border:1px solid color-mix(in srgb,var(--k) 45%,transparent)}
.hint.k-g{--k:var(--pos)}.hint.k-y{--k:var(--warn)}.hint.k-r{--k:var(--red)}.hint.old{opacity:.5}
.hint.new{background:color-mix(in srgb,var(--k) 32%,var(--panel));animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--k) 40%,transparent)}}
.hint .tag{display:inline-block;background:var(--k);color:#00141e;font-weight:900;font-size:11px;letter-spacing:.06em;border-radius:999px;padding:2px 9px;margin-bottom:6px}
.side.hot h3{background:var(--acc);color:#fff}.side .empty b{color:var(--text)}
.toast{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9;background:var(--acc);color:#fff;font-weight:900;font-size:18px;padding:14px 22px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);animation:pulse 1.2s infinite;cursor:pointer;max-width:92vw}
.toast.goal{background:#22c55e;color:#00141e;animation:none}.toast small{display:block;font-weight:600;font-size:12px;opacity:.9}
.hint .ht{display:flex;align-items:flex-start;justify-content:space-between}.hint .hc{font-size:10px;font-weight:500;color:var(--dim);letter-spacing:.02em}.hint .rs{font-size:10px;letter-spacing:.04em;margin-right:6px}.hint .rs.ok{color:var(--pos)}.hint .rs.ko{color:var(--red)}.hint .hx{background:none;border:0;padding:0;margin-left:10px;color:var(--dim);font-size:15px;line-height:1;cursor:pointer;vertical-align:-1px}.hint .hx:hover{color:#fff}.hint .vt{float:right;display:inline-flex;gap:6px}.hint .vt button{background:none;border:0;padding:0;color:var(--dim);cursor:pointer;opacity:.7}.hint .vt button:hover{opacity:1}.hint .vt .vu.on{color:var(--pos);opacity:1}.hint .vt .vd.on{color:var(--red);opacity:1}.hint.old .vt{opacity:1}.hint .hk{margin-top:6px;font-size:12px;color:#fff}.hint .hk .stk{color:#fff}.hint .hk b{color:var(--warn)}.odds.lv span{color:#fff}.odds.lv i{color:var(--red)}.hint .hm{color:var(--dim)}.hint .ha{font-size:18px;font-weight:900;margin:2px 0 4px;color:#fff}.hint .hw{color:var(--text);opacity:.8}
.side h3{display:flex;align-items:center;gap:8px}.side .mn{display:none;margin-left:auto;background:none;border:0;color:inherit;font-size:18px;cursor:pointer;padding:0 4px}
@media(max-width:1100px){.wrap{grid-template-columns:1fr}
.side{position:fixed;right:10px;bottom:10px;top:auto;width:min(340px,calc(100vw - 20px));max-height:45vh;z-index:8;box-shadow:0 8px 30px rgba(0,0,0,.55);border:1px solid var(--line)}
.side h3{cursor:move;touch-action:none;user-select:none}.side .mn{display:block}.side.min .hl{display:none}.side.min{width:auto}.side.min h3 .tx{display:none}
footer{padding-bottom:45vh}}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}
.pills button{background:#0d2f3c;color:var(--text);border:2px solid transparent;border-radius:8px;padding:7px 14px;font:700 12px/1 inherit;letter-spacing:.06em;cursor:pointer}
.pills button.on{background:var(--red);border-color:#0b5cff}.pills small{opacity:.75;font-weight:600;margin-left:4px}
.lg{background:var(--panel);border-radius:8px;overflow:hidden;margin-bottom:12px}
.lh{display:flex;align-items:center;gap:10px;background:var(--lh);padding:8px 12px;font-size:13px;text-transform:uppercase;letter-spacing:.02em}
.lh img{width:22px;height:15px;object-fit:cover;border-radius:2px}.lh b{font-weight:800}.lh .n{margin-left:auto;color:var(--dim);font-size:12px}
.m{display:grid;grid-template-columns:28px 52px minmax(200px,1.4fr) 62px 76px 58px 220px 44px minmax(190px,1.2fr);align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--line)}
.m:hover{background:#062634}
.star{background:none;border:0;color:var(--dim);font-size:18px;cursor:pointer;padding:0;line-height:1}.star.on{color:#ffd400}
.time{color:var(--dim);font-weight:700;font-size:14px}
.teams{display:grid;grid-template-columns:18px minmax(0,max-content) auto auto 1fr;column-gap:8px;align-items:center}.team{display:contents}.team>*{height:24px;display:flex;align-items:center}.team img{height:18px;align-self:center}
.pos,.musi{justify-self:start;height:auto!important}.pos:empty,.musi:empty{visibility:hidden;padding:0}.dot{justify-self:end;height:8px!important}.team img{width:18px;height:18px;object-fit:contain}.tn{min-width:0;display:flex;align-items:center}.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pos{color:var(--dim);font-size:11px;background:#0d2f3c;border-radius:4px;padding:1px 0;width:24px;justify-content:center;text-align:center}
.musi{background:var(--red);color:#fff;font-size:10px;font-weight:800;border-radius:4px;padding:2px 6px;letter-spacing:.05em}.musi.soft{background:#0b5cff}
.g{text-align:center;font-weight:800;font-size:16px}.g small{display:block;font-size:10px;font-weight:500;color:var(--dim)}.g.hot{color:var(--acc)}.g.warm{color:var(--warn)}
.odds{display:flex;gap:4px;margin-left:10px}.odds span:last-child{margin-left:8px}.odds span{flex:1;background:#0d2f3c;border-radius:4px;text-align:center;padding:4px 0;font-weight:700;font-size:13px}.odds i{display:block;font-style:normal;font-size:10px;color:var(--dim);font-weight:500}
.wx{color:var(--dim);font-size:12px;text-align:center}
.plan{display:flex;flex-direction:column;gap:4px;font-size:12px}.pt{color:var(--text);font-weight:600}
.badge{align-self:flex-start;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.05em}
.b-must{background:color-mix(in srgb,var(--acc) 22%,transparent);color:var(--acc)}.b-szansa{background:color-mix(in srgb,var(--pos) 18%,transparent);color:var(--pos)}.b-ryzyko{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
.t-reszta{opacity:.55}
.hide{display:none!important}
.time small.add{cursor:pointer}.time small.ann{color:#fff;text-decoration:underline dotted}
.ow{display:flex;flex-direction:column;gap:5px}.lvo{font-size:10px;color:var(--dim)}.lvr{display:flex;gap:4px;margin-left:10px}.lvr u{flex:1;text-align:center}.lvr u:last-child{margin-left:8px}.lvr b{color:var(--red);font-size:9px;letter-spacing:.06em;margin-right:4px}.lvr u{text-decoration:none;color:#fff;font-weight:800}
.lvc{display:flex;align-items:center;gap:5px;margin:3px 0 0 10px}.lvc .cv{margin-right:auto;font-weight:700}.lvc .cv.ok{color:var(--pos)}.lvc .cv.ko{color:var(--red)}
.cst{width:34px;background:#0d2f3c;border:1px solid #2c4f5c;border-radius:4px;color:#fff;font:700 11px inherit;text-align:center;padding:1px 2px}.ccb{background:none;border:0;cursor:pointer;padding:0;color:#fff;opacity:.85;display:inline-flex}.ccb:hover{opacity:1}
.tb{background:#0d2f3c;color:var(--text);border:0;border-radius:8px;padding:6px 10px;font:700 12px inherit;cursor:pointer}
.cm{position:fixed;inset:0;background:rgba(0,10,15,.7);z-index:20;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh}
.cb{background:var(--panel);border:1px solid var(--line);border-radius:12px;width:min(460px,94vw);padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.ch{font-weight:800;font-size:16px;display:flex;justify-content:space-between;margin-bottom:12px}.ch button{background:none;border:0;color:var(--dim);font-size:18px;cursor:pointer}
.cb label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dim);margin-bottom:10px}
.cb input,.cb select{background:#0d2f3c;border:1px solid #2c4f5c;border-radius:8px;color:#fff;font:700 15px inherit;padding:8px 10px;outline:none}
.cg{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.cg label:first-child{grid-column:1/3}
.cr{border-top:1px solid var(--line);padding-top:12px;font-size:13px}.cr .v{font-size:20px;font-weight:900;margin-bottom:8px}.cr .ok{color:var(--pos)}.cr .ko{color:var(--red)}
.cr table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}.cr td,.cr th{padding:4px 6px;text-align:left;border-top:1px solid var(--line)}.cr th{color:var(--dim);font-weight:600}.cr .now td{color:#fff;font-weight:800}
.h2{font-size:10px;color:var(--dim);letter-spacing:.02em}
.dep{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);background:#0d2f3c;border-radius:8px;padding:4px 10px}.dep input{width:70px;background:transparent;border:0;border-bottom:1px solid #2c4f5c;color:#fff;font:800 15px/1.2 inherit;text-align:right;outline:none}
.fm{display:inline-flex;gap:2px;margin-left:8px;vertical-align:middle}.fm i{width:5px;height:5px;border-radius:1px;background:#3a5a66}.fm i.W{background:var(--pos)}.fm i.L{background:var(--red)}.fm i.D{background:#8ba0a8}
.zn{margin-left:6px;font-size:9px;font-weight:800;letter-spacing:.05em;color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);border-radius:4px;padding:0 4px}.zn.rot{color:var(--dim);border-color:#2c4f5c}
.wi{vertical-align:middle;margin-left:2px}.wx span{white-space:nowrap;display:inline-flex;align-items:center;gap:2px}
#hist{padding:0}#hist .hh{display:flex;gap:16px;align-items:baseline;background:var(--lh);padding:10px 12px;font-size:13px}#hist .hh b{font-size:18px}
#hist table{width:100%;border-collapse:collapse;font-size:12px}#hist td,#hist th{padding:8px 12px;border-top:1px solid var(--line);text-align:left}#hist th{color:var(--dim);font-weight:600;font-size:11px}
#hist .hr{background:none;border:0;padding:0;font:inherit;cursor:pointer;color:inherit}#hist .ok{color:var(--pos);font-weight:800}#hist .ko{color:var(--red);font-weight:800}#hist .wait{color:var(--dim)}#hist .empty{padding:14px 12px;color:var(--dim)}
.dot{margin-left:auto;flex:none;width:8px;height:8px;border-radius:50%;border:1px solid #2c4f5c;background:none;padding:0;cursor:pointer}
.teams{position:relative}.dot.dm{position:absolute;right:0;top:50%;transform:translateY(-50%);margin:0}.dot:focus{outline:none}.dot:hover{border-color:var(--dim)}.dot.o{background:var(--acc);border-color:var(--acc)}.dot.g{background:var(--pos);border-color:var(--pos)}.dot.r{background:var(--red);border-color:var(--red)}
.team:has(.dot.o) .tn{color:var(--acc)}.team:has(.dot.g) .tn{color:var(--pos)}.team:has(.dot.r) .tn{color:var(--red)}
.gg{color:#3a5a66;display:flex;justify-content:center}.gg.on{color:var(--dim)}.gg.na{opacity:.45;position:relative}.gg.na::after{content:'?';position:absolute;top:-2px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:var(--dim)}.gg.hot{color:var(--acc)}.gg svg{display:block}
.focus .m:not(.fv){opacity:.38}.focus .m:not(.fv):hover{opacity:.8}
.m.fv{opacity:1!important;background:color-mix(in srgb,#fff 4%,var(--panel))}.m.fv .tn{font-weight:800;color:#fff}.m.fv .star{color:#ffd400;font-size:22px}
.sc{display:flex;flex-direction:column;font-weight:800;font-size:15px;color:var(--dim)}.sr{display:flex;align-items:center;justify-content:flex-end;gap:2px;height:24px}
.sr i{font-style:normal;font-size:11px;font-weight:600;color:var(--dim);width:18px;text-align:center}.sr b{width:24px;text-align:center;border-radius:4px;line-height:20px}
.sr b.last{background:#163d4b;color:#fff}.time small{display:block;font-size:10px;font-weight:600;color:var(--warn);margin-top:2px;white-space:nowrap}
.live .time{color:var(--red)}.live .sc{color:var(--red)}.fin .sc{color:var(--text)}.fin .time{font-size:12px}
.rc{display:inline-block;width:9px;height:13px;background:var(--red);border-radius:2px;margin-left:6px;flex:none}
.m.goal{opacity:1!important;background:color-mix(in srgb,var(--red) 38%,var(--panel))}.m.goal .time::after{content:' GOL';color:var(--red);font-size:11px}
.livebar{color:var(--dim);font-size:12px}.livebar b{color:var(--red)}
@media(max-width:820px){.m{grid-template-columns:24px 44px minmax(0,1fr) 60px 28px 50px;row-gap:6px;gap:8px;padding:8px}.odds,.wx,.sr i{display:none}.plan{grid-column:2/7;min-width:0}.top .meta{font-size:11px}.pills button{padding:7px 10px}}
.m>*{min-width:0}
footer{color:var(--dim);font-size:12px;padding:8px 4px 32px}
</style></head><body>
<div class="top"><h1>📋 ŚCIĄGA <b>${DATE}</b></h1><label class="dep" title="Wpisz, ile masz w STS — stawki w podpowiedziach liczę od tej kwoty">Depozyt <input id="dep" inputmode="decimal" placeholder="0"> zł</label><button id="sndbtn" class="tb" title="Dźwięk podpowiedzi i goli: włącz / wyłącz"></button><button id="calcbtn" class="tb"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/></svg> Kalkulator</button><button id="simbtn" onclick="simGol()" style="background:#0d2f3c;color:var(--text);border:0;border-radius:8px;padding:6px 10px;font:700 12px inherit;cursor:pointer">⚽ Test gola</button><span class="livebar" id="lb">● na żywo: łączę…</span><span class="meta">${rows.length} meczów · kursy Bet365 przedmeczowe · odświeżono ${updated}</span></div>
<div class="wrap">
<aside class="side"><h3><span>👉</span><span class="tx">POSTAW NA — podpowiedzi na żywo</span><button class="mn" title="Zwiń / rozwiń">▾</button></h3><div class="hl" id="hl"><div class="empty"><b>😴 Cisza — na razie nic pilnego.</b><br>Gdy będzie okazja, zobaczysz tu 🔥 GRAJ TERAZ, usłyszysz sygnał, a na górze ekranu wyskoczy pomarańczowy pasek.</div></div></aside>
<main>
<div class="pills">
<button data-f="all" class="on">WSZYSTKIE<small>${rows.length}</small></button>
${['must', 'szansa', 'ryzyko', 'reszta'].filter(cnt).map(k => `<button data-f="${k}">${TIER[k][0]} ${TIER[k][1]}<small>${cnt(k)}</small></button>`).join('')}
<button data-f="fav">☆ ULUBIONE</button><button data-f="moje">💰 MOJE ZAKŁADY</button><button data-f="hist">📒 HISTORIA</button>
</div>
${groups.map(league).join('')}
<section id="hist" class="lg hide"></section>
<div id="calc" class="cm hide"><div class="cb">
<div class="ch"><span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/></svg> Czy się opłaca?</span> <button id="cx" title="Zamknij">✕</button></div>
<label>Mecz na żywo <select id="cm"><option value="">— wpisz ręcznie —</option></select></label>
<div class="cg"><label>Zakład <select id="ct"><option value="m">Padnie gol w meczu</option><option value="h">Gol gospodarzy</option><option value="a">Gol gości</option></select></label>
<label>Stawka (zł) <input id="cs" inputmode="decimal" value="10"></label>
<label>Kurs w STS <input id="co" inputmode="decimal" placeholder="np. 2,0"></label>
<label>Minuta <input id="cmin" inputmode="numeric" placeholder="np. 79"></label>
<label>Śr. goli drużyn <input id="cg" inputmode="decimal" value="2,7"></label></div>
<div id="cr" class="cr"></div></div></div>
<footer>Kursy przedmeczowe — na żywo sprawdzaj w STS. MUSI = drużyna w Lidze Mistrzów walczy o top 24, TOP 8 = walczy o 1/8. Odśwież: w czacie „odśwież ściągę”.</footer>
</main>
</div>
<script>
// Na żywo: co 30 s pobiera wyniki, minutę i czerwone kartki (api-football, 1-2 zapytania na odświeżenie)
const H_KEY='sciaga_hints_${DATE}',hints=JSON.parse(localStorage.getItem(H_KEY)||'[]'),fired=new Set(hints.map(h=>h.id)),hist={};
function beep(){const v=localStorage.getItem('sciaga_vol')||'loud';if(v==='off'||localStorage.getItem('sciaga_mute')==='1')return;try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();g.gain.value=v==='quiet'?0.08:0.6;o.frequency.value=880;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.25);}catch(e){}}
const TAGS={g:['k-g','🟢 MOCNA SZANSA'],y:['k-y','🟡 OKAZJA'],r:['k-r','🔴 RYZYKO']};const lvlOf=h=>h.lvl||(h.icon==='🎲'?'r':h.icon==='🟢'?'y':'y');
const DEP='sciaga_dep';function stake(h){const d=+(localStorage.getItem(DEP)||0),l=lvlOf(h);if(!d)return l==='g'?'20 zł':'10 zł';const p=l==='g'?0.10:l==='y'?0.07:0.04;return Math.max(10,Math.min(50,Math.round(d*p)))+' zł';}
function drawHints(){const live=hints.filter(h=>Date.now()-h.ts<1200000&&!h.closed&&!(/^Gol /.test(h.act)&&!/^\d+[xc]/.test(String(h.id))));if(!live.length){document.getElementById('hl').innerHTML='<div class="empty"><b>😴 Cisza — na razie nic pilnego.</b><br>Gdy będzie okazja, zobaczysz tu 🔥 GRAJ TERAZ, usłyszysz sygnał, a na górze ekranu wyskoczy pomarańczowy pasek.</div>';document.querySelector('.side').classList.remove('hot');return;}const age=h=>Date.now()-h.ts;document.querySelector('.side').classList.toggle('hot',hints.some(h=>age(h)<180000));
document.getElementById('hl').innerHTML=live.map(h=>{const t=TAGS[lvlOf(h)];return '<div class="hint '+t[0]+(age(h)<180000?' new':age(h)>900000?' old':'')+'"><div class="ht"><span class="tag">'+t[1]+'</span><span class="hc">'+(h.res===true?'<b class="rs ok">✓ TRAFIONA</b> ':h.res===false?'<b class="rs ko">✗ PUDŁO</b> ':'')+h.clock+'<button class="hx" data-hid="'+h.id+'" title="Zamknij">×</button></span></div><div class="ha">'+h.act+'</div><div class="hw">'+h.match+'</div><div class="hw">'+h.why+'</div><div class="hm">'+h.lg+'</div><div class="hk">'+(h.fair?'graj od kursu <b>'+h.fair+'</b>'+(h.now?' · teraz '+h.now:''):'sprawdź kurs')+' · <b class="stk">'+stake(h)+'</b><span class="vt"><button class="vu'+(h.vote===1?' on':'')+'" data-hid="'+h.id+'" data-v="1" title="Dobra podpowiedź — zarobiliśmy"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 6.5A2 2 0 0 1 17.6 20H7"/></svg></button><button class="vd'+(h.vote===-1?' on':'')+'" data-hid="'+h.id+'" data-v="-1" title="Zła podpowiedź — straciliśmy"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg)"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 6.5A2 2 0 0 1 17.6 20H7"/></svg></button></span></div></div>'}).join('');}
setInterval(drawHints,15000);
function toast(h,ms=90000,kind=''){document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className='toast '+kind;d.innerHTML=h.icon+' '+h.act+'<small>'+h.match+' · '+h.why+'</small>';d.onclick=()=>d.remove();document.body.append(d);setTimeout(()=>d.remove(),ms);}
// Historia 3849 meczów (2025): szansa, że przegrywający strzeli do końca, wg różnicy i minuty
const HIST={1:{55:.46,60:.43,65:.39,70:.35,75:.31,80:.26},2:{55:.44,60:.39,65:.35,70:.30,75:.25,80:.21},3:{55:.40,60:.34,65:.30,70:.25,75:.20,80:.15}};
function hint(id,icon,act,why,m,label,fair,now,lvl){
  // Gol drużyny, która przegrywa: nie taniej niż historia mówi; naciskający faworyt nadziewa się na kontry → podpowiedz „gol w meczu”
  if(/^Gol /.test(act)){const side=act.slice(4)===m.dataset.a?1:0,sc=[...m.querySelectorAll('.sr b')].map(x=>+x.textContent||0),diff=sc[1-side]-sc[side],el0=parseInt(m.querySelector('.time').textContent)||60;
    if(diff>=1&&el0>=53){const mm=[55,60,65,70,75,80].reduce((b,x)=>Math.abs(x-el0)<Math.abs(b-el0)?x:b,55),ph=HIST[Math.min(diff,3)][mm];fair=Math.max(fair||0,1/ph);why+=' · historia: przegrywający '+diff+' gol'+(diff>1?'ami':'em')+' strzela w '+Math.round(ph*100)+'%';if(diff>=2&&lvl==='g')lvl='y';}
    if(diff>=1)why+=' · bezpieczniej: gol w meczu (kontry rywala)';
    // Lekcja 2026-11-24: przy nacisku częściej strzelał RYWAL (kontry). Gol konkretnej drużyny tylko przy czerwonej rywala — reszta = gol w meczu
    if(!/^\d+[xc]/.test(String(id))){const tt=m.querySelector('.time').textContent,el1=parseInt(tt)||60,h1=el1<=45&&!/Przerwa/.test(tt)&&!m.dataset.h2;
      // 1. połowa: „gol w meczu” to oczywistość → gol jeszcze w tej połowie; 2. połowa: gol w meczu
      const lam=rateOf(m,el1)*(h1?Math.max(1,47-el1):Math.max(2,93-el1))/90;why=act.slice(4)+' naciska: '+why;act=h1?'Padnie gol do przerwy':'Padnie gol w meczu';id+=h1?'h':'g';fair=1/(1-Math.exp(-lam));now=+(h1?m.dataset.go1:m.dataset.go)||now;}}
  if(/^Gol /.test(act)){const nm=act.slice(4),gf=+(nm===m.dataset.a?m.dataset.gfa:m.dataset.gfh);if(gf&&gf<1.0){why+=' · '+nm+' strzela tylko '+gf.toFixed(1).replace('.',',')+' gola/mecz';id+='w';lvl=lvl==='g'?'y':lvl;}}lvl=lvl||(fair&&now?(now*0.88/fair-1>=0.15?'g':'y'):icon==='🎲'?'r':'y');if(fired.has(id))return;if(fair)fair=Math.max(1.9,fair/0.88);if(now&&now<1.9)return;if(fair&&now&&now<fair)return;fired.add(id);const sc0=[...m.querySelectorAll('.sr b')].map(x=>+x.textContent||0),side=/^Gol /.test(act)?(act.slice(4)===m.dataset.a?1:0):'m';hints.unshift({lvl,fid:m.dataset.fid,side,sc0,id,icon,act,why,fair:fair?fair.toFixed(2).replace('.',','):'',now:now?now.toFixed(2).replace('.',','):'',match:label,lg:m.dataset.lg,clock:new Date().toLocaleTimeString('pl-PL').slice(0,5),ts:Date.now()});hints.splice(30);localStorage.setItem(H_KEY,JSON.stringify(hints));drawHints();beep();toast(hints[0]);document.querySelector('.side').classList.remove('min');document.title='👉 '+act;}
(()=>{const seed=${existsSync(new URL('../sciaga/oceny.json', import.meta.url)) ? readFileSync(new URL('../sciaga/oceny.json', import.meta.url), 'utf8') : '[]'};const log=JSON.parse(localStorage.getItem('sciaga_hintauto')||'[]');seed.forEach(x=>{if(!log.some(y=>y.id===x.id))log.push(x);});localStorage.setItem('sciaga_hintauto',JSON.stringify(log));})();
function hintResolve(f){let ch=0;const log=JSON.parse(localStorage.getItem('sciaga_hintauto')||'[]');
  for(const h of hints)if(h.fid==f.fixture.id&&h.res==null&&h.sc0){const fin=[f.goals.home,f.goals.away];h.res=h.side==='m'?(fin[0]+fin[1]>h.sc0[0]+h.sc0[1]):(fin[h.side]>h.sc0[h.side]);ch=1;
    if(!log.some(y=>y.id===h.id))log.push({id:h.id,date:'${DATE}',type:(String(h.id).match(/^\d+([a-z])/)||[])[1]||'?',act:h.act,match:h.match,res:h.res});}
  if(ch){localStorage.setItem(H_KEY,JSON.stringify(hints));localStorage.setItem('sciaga_hintauto',JSON.stringify(log));drawHints();}}
const depIn=document.getElementById('dep');depIn.value=(localStorage.getItem(DEP)||'').replace('.',',');depIn.oninput=()=>{const v=parseFloat(depIn.value.replace(',','.'));if(v>=0)localStorage.setItem(DEP,v);else localStorage.removeItem(DEP);drawHints();};
drawHints();
const HL='sciaga_hintlog',TYPES={n:'nacisk',m:'MUSI',r:'ryzyko',s:'szansa',x:'rywal w 10',l:'kolejny gol',c:'czerwona prowadzącego'};
document.addEventListener('click',e=>{const x=e.target.closest('.hx');if(!x)return;const h=hints.find(y=>y.id===x.dataset.hid);if(h){h.closed=true;localStorage.setItem(H_KEY,JSON.stringify(hints));drawHints();}});
document.addEventListener('click',e=>{const b=e.target.closest('.vt button');if(!b)return;const h=hints.find(x=>x.id===b.dataset.hid);if(!h)return;const v=+b.dataset.v;h.vote=h.vote===v?0:v;localStorage.setItem(H_KEY,JSON.stringify(hints));
  const log=JSON.parse(localStorage.getItem(HL)||'[]').filter(x=>x.id!==h.id);if(h.vote)log.push({id:h.id,date:'${DATE}',type:(String(h.id).match(/^\d+([a-z])/)||[])[1]||'?',act:h.act,match:h.match,vote:h.vote});localStorage.setItem(HL,JSON.stringify(log));drawHints();});
const KEY='${KEY}',FIDS=[...document.querySelectorAll('.m')].map(m=>m.dataset.fid);const prev={};
function rateOf(m,el){const base=+m.dataset.g||2.6,g=[...m.querySelectorAll('.sr b')].reduce((a,x)=>a+(+x.textContent||0),0);if(!(el>=20))return base;const tempo=Math.min(6,g/el*90);return tempo>base?0.5*base+0.5*tempo:base;}
const TAB=Math.random().toString(36).slice(2);let tick=0;
async function live(){
  try{
    const LK='sciaga_leader',now=Date.now(),ld=JSON.parse(localStorage.getItem(LK)||'null');let out;
    if(!ld||ld.id===TAB||now-ld.ts>40000){localStorage.setItem(LK,JSON.stringify({id:TAB,ts:now}));out=[];
      for(let i=0;i<FIDS.length;i+=20){const j=await (await fetch('${B}/fixtures?ids='+FIDS.slice(i,i+20).join('-'),{headers:{'x-apisports-key':KEY}})).json();
        if(j.errors&&Object.keys(j.errors).length){document.getElementById('lb').textContent='● API: '+(/limit/i.test(JSON.stringify(j.errors))?'wyczerpany dzienny limit':'błąd');return;}out.push(...(j.response||[]));}
      try{localStorage.setItem('sciaga_live',JSON.stringify({ts:now,out}));}catch(e){}
      if((tick++)%2===0){try{const oj=await (await fetch('${B}/odds/live',{headers:{'x-apisports-key':KEY}})).json();const om={};(oj.response||[]).forEach(o=>{const b=id=>(o.odds.find(x=>x.id===id)||{}).values||[];om[o.fixture.id]={ft:b(59),mg:b(25),h1:b(49)};});localStorage.setItem('sciaga_odds',JSON.stringify(om));}catch(e){}}}
    else{const c=JSON.parse(localStorage.getItem('sciaga_live')||'null');if(!c)return;out=c.out;}
    let nLive=0,goals=[];
    for(const f of out){const m=document.querySelector('.m[data-fid="'+f.fixture.id+'"]');if(!m)continue;
      const st=f.fixture.status.short,el=f.fixture.status.elapsed,ex=f.fixture.status.extra;
      const isLive=['1H','2H','ET','P','LIVE','BT'].includes(st)||st==='HT',isFin=['FT','AET','PEN'].includes(st);
      m.classList.toggle('live',isLive);m.classList.toggle('fin',isFin);if(isLive)nLive++;
      const t=m.querySelector('.time');t.textContent=st==='HT'?'Przerwa':isLive?(el+(ex?'+'+ex:'')+"'"):isFin?'Koniec':t.dataset.t;
      // Szacunek doliczonego czasu (metoda Chrisa): zmiany w tej samej minucie = 1 okno × 30 s; gol 45 s, VAR 60 s, czerwona 30 s
      if(isLive&&st!=='HT'&&el>=30){const h2=st==='2H'||el>45,lo=h2?47:1,hi=h2?90:45,ev=(f.events||[]).filter(e=>e.time.elapsed>=lo&&e.time.elapsed<=hi);
        const subW=new Set(ev.filter(e=>e.type==='subst').map(e=>e.time.elapsed)).size,gol=ev.filter(e=>e.type==='Goal').length,va=ev.filter(e=>e.type==='Var').length,rc=ev.filter(e=>e.type==='Card'&&/Red/.test(e.detail)).length;
        const sec=subW*30+gol*45+va*60+rc*30,mins=Math.max(h2?2:1,Math.round(sec/60),ex?ex+1:0);
        const ann=+(localStorage.getItem('sciaga_add_'+f.fixture.id+(h2?'_2':'_1'))||0);m.dataset.add=h2?(ann||mins):'';m.dataset.ex=ex||0;
        t.insertAdjacentHTML('beforeend','<small class="add'+(ann?' ann':'')+'" data-k="sciaga_add_'+f.fixture.id+(h2?'_2':'_1')+'" title="'+(ann?'Ogłoszone przez sędziego (wpisane przez Ciebie)':'Szacunek: '+subW+' okna zmian ×30 s, gole '+gol+' ×45 s, VAR '+va+' ×60 s, czerwone '+rc+' ×30 s')+(ex?' · już gra się '+ex+' min doliczonego':'')+'. Kliknij, żeby wpisać czas z tablicy.">+'+(ann||mins)+'</small>');}
      if(f.goals.home!=null){
        const sr=m.querySelectorAll('.sr'),ht=f.score?.halftime||{},sides=['home','away'];
        // Kto strzelił ostatni: gole z osi zdarzeń; samobój liczymy tak, by suma zgadzała się z wynikiem
        const gl=(f.events||[]).filter(e=>e.type==='Goal'&&!/Missed/.test(e.detail));
        const cnt=flip=>{const c={home:0,away:0};gl.forEach(e=>{let sd=e.team.id===f.teams.home.id?'home':'away';if(flip&&/Own/.test(e.detail))sd=sd==='home'?'away':'home';c[sd]++;});return c;};
        const flip=!(cnt(false).home===f.goals.home&&cnt(false).away===f.goals.away);
        let last=null;if(gl.length){const e=gl[gl.length-1];last=e.team.id===f.teams.home.id?'home':'away';if(flip&&/Own/.test(e.detail))last=last==='home'?'away':'home';}
        m.querySelector('.sc').classList.toggle('hd',ht.home!=null);
        sides.forEach((sd,i)=>{const [a,b]=sr[i].querySelectorAll('i'),t=sr[i].querySelector('b');t.textContent=f.goals[sd];t.classList.toggle('last',last===sd);
          a.textContent=ht[sd]??'';b.textContent=ht[sd]!=null&&!['1H','HT'].includes(st)?f.goals[sd]-ht[sd]:'';});
      }
      const key=f.goals.home+':'+f.goals.away;if(prev[f.fixture.id]&&prev[f.fixture.id]!==key&&isLive){m.classList.add('goal');setTimeout(()=>m.classList.remove('goal'),10000);goals.push(f.teams.home.name+' '+key+' '+f.teams.away.name);
        // Gol w meczu oznaczonym na zielono (śledzę) albo czerwono (obstawiłem): sygnał + pasek
        const mine=m.querySelector('.dot.r')?'💰':m.querySelector('.dot.g')?'⚽':'';
        if(mine){const g=(f.events||[]).filter(e=>e.type==='Goal').pop();beep();toast({icon:mine,act:'GOL'+(g?' '+g.team.name:'')+' — '+key,match:f.teams.home.name+' '+key+' '+f.teams.away.name+' ('+el+"')",why:mine==='💰'?'Twój zakład':'śledzony mecz'},10000,'goal');}}
      prev[f.fixture.id]=key;if(isFin){betResolve(f);hintResolve(f);}
      if(isLive&&st!=='HT'&&el){
        const gh=f.goals.home,ga=f.goals.away,H=f.teams.home.name,A=f.teams.away.name,label=H+' '+gh+':'+ga+' '+A+' ('+el+"')",id=f.fixture.id,tier=m.dataset.tier;
        // 1. Nacisk: w 5 min celny + 2 strzały albo 3 rożne
        // Kursy na żywo w kafelkach: 1 · X · 2 i „+gol” = kolejny gol w meczu (Over aktualna liczba goli + 0,5)
        const OD=JSON.parse(localStorage.getItem('sciaga_odds')||'{}')[id],nextLine=(gh+ga+0.5).toFixed(1);let goOdd=null;
        if(OD){const sp=[],v=(arr,val,hc)=>{const x=arr.find(y=>y.value===val&&(hc==null||+y.handicap===+hc));return x&&!x.suspended?(+x.odd).toFixed(2).replace('.',','):'<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="vertical-align:-1px;opacity:.6"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';};
          const go=OD.mg.find(y=>y.value==='Over'&&+y.handicap===+nextLine);goOdd=go&&!go.suspended?+go.odd:null;const g1=(OD.h1||[]).find(y=>y.value==='Over'&&+y.handicap===+nextLine);m.dataset.go1=g1&&!g1.suspended?+g1.odd:'';m.dataset.go=goOdd||'';
          const L=[v(OD.ft,'Home'),v(OD.ft,'Draw'),v(OD.ft,'Away'),v(OD.mg,'Over',nextLine)],lv=m.querySelector('.lvo');lv.classList.remove('hide');lv.querySelector('.lvr').innerHTML=L.map(x=>'<u>'+x+'</u>').join('');m.dataset.go=goOdd||'';m.dataset.el=el;miniCalc(m);
          }
        // Uczciwy kurs: szansa gola w pozostałym czasie z Poissona (średnia goli drużyn × pozostałe minuty, presja jako waga)
        const R=Math.max(1,90+(+m.dataset.add||3)-el-(+m.dataset.ex||0)),avgG=rateOf(m,el),lamT=avgG*R/90;
        const fairGoal=1/(1-Math.exp(-lamT)),fairTeam=i=>{const sh=Math.min(.8,Math.max(.25,(window._pt&&window._pt[id]&&window._pt[id].tot>=3)?window._pt[id].p[i]/window._pt[id].tot:.5));return 1/(1-Math.exp(-lamT*sh*1.1));};
        const fx2=x=>x.toFixed(2).replace('.',',');
        for(const t of (f.statistics||[])){const g=Object.fromEntries(t.statistics.map(x=>[x.type,x.value]));const now={el,sh:+g['Total Shots']||0,so:+g['Shots on Goal']||0,co:+g['Corner Kicks']||0};
          const h=(hist[id+'|'+t.team.id]||=[]);h.push(now);const b=h.filter(x=>x.el<=el-5).pop();
          if(b&&el<=85){const d={sh:now.sh-b.sh,so:now.so-b.so,co:now.co-b.co};if((d.so>=1&&d.sh>=2)||d.co>=3)hint(id+'n'+Math.floor(el/10),'🔥','Gol '+t.team.name,'naciska: od '+b.el+"' strzały +"+d.sh+', celne +'+d.so+', rożne +'+d.co,m,label,fairTeam(t.team.id===f.teams.home.id?0:1),null,d.so>=2?'g':'y');}}
        // Presja (ostatnie 10 min): strzały + 2×celne + rożne; bez statystyk: gole z ostatnich 15 min ×3
        const sides=[f.teams.home,f.teams.away],pres=sides.map(tm=>{const h=hist[id+'|'+tm.id];if(h&&h.length){const now=h[h.length-1],b=h.filter(x=>x.el<=el-10).pop()||(now.el-h[0].el>=5?h[0]:{sh:0,so:0,co:0});return (now.sh-b.sh)+2*(now.so-b.so)+(now.co-b.co);}
          return (f.events||[]).filter(e=>e.type==='Goal'&&e.team.id===tm.id&&e.time.elapsed>=el-15).length*3;});
        // Zegar presji: -90° = gospodarze 100%, 0° = równo, +90° = goście 100%
        const na0=!(f.statistics||[]).length,tot=na0?0:pres[0]+pres[1],_s=((window._pt||={})[id]={tot:na0?0:pres[0]+pres[1],p:pres}),v=tot?(pres[1]-pres[0])/tot:0,gg=m.querySelector('.gg');
        gg.querySelector('.nd').style.transform='rotate('+Math.round(v*90)+'deg)';gg.classList.toggle('on',tot>0);const na=!(f.statistics||[]).length;gg.classList.toggle('na',na);gg.classList.toggle('hot',tot>=4&&Math.abs(v)>=0.4);
        gg.title=na?'Brak statystyk w API dla tego meczu — nie wiadomo, kto naciska':'Presja (10 min): '+H+' '+pres[0]+' · '+A+' '+pres[1]+' (strzały + 2×celne + rożne)';
        // 2. MUSI, a nie wygrywa po 60'
        const press=i=>!na0&&tot>=3&&pres[i]/tot>=0.55;
        const mu=m.dataset.must;if(tier==='must'&&mu&&el>=60&&el<=80){const home=mu===m.dataset.h;if((home?gh<=ga:ga<=gh)&&press(home?0:1))hint(id+'m','🔥','Gol '+mu,'musi wygrać, a jest '+gh+':'+ga,m,label,fairTeam(home?0:1));}
        // 3. Ryzyko: faworyt z wyjazdu prowadzi → gol gospodarza
        if(tier==='ryzyko'&&el>=55&&el<=80&&ga>gh&&press(0))hint(id+'r'+gh+ga,'🎲','Gol '+H,'faworyt prowadzi, a '+H+' naciska ('+pres[0]+' vs '+pres[1]+')',m,label,fairTeam(0));
        // 4. Szansa: 0:0 lub 1:1 po 55'
        if(tier==='szansa'&&el>=55&&el<=70&&gh===ga&&gh<=1)hint(id+'s'+gh,'🟢','Padnie gol w meczu','liga z dużą liczbą goli, a jest '+gh+':'+ga,m,label,fairGoal,goOdd);
        // 6. Rywal w dziesiątkę, a drużyna z 11 nie prowadzi (Arsenal U19 vs Dortmund 2026-11-24)
        if(el>=50&&el<=85){[0,1].forEach(i=>{const me=sides[i],op=sides[1-i],my=i?ga:gh,their=i?gh:ga;const opRed=(f.events||[]).some(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===op.id),meRed=(f.events||[]).some(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===me.id);
          if(opRed&&!meRed&&my<=their&&their-my<=1)hint(id+'x'+i+my+their,'🔥','Gol '+me.name,op.name+' gra w dziesiątkę, a jest '+gh+':'+ga,m,label,fairTeam(i),null,'g');});}
        // 7. Końcówka otwartego meczu: kolejny gol (kurs po 80' zwykle 1,9-2,5, w doliczonym nawet 3)
        if(el>=78&&el<=88&&(gh+ga>=3||tot>=6))hint(id+'l'+(gh+ga),'🟢','Padnie kolejny gol','otwarty mecz ('+(gh+ga)+' goli'+(tot?', presja '+tot:'')+')',m,label,fairGoal,goOdd);
        // 5. Czerwona dla prowadzącego od 70'
        if(el>=70&&gh!==ga&&Math.abs(gh-ga)<=2){const lead=gh>ga?f.teams.home:f.teams.away,trail=gh>ga?A:H;if((f.events||[]).some(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===lead.id))hint(id+'c','🔥','Gol '+trail,'prowadzący gra w dziesiątkę (historia: TAK)',m,label,fairTeam(gh>ga?1:0),null,'g');}
      }
      const reds=side=>(f.events||[]).filter(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===f.teams[side].id).length;
      m.querySelectorAll('.team').forEach((tm,i)=>{tm.querySelectorAll('.rc').forEach(x=>x.remove());const n=reds(i?'away':'home');for(let k=0;k<n;k++)tm.querySelector('.tn').insertAdjacentHTML('beforeend','<span class="rc" title="Czerwona kartka"></span>');});
    }
    if(typeof applyFilter==='function')applyFilter();
    document.getElementById('lb').innerHTML='● na żywo: <b>'+nLive+'</b> w grze · odświeżono '+new Date().toLocaleTimeString('pl-PL');
    if(goals.length){document.title='⚽ GOL! '+goals[0];setTimeout(()=>document.title='Ściąga ${DATE}',60000);}
  }catch(e){document.getElementById('lb').textContent='● na żywo: '+(/fetch|network/i.test(e.message)?'brak połączenia, ponawiam':'błąd strony ('+e.message+') — napisz Claude');console.error(e);}
}
// Panel podpowiedzi na telefonie: przesuwany palcem, zwijany, pozycja zapamiętana
(()=>{const sd=document.querySelector('.side'),h=sd.querySelector('h3'),mn=sd.querySelector('.mn'),PK='sciaga_panel',narrow=()=>matchMedia('(max-width:1100px)').matches;
const st=JSON.parse(localStorage.getItem(PK)||'{}');const put=()=>{if(!narrow()){sd.style.left=sd.style.top=sd.style.right=sd.style.bottom='';return;}
if(st.x!=null){sd.style.left=Math.min(Math.max(0,st.x),innerWidth-60)+'px';sd.style.top=Math.min(Math.max(0,st.y),innerHeight-44)+'px';sd.style.right=sd.style.bottom='auto';}sd.classList.toggle('min',!!st.min);mn.textContent=st.min?'▸':'▾';};
put();addEventListener('resize',put);
mn.onclick=e=>{e.stopPropagation();st.min=!st.min;localStorage.setItem(PK,JSON.stringify(st));put();};
let d=null;h.addEventListener('pointerdown',e=>{if(!narrow()||e.target===mn)return;const r=sd.getBoundingClientRect();d={dx:e.clientX-r.left,dy:e.clientY-r.top};h.setPointerCapture(e.pointerId);});
h.addEventListener('pointermove',e=>{if(!d)return;st.x=e.clientX-d.dx;st.y=e.clientY-d.dy;put();});
h.addEventListener('pointerup',()=>{if(d){d=null;localStorage.setItem(PK,JSON.stringify(st));}});})();
live().then(()=>{if(location.hash==='#gol')setTimeout(simGol,1500);});setInterval(live,15000);
// Symulacja gola (otwórz stronę z #gol na końcu adresu): pierwszy mecz w grze, +1 dla gospodarzy
function simGol(){const m=document.querySelector('.m.live')||document.querySelector('.m');const sr=m.querySelectorAll('.sr');const b=sr[0].querySelector('b');b.textContent=(+b.textContent||0)+1;
sr.forEach((r,i)=>r.querySelector('b').classList.toggle('last',i===0));m.classList.add('goal');setTimeout(()=>m.classList.remove('goal'),10000);
document.title='⚽ GOL! '+m.dataset.h+' '+b.textContent+':'+sr[1].querySelector('b').textContent+' '+m.dataset.a+' (symulacja)';m.scrollIntoView({block:'center'});}
const K='sciaga_fav';const fav=new Set(JSON.parse(localStorage.getItem(K)||'[]'));
const rows=[...document.querySelectorAll('.m')];
rows.forEach((m,i)=>{const id=m.querySelector('.tn').textContent+'|'+m.querySelectorAll('.tn')[1].textContent;m.dataset.id=id;const s=m.querySelector('.star');if(fav.has(id))s.classList.add('on'),s.textContent='★',m.classList.add('fv');
s.onclick=()=>{fav.has(id)?fav.delete(id):fav.add(id);localStorage.setItem(K,JSON.stringify([...fav]));s.classList.toggle('on');s.textContent=s.classList.contains('on')?'★':'☆';m.classList.toggle('fv',fav.has(id));setFocus();}});
// Znaczniki drużyn: puste → pomarańczowy (obserwuj) → zielony (gram) → puste
const DK='sciaga_dots',dots=JSON.parse(localStorage.getItem(DK)||'{}'),ST=['','o','g','r'];
document.querySelectorAll('.m').forEach(m=>m.querySelectorAll('.dot').forEach((b,i)=>{if(b.classList.contains('dm'))i='m';const k=m.dataset.fid+'|'+i;
  const show=()=>{b.classList.toggle('o',dots[k]==='o');b.classList.toggle('g',dots[k]==='g');b.classList.toggle('r',dots[k]==='r');};show();
  b.onclick=e=>{e.stopPropagation();const was=dots[k];dots[k]=ST[(ST.indexOf(dots[k]||'')+1)%4];if(!dots[k])delete dots[k];localStorage.setItem(DK,JSON.stringify(dots));show();
    if(dots[k]==='r')betAdd(m,i);else if(was==='r')betDel(m.dataset.fid+'|'+i);};}));
// Historia: każda czerwona kropka = zapis (mecz, drużyna, minuta i wynik w chwili zakładu); po końcu meczu: czy ta drużyna (albo ktokolwiek, gdy obie czerwone) strzeliła później
const BK='sciaga_bets',bets=()=>JSON.parse(localStorage.getItem(BK)||'[]'),betsSave=b=>localStorage.setItem(BK,JSON.stringify(b));
function betAdd(m,i){const b=bets(),sc=[...m.querySelectorAll('.sr b')].map(x=>+x.textContent||0);b.push({id:m.dataset.fid+'|'+i,fid:m.dataset.fid,side:i,date:'${DATE}',lg:m.dataset.lg,h:m.dataset.h,a:m.dataset.a,min:m.querySelector('.time').firstChild.textContent,sc,ts:Date.now(),late:m.classList.contains('fin')});betsSave(b);}
function betDel(id){betsSave(bets().filter(x=>!(x.id===id&&!x.fin)));}
function betResolve(f){const b=bets();let ch=0;for(const x of b)if(x.fid==f.fixture.id&&!x.fin){x.fin=[f.goals.home,f.goals.away];ch=1;}if(ch)betsSave(b);}
document.addEventListener('click',e=>{const b=e.target.closest('.hr');if(!b)return;const all=bets(),g=all.filter(x=>x.fid==b.dataset.fid),cur=g[0].hand;g.forEach(x=>x.hand=cur===true?false:cur===false?null:true);betsSave(all);drawHist();});
function drawHist(){const b=bets(),by={};b.forEach(x=>(by[x.fid]||=[]).push(x));const list=Object.values(by).reverse();
  let ok=0,done=0;const rowsH=list.map(g=>{const x=g.find(y=>y.side==='m')||g[0],both=x.side==='m'||(g.length>1&&new Set(g.map(y=>y.side)).size>1),who=both?'Gol w meczu':'Gol '+(x.side?x.a:x.h);
    const late=x.late||/Koniec/.test(x.min);let res='<span class="wait">trwa</span>';const auto=x.fin&&!late?(both?(x.fin[0]+x.fin[1]>x.sc[0]+x.sc[1]):(x.fin[x.side]>x.sc[x.side])):null,hit=x.hand!=null?x.hand:auto;
    if(hit!=null){done++;if(hit)ok++;res=hit?'<span class="ok">✅ TAK</span>':'<span class="ko">❌ NIE</span>';}else if(late||x.fin)res='<span class="wait">? kliknij</span>';
    res='<button class="hr" data-fid="'+x.fid+'" title="Kliknij, żeby poprawić: TAK / NIE">'+res+'</button>';
    return '<tr><td>'+x.date+'</td><td>'+x.h+' – '+x.a+'<br><span class="wait">'+x.lg+'</span></td><td>'+who+'</td><td>'+(late?'<span class="wait">zaznaczone po meczu</span>':x.min+' · '+x.sc.join(':'))+'</td><td>'+(x.fin?x.fin.join(':'):'–')+'</td><td>'+res+'</td></tr>';}).join('');
  const lg=JSON.parse(localStorage.getItem(HL)||'[]'),bt={};lg.forEach(x=>{const t=bt[x.type]||={u:0,d:0};x.vote>0?t.u++:t.d++;});
  const au=JSON.parse(localStorage.getItem('sciaga_hintauto')||'[]'),at={};au.forEach(x=>{const t=at[x.type]||={h:0,n:0};t.n++;if(x.res)t.h++;});
  const autoH=au.length?'<div class="hh">🎯 Skuteczność podpowiedzi (liczona sama po meczu) '+Object.entries(at).map(([k,v])=>'<span>'+(TYPES[k]||k)+': <b>'+v.h+'/'+v.n+'</b></span>').join('')+'</div>':'';
  const votesH=lg.length?'<div class="hh">👍👎 Oceny podpowiedzi '+Object.entries(bt).map(([k,v])=>'<span>'+(TYPES[k]||k)+': <b style="color:var(--pos)">'+v.u+'</b> / <b style="color:var(--red)">'+v.d+'</b></span>').join('')+'</div>':'';
  document.getElementById('hist').innerHTML=autoH+votesH+'<div class="hh">📒 Historia zakładów <span>trafione <b>'+ok+'/'+done+'</b>'+(done?' ('+Math.round(ok/done*100)+'%)':'')+'</span></div>'+(list.length?'<table><tr><th>Data</th><th>Mecz</th><th>Typ</th><th>Wejście</th><th>Koniec</th><th>Wynik</th></tr>'+rowsH+'</table><div class="empty">Wynik liczę sam: czy po Twoim wejściu padł gol tej drużyny (albo jakikolwiek, gdy obie kropki są czerwone). Inny zakład, np. „6. gol”, albo kropka po meczu? Kliknij wynik i popraw.</div>':'<div class="empty">Pusto. Zaznacz 🔴 przy drużynie, na którą postawiłeś — zapiszę minutę i wynik, a po meczu sprawdzę, czy trafiłeś.</div>');}
function setFocus(){document.body.classList.toggle('focus',fav.size>0);}setFocus();
// Filtr: zakończone mecze chowamy wszędzie poza „Moje zakłady”
let curF='all';function applyFilter(){const f=curF,H=f==='hist';document.getElementById('hist').classList.toggle('hide',!H);if(H)drawHist();
rows.forEach(m=>m.classList.toggle('hide',H||(m.classList.contains('fin')&&f!=='moje')||!(f==='all'||(f==='fav'?fav.has(m.dataset.id):f==='moje'?!!m.querySelector('.dot.r'):m.dataset.tier===f))));
document.querySelectorAll('.lg[data-lid]').forEach(l=>l.classList.toggle('hide',!l.querySelector('.m:not(.hide)')));}
document.querySelectorAll('.pills button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.pills button').forEach(x=>x.classList.toggle('on',x===b));curF=b.dataset.f;applyFilter();});
document.querySelectorAll('.lh .star').forEach(s=>s.onclick=()=>{s.classList.toggle('on');s.textContent=s.classList.contains('on')?'★':'☆';});
// Kalkulator: szansa gola z Poissona (śr. goli × pozostałe minuty), podatek 12% od stawki
(()=>{const $=id=>document.getElementById(id),num=v=>parseFloat(String(v).replace(',','.')),zl=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2).replace('.',',')+' zł',k2=x=>x.toFixed(2).replace('.',',');
  const open=()=>{const sel=$('cm');sel.length=1;document.querySelectorAll('.m.live').forEach(m=>{const o=document.createElement('option');o.value=m.dataset.fid;o.textContent=m.dataset.h+' – '+m.dataset.a+' ('+m.querySelector('.time').firstChild.textContent+')';sel.append(o);});
    const d=+(localStorage.getItem('sciaga_dep')||0);$('cs').value=Math.max(10,Math.round(d*0.1))||10;$('calc').classList.remove('hide');calc();};
  $('calcbtn').onclick=open;$('cx').onclick=()=>$('calc').classList.add('hide');$('calc').onclick=e=>{if(e.target.id==='calc')$('calc').classList.add('hide');};
  $('cm').onchange=()=>{const m=document.querySelector('.m[data-fid="'+$('cm').value+'"]');if(m){$('cmin').value=parseInt(m.querySelector('.time').textContent)||'';if(m.dataset.g)$('cg').value=String(m.dataset.g).replace('.',',');
    const sp=m.querySelectorAll('.odds span');if(sp[3]&&/\d/.test(sp[3].lastChild.textContent)&&$('ct').value==='m')$('co').value=sp[3].lastChild.textContent;}calc();};
  ['ct','cs','co','cmin','cg'].forEach(i=>$(i).oninput=calc);$('ct').onchange=calc;
  function share(){const m=document.querySelector('.m[data-fid="'+$('cm').value+'"]'),t=$('ct').value;if(t==='m')return 1;const gh=+(m&&m.dataset.gfh)||1,ga=+(m&&m.dataset.gfa)||1;return t==='h'?gh/(gh+ga):ga/(gh+ga);}
  function chance(min){const R=Math.max(1,93-min);return 1-Math.exp(-(num($('cg').value)||2.7)*R/90*share());}
  function calc(){const st=num($('cs').value)||10,od=num($('co').value),min=num($('cmin').value);const r=$('cr');
    if(!(min>=0)){r.innerHTML='<span style="color:var(--dim)">Wybierz mecz albo wpisz minutę.</span>';return;}
    const p=chance(min),need=1/(p*0.88),win=st*0.88*(od||0)-st;let h='';
    if(od>1){const ev=p*win-(1-p)*st,ok=ev>0;h+='<div class="v '+(ok?'ok':'ko')+'">'+(ok?'✓ Opłaca się':'✗ Nie opłaca się')+'</div>'
      +'Szansa na gol: <b>'+Math.round(p*100)+'%</b><br>Wygrasz na czysto: <b>'+zl(win)+'</b> · przegrasz: <b>'+zl(-st)+'</b><br>Średnio na zakład: <b class="'+(ok?'ok':'ko')+'">'+zl(ev)+'</b><br>';}
    else h+='Szansa na gol: <b>'+Math.round(p*100)+'%</b><br>';
    h+='Opłaca się od kursu: <b style="color:var(--warn)">'+k2(need)+'</b>'+(need<1.9?' · Twoje minimum 1,90':'');
    h+='<table><tr><th>Minuta</th><th>Szansa</th><th>Graj od kursu</th></tr>';for(let mm=Math.floor(min/5)*5;mm<=90;mm+=5){const q=chance(Math.max(mm,min));h+='<tr'+(mm===Math.floor(min/5)*5?' class="now"':'')+'><td>'+Math.max(mm,min)+"'</td><td>"+Math.round(q*100)+'%</td><td>'+k2(Math.max(1/(q*0.88),1.9))+'</td></tr>';}
    r.innerHTML=h+'</table><p style="color:var(--dim);font-size:11px;margin:10px 0 0"><b>Średnio na zakład</b> = ile zarabiasz albo tracisz na jednym takim zakładzie, gdybyś grał go wiele razy. Minus = bukmacher płaci za mało. <b>Opłaca się od kursu</b> = najniższy kurs w STS, przy którym wychodzisz na plus (po 12% podatku).</p>';}})();
// Mini-kalkulator w wierszu: „+gol” (kolejny gol w meczu) dla wpisanej stawki
function miniCalc(m){const od=+m.dataset.go,el=+m.dataset.el,cv=m.querySelector('.cv'),st=parseFloat(String(m.querySelector('.cst').value).replace(',','.'))||10;if(!cv)return;
  const p=1-Math.exp(-rateOf(m,el)*Math.max(1,90+(+m.dataset.add||3)-el-(+m.dataset.ex||0))/90),need=1/(p*0.88),f=x=>x.toFixed(2).replace('.',',');
  if(!od){cv.className='cv';cv.textContent='gol: szansa '+Math.round(p*100)+'%';cv.title='Kolejny gol opłaca się od kursu '+f(need);return;}
  const ev=p*(st*0.88*od-st)-(1-p)*st,win=st*0.88*od-st;cv.className='cv '+(ev>0?'ok':'ko');cv.textContent=ev>0?'✓ graj gol':'✗ nie graj · od '+f(need);
  cv.title='Kolejny gol w meczu: szansa '+Math.round(p*100)+'%. Za '+st+' zł wygrasz na czysto '+f(win)+' zł, przegrasz '+st+' zł. Średnio na taki zakład: '+(ev>=0?'+':'−')+f(Math.abs(ev))+' zł. Opłaca się od kursu '+f(need)+' (po podatku 12%).';}
document.addEventListener('input',e=>{if(e.target.classList.contains('cst'))miniCalc(e.target.closest('.m'));});
document.addEventListener('click',e=>{const b=e.target.closest('.ccb');if(!b)return;const m=b.closest('.m');document.getElementById('calcbtn').click();const c=document.getElementById('cm');c.value=m.dataset.fid;if(c.value!==m.dataset.fid){const o=document.createElement('option');o.value=m.dataset.fid;o.textContent=m.dataset.h+' – '+m.dataset.a;c.append(o);c.value=m.dataset.fid;}c.onchange();document.getElementById('cs').value=m.querySelector('.cst').value;document.getElementById('cmin').value=m.dataset.el||'';if(m.dataset.go)document.getElementById('co').value=String(m.dataset.go).replace('.',',');document.getElementById('cs').oninput();});
document.addEventListener('click',e=>{const a=e.target.closest('small.add');if(!a)return;const v=prompt('Ile minut doliczył sędzia? (z tablicy / STS)',a.textContent.replace('+',''));if(v===null)return;const n=parseInt(v);if(n>0)localStorage.setItem(a.dataset.k,n);else localStorage.removeItem(a.dataset.k);a.textContent='+'+(n>0?n:'?');a.classList.toggle('ann',n>0);const m=a.closest('.m');if(n>0)m.dataset.add=n;miniCalc(m);});
(()=>{const b=document.getElementById('sndbtn'),K='sciaga_vol',ST={loud:['<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>','Głośno'],quiet:['<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>','Cicho'],off:['<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>','Wyciszone']},NX={loud:'quiet',quiet:'off',off:'loud'};
  const draw=()=>{const v=localStorage.getItem(K)||'loud';b.innerHTML=ST[v][0]+' '+ST[v][1];b.style.opacity=v==='off'?.6:1;};draw();b.title='Dźwięk: Głośno → Cicho → Wyciszone';b.onclick=()=>{const v=NX[localStorage.getItem(K)||'loud'];localStorage.setItem(K,v);localStorage.setItem('sciaga_mute',v==='off'?'1':'0');draw();if(v!=='off')beep();};})();
</script>
</body></html>`;
mkdirSync(new URL('../sciaga/', import.meta.url), { recursive: true });
writeFileSync(new URL('../sciaga/index.html', import.meta.url), html);
console.log(`gotowe: sciaga/index.html · ${rows.length} meczów · must ${rows.filter(r => r.tier === 'must').length}, szansa ${rows.filter(r => r.tier === 'szansa').length}, ryzyko ${rows.filter(r => r.tier === 'ryzyko').length}`);
