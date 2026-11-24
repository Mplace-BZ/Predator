#!/usr/bin/env node
// Ściąga meczowa na dziś: 3 koszyki (MUSZĄ / SZANSA / RYZYKO), lokalny plik HTML.
// Użycie: node tools/sciaga.mjs [YYYY-MM-DD]  → sciaga/index.html (poza gitem — repo jest publiczne)
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const DATE = process.argv[2] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
// [kod flagi flagcdn | null = logo ligi, KRAJ, nazwa ligi]
const LEAGUES = { 2: ['eu', 'EUROPA', 'Liga Mistrzów'], 135: ['it', 'WŁOCHY', 'Serie A'], 136: ['it', 'WŁOCHY', 'Serie B'], 40: ['gb-eng', 'ANGLIA', 'Championship'], 39: ['gb-eng', 'ANGLIA', 'Premier League'], 41: ['gb-eng', 'ANGLIA', 'League One'], 179: ['gb-sct', 'SZKOCJA', 'Premiership'], 3: ['eu', 'EUROPA', 'Liga Europy'], 848: ['eu', 'EUROPA', 'Liga Konferencji'] };
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
  rows.push({ time: f.fixture.date.slice(11, 16), lid: f.league.id, flag, country, lname, H: H.name, A: A.name, hLogo: H.logo, aLogo: A.logo, tH, tA, mH, mA, avgGoals, o1, ox, o2, ou, btts, wx, tier, plan });
}

// 4. HTML — wygląd w stylu listy wyników (ligi z flagami, wiersz = mecz), filtr koszyków na górze
const f2 = x => (x == null ? '–' : x.toFixed(2).replace('.', ','));
const f1 = x => (x == null ? '–' : x.toFixed(1).replace('.', ','));
const wxs = w => !w ? '' : `${w.rain >= 0.5 ? '🌧' : w.wind >= 30 ? '💨' : ''} ${w.t}°`;
const goalsCls = g => (g == null ? '' : g >= 3.2 ? 'hot' : g >= 2.7 ? 'warm' : '');
const TIER = { must: ['🔥', 'MUSZĄ'], szansa: ['🟢', 'SZANSA'], ryzyko: ['🎲', 'RYZYKO'], reszta: ['👀', 'RESZTA'] };
const cnt = k => rows.filter(r => r.tier === k).length;

// Grupy lig w kolejności pierwszego meczu
const groups = [];
for (const r of rows) { let g = groups.find(x => x.lid === r.lid); if (!g) groups.push(g = { lid: r.lid, flag: r.flag, country: r.country, lname: r.lname, rs: [] }); g.rs.push(r); }

const team = (name, logo, t, m) => `<div class="team"><img src="${esc(logo)}" alt="" loading="lazy"><span class="tn">${esc(name)}</span>${t ? `<span class="pos" title="Miejsce w tabeli">${t.rank}.</span>` : ''}${m ? `<span class="musi ${/MUSI/.test(m) ? '' : 'soft'}">${/MUSI/.test(m) ? 'MUSI' : 'TOP 8'}</span>` : ''}</div>`;
const row = r => `<div class="m t-${r.tier}" data-tier="${r.tier}">
<button class="star" aria-label="Ulubiony">☆</button>
<div class="time">${r.time}</div>
<div class="teams">${team(r.H, r.hLogo, r.tH, r.mH)}${team(r.A, r.aLogo, r.tA, r.mA)}</div>
<div class="g ${goalsCls(r.avgGoals)}" title="Średnia goli w ich meczach">${f1(r.avgGoals)}<small>gole Ø</small></div>
<div class="odds"><span><i>1</i>${f2(r.o1)}</span><span><i>X</i>${f2(r.ox)}</span><span><i>2</i>${f2(r.o2)}</span><span><i>+2,5</i>${f2(r.ou)}</span></div>
<div class="wx">${wxs(r.wx)}</div>
<div class="plan">${r.tier === 'reszta' ? '' : `<span class="badge b-${r.tier}">${TIER[r.tier][0]} ${TIER[r.tier][1]}</span><span class="pt">${esc(r.plan)}</span>`}</div>
</div>`;
const league = g => `<section class="lg" data-lid="${g.lid}"><div class="lh"><button class="star" aria-label="Ulubiona liga">☆</button><img src="${esc(g.flag)}" alt=""><span><b>${esc(g.country)}:</b> ${esc(g.lname)}</span><span class="n">${g.rs.length}</span></div>${g.rs.map(row).join('')}</section>`;

const updated = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ściąga ${DATE}</title>
<style>
:root{--bg:#001e28;--panel:#00141e;--lh:#0b2a36;--line:#0e3442;--text:#e6eef0;--dim:#8ba0a8;--red:#ff0046;--acc:#FF5A1F;--pos:#4ADE80;--warn:#FFB347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.35 Manrope,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
.top{background:var(--panel);padding:14px 16px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.top h1{margin:0;font-size:18px;letter-spacing:.02em}.top h1 b{color:var(--acc)}.top .meta{color:var(--dim);font-size:12px}
.wrap{max-width:1100px;margin:0 auto;padding:12px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}
.pills button{background:#0d2f3c;color:var(--text);border:2px solid transparent;border-radius:8px;padding:7px 14px;font:700 12px/1 inherit;letter-spacing:.06em;cursor:pointer}
.pills button.on{background:var(--red);border-color:#0b5cff}.pills small{opacity:.75;font-weight:600;margin-left:4px}
.lg{background:var(--panel);border-radius:8px;overflow:hidden;margin-bottom:12px}
.lh{display:flex;align-items:center;gap:10px;background:var(--lh);padding:8px 12px;font-size:13px;text-transform:uppercase;letter-spacing:.02em}
.lh img{width:22px;height:15px;object-fit:cover;border-radius:2px}.lh b{font-weight:800}.lh .n{margin-left:auto;color:var(--dim);font-size:12px}
.m{display:grid;grid-template-columns:28px 52px minmax(200px,1.4fr) 58px 220px 44px minmax(190px,1.2fr);align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--line)}
.m:hover{background:#062634}
.star{background:none;border:0;color:var(--dim);font-size:18px;cursor:pointer;padding:0;line-height:1}.star.on{color:#ffd400}
.time{color:var(--dim);font-weight:700;font-size:14px}
.team{display:flex;align-items:center;gap:8px;height:24px}.team img{width:18px;height:18px;object-fit:contain}.tn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pos{color:var(--dim);font-size:11px;background:#0d2f3c;border-radius:4px;padding:1px 5px}
.musi{background:var(--red);color:#fff;font-size:10px;font-weight:800;border-radius:4px;padding:2px 6px;letter-spacing:.05em}.musi.soft{background:#0b5cff}
.g{text-align:center;font-weight:800;font-size:16px}.g small{display:block;font-size:10px;font-weight:500;color:var(--dim)}.g.hot{color:var(--acc)}.g.warm{color:var(--warn)}
.odds{display:flex;gap:4px}.odds span{flex:1;background:#0d2f3c;border-radius:4px;text-align:center;padding:4px 0;font-weight:700;font-size:13px}.odds i{display:block;font-style:normal;font-size:10px;color:var(--dim);font-weight:500}
.wx{color:var(--dim);font-size:12px;text-align:center}
.plan{display:flex;flex-direction:column;gap:4px;font-size:12px}.pt{color:var(--text);font-weight:600}
.badge{align-self:flex-start;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.05em}
.b-must{background:color-mix(in srgb,var(--acc) 22%,transparent);color:var(--acc)}.b-szansa{background:color-mix(in srgb,var(--pos) 18%,transparent);color:var(--pos)}.b-ryzyko{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
.t-reszta{opacity:.55}
.hide{display:none!important}
@media(max-width:820px){.m{grid-template-columns:24px 44px minmax(0,1fr) 50px;row-gap:6px;gap:8px;padding:8px}.odds,.wx{display:none}.plan{grid-column:2/5;min-width:0}.top .meta{font-size:11px}.pills button{padding:7px 10px}}
.m>*{min-width:0}
footer{color:var(--dim);font-size:12px;padding:8px 4px 32px}
</style></head><body>
<div class="top"><h1>📋 ŚCIĄGA <b>${DATE}</b></h1><span class="meta">${rows.length} meczów · kursy Bet365 przedmeczowe · odświeżono ${updated}</span></div>
<div class="wrap">
<div class="pills">
<button data-f="all" class="on">WSZYSTKIE<small>${rows.length}</small></button>
${['must', 'szansa', 'ryzyko', 'reszta'].filter(cnt).map(k => `<button data-f="${k}">${TIER[k][0]} ${TIER[k][1]}<small>${cnt(k)}</small></button>`).join('')}
<button data-f="fav">☆ ULUBIONE</button>
</div>
${groups.map(league).join('')}
<footer>Kursy przedmeczowe — na żywo sprawdzaj w STS. MUSI = drużyna w Lidze Mistrzów walczy o top 24, TOP 8 = walczy o 1/8. Odśwież: w czacie „odśwież ściągę”.</footer>
</div>
<script>
const K='sciaga_fav';const fav=new Set(JSON.parse(localStorage.getItem(K)||'[]'));
const rows=[...document.querySelectorAll('.m')];
rows.forEach((m,i)=>{const id=m.querySelector('.tn').textContent+'|'+m.querySelectorAll('.tn')[1].textContent;m.dataset.id=id;const s=m.querySelector('.star');if(fav.has(id))s.classList.add('on'),s.textContent='★';
s.onclick=()=>{fav.has(id)?fav.delete(id):fav.add(id);localStorage.setItem(K,JSON.stringify([...fav]));s.classList.toggle('on');s.textContent=s.classList.contains('on')?'★':'☆';}});
document.querySelectorAll('.pills button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.pills button').forEach(x=>x.classList.toggle('on',x===b));const f=b.dataset.f;
rows.forEach(m=>m.classList.toggle('hide',!(f==='all'||(f==='fav'?fav.has(m.dataset.id):m.dataset.tier===f))));
document.querySelectorAll('.lg').forEach(l=>l.classList.toggle('hide',!l.querySelector('.m:not(.hide)')));});
document.querySelectorAll('.lh .star').forEach(s=>s.onclick=()=>{s.classList.toggle('on');s.textContent=s.classList.contains('on')?'★':'☆';});
</script>
</body></html>`;
mkdirSync(new URL('../sciaga/', import.meta.url), { recursive: true });
writeFileSync(new URL('../sciaga/index.html', import.meta.url), html);
console.log(`gotowe: sciaga/index.html · ${rows.length} meczów · must ${rows.filter(r => r.tier === 'must').length}, szansa ${rows.filter(r => r.tier === 'szansa').length}, ryzyko ${rows.filter(r => r.tier === 'ryzyko').length}`);
