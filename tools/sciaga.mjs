#!/usr/bin/env node
// Ściąga meczowa na dziś: 3 koszyki (MUSZĄ / SZANSA / RYZYKO), lokalny plik HTML.
// Użycie: node tools/sciaga.mjs [YYYY-MM-DD]  → sciaga/index.html (poza gitem — repo jest publiczne)
import { writeFileSync, mkdirSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io';
const ARGS = process.argv.slice(2), PLUS = (ARGS.find(a => a.startsWith('--plus=')) || '').slice(7).split(',').filter(Boolean);
const DATE = ARGS.find(a => /^\d{4}-\d\d-\d\d$/.test(a)) || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
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
let fx = (await af(`/fixtures?date=${DATE}&timezone=Europe/Warsaw`)).response
  .filter(f => LEAGUES[f.league.id] && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(f.fixture.status.short))
  ;
// --plus=id,id → dodatkowe mecze spoza listy lig (np. test na żywo)
if (PLUS.length) for (const f of (await af(`/fixtures?ids=${PLUS.join('-')}`)).response || []) {
  LEAGUES[f.league.id] ||= [null, (f.league.country === 'World' ? 'ŚWIAT' : f.league.country).toUpperCase(), f.league.name];
  if (!fx.some(x => x.fixture.id === f.fixture.id)) fx.push(f);
}
fx.sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));

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
  rows.push({ fid: f.fixture.id, time: f.fixture.date.slice(11, 16), lid: f.league.id, flag, country, lname, H: H.name, A: A.name, hLogo: H.logo, aLogo: A.logo, tH, tA, mH, mA, avgGoals, o1, ox, o2, ou, btts, wx, tier, plan });
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
const row = r => `<div class="m t-${r.tier}" data-tier="${r.tier}" data-fid="${r.fid}" data-h="${esc(r.H)}" data-a="${esc(r.A)}" data-must="${esc(r.mH && /MUSI/.test(r.mH) ? r.H : r.mA && /MUSI/.test(r.mA) ? r.A : r.mH ? r.H : r.mA ? r.A : '')}" data-lg="${esc(r.country + ': ' + r.lname)}">
<button class="star" aria-label="Ulubiony">☆</button>
<div class="time" data-t="${r.time}">${r.time}</div>
<div class="teams">${team(r.H, r.hLogo, r.tH, r.mH)}${team(r.A, r.aLogo, r.tA, r.mA)}</div>
<div class="sc"><div class="sr"><i></i><i></i><b>–</b></div><div class="sr"><i></i><i></i><b>–</b></div></div>
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
.wrap{max-width:1500px;margin:0 auto;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.side{order:2;position:sticky;top:12px;background:var(--panel);border-radius:8px;overflow:hidden;max-height:calc(100vh - 24px);display:flex;flex-direction:column}
.side h3{margin:0;background:var(--lh);padding:10px 12px;font-size:13px;letter-spacing:.04em}.side .hl{overflow-y:auto}
.side .empty{color:var(--dim);font-size:12px;padding:14px 12px}
.hint{--k:var(--acc);margin:10px;padding:12px 14px;border-radius:10px;font-size:12px;background:color-mix(in srgb,var(--k) 16%,var(--panel));border:1px solid color-mix(in srgb,var(--k) 45%,transparent)}
.hint.k-szansa{--k:var(--pos)}.hint.k-ryzyko{--k:var(--warn)}.hint.old{opacity:.5}
.hint.new{background:color-mix(in srgb,var(--k) 32%,var(--panel));animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--k) 40%,transparent)}}
.hint .tag{display:inline-block;background:var(--k);color:#00141e;font-weight:900;font-size:11px;letter-spacing:.06em;border-radius:999px;padding:2px 9px;margin-bottom:6px}
.side.hot h3{background:var(--acc);color:#fff}.side .empty b{color:var(--text)}
.toast{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9;background:var(--acc);color:#fff;font-weight:900;font-size:18px;padding:14px 22px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);animation:pulse 1.2s infinite;cursor:pointer;max-width:92vw}
.toast small{display:block;font-weight:600;font-size:12px;opacity:.9}
.hint .hm{color:var(--dim)}.hint .ha{font-size:18px;font-weight:900;margin:2px 0 4px;color:#fff}.hint .hw{color:var(--text);opacity:.8}
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
.m{display:grid;grid-template-columns:28px 52px minmax(200px,1.4fr) 76px 58px 220px 44px minmax(190px,1.2fr);align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--line)}
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
.sc{display:flex;flex-direction:column;font-weight:800;font-size:15px;color:var(--dim)}.sr{display:flex;align-items:center;justify-content:flex-end;gap:2px;height:24px}
.sr i{font-style:normal;font-size:11px;font-weight:600;color:var(--dim);width:18px;text-align:center}.sr b{width:24px;text-align:center;border-radius:4px;line-height:20px}
.sr b.last{background:#163d4b;color:#fff}.sc.hd::before{content:'1p 2p';font-size:9px;color:var(--dim);text-align:right;padding-right:28px;margin-top:-12px;height:12px;letter-spacing:.04em}
.live .time{color:var(--red)}.live .sc{color:var(--red)}.fin .sc{color:var(--text)}.fin .time{font-size:12px}
.rc{display:inline-block;width:9px;height:13px;background:var(--red);border-radius:2px;margin-left:2px}
.m.goal{opacity:1!important;background:color-mix(in srgb,var(--red) 38%,var(--panel))}.m.goal .time::after{content:' GOL';color:var(--red);font-size:11px}
.livebar{color:var(--dim);font-size:12px}.livebar b{color:var(--red)}
@media(max-width:820px){.m{grid-template-columns:24px 44px minmax(0,1fr) 28px 50px;row-gap:6px;gap:8px;padding:8px}.odds,.wx,.sr i,.sc.hd::before{display:none}.plan{grid-column:2/6;min-width:0}.top .meta{font-size:11px}.pills button{padding:7px 10px}}
.m>*{min-width:0}
footer{color:var(--dim);font-size:12px;padding:8px 4px 32px}
</style></head><body>
<div class="top"><h1>📋 ŚCIĄGA <b>${DATE}</b></h1><button id="simbtn" onclick="simGol()" style="background:#0d2f3c;color:var(--text);border:0;border-radius:8px;padding:6px 10px;font:700 12px inherit;cursor:pointer">⚽ Test gola</button><span class="livebar" id="lb">● na żywo: łączę…</span><span class="meta">${rows.length} meczów · kursy Bet365 przedmeczowe · odświeżono ${updated}</span></div>
<div class="wrap">
<aside class="side"><h3><span>👉</span><span class="tx">POSTAW NA — podpowiedzi na żywo</span><button class="mn" title="Zwiń / rozwiń">▾</button></h3><div class="hl" id="hl"><div class="empty"><b>😴 Cisza — na razie nic pilnego.</b><br>Gdy będzie okazja, zobaczysz tu 🔥 GRAJ TERAZ, usłyszysz sygnał, a na górze ekranu wyskoczy pomarańczowy pasek.</div></div></aside>
<main>
<div class="pills">
<button data-f="all" class="on">WSZYSTKIE<small>${rows.length}</small></button>
${['must', 'szansa', 'ryzyko', 'reszta'].filter(cnt).map(k => `<button data-f="${k}">${TIER[k][0]} ${TIER[k][1]}<small>${cnt(k)}</small></button>`).join('')}
<button data-f="fav">☆ ULUBIONE</button>
</div>
${groups.map(league).join('')}
<footer>Kursy przedmeczowe — na żywo sprawdzaj w STS. MUSI = drużyna w Lidze Mistrzów walczy o top 24, TOP 8 = walczy o 1/8. Odśwież: w czacie „odśwież ściągę”.</footer>
</main>
</div>
<script>
// Na żywo: co 30 s pobiera wyniki, minutę i czerwone kartki (api-football, 1-2 zapytania na odświeżenie)
const H_KEY='sciaga_hints_${DATE}',hints=JSON.parse(localStorage.getItem(H_KEY)||'[]'),fired=new Set(hints.map(h=>h.id)),hist={};
function beep(){try{const c=new AudioContext(),o=c.createOscillator();o.frequency.value=880;o.connect(c.destination);o.start();o.stop(c.currentTime+.25);}catch(e){}}
const TAGS={'🔥':['','🔥 GRAJ TERAZ'],'🟢':['k-szansa','🟢 OKAZJA'],'🎲':['k-ryzyko','🎲 RYZYKO']};
function drawHints(){if(!hints.length)return;const age=h=>Date.now()-h.ts;document.querySelector('.side').classList.toggle('hot',hints.some(h=>age(h)<180000));
document.getElementById('hl').innerHTML=hints.map(h=>{const t=TAGS[h.icon]||TAGS['🔥'];return '<div class="hint '+t[0]+(age(h)<180000?' new':age(h)>900000?' old':'')+'"><span class="tag">'+t[1]+'</span><div class="ha">'+h.act+'</div><div class="hw">'+h.match+'</div><div class="hw">'+h.why+'</div><div class="hm">'+h.clock+' · '+h.lg+' · 10-20 zł · kurs ok. 1,9</div></div>'}).join('');}
setInterval(drawHints,15000);
function toast(h){document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className='toast';d.innerHTML=h.icon+' '+h.act+'<small>'+h.match+' · '+h.why+'</small>';d.onclick=()=>d.remove();document.body.append(d);setTimeout(()=>d.remove(),90000);}
function hint(id,icon,act,why,m,label){if(fired.has(id))return;fired.add(id);hints.unshift({id,icon,act,why,match:label,lg:m.dataset.lg,clock:new Date().toLocaleTimeString('pl-PL').slice(0,5),ts:Date.now()});hints.splice(30);localStorage.setItem(H_KEY,JSON.stringify(hints));drawHints();beep();toast(hints[0]);document.querySelector('.side').classList.remove('min');document.title='👉 '+act;}
drawHints();
const KEY='${KEY}',FIDS=[...document.querySelectorAll('.m')].map(m=>m.dataset.fid);const prev={};
async function live(){
  try{
    const out=[];for(let i=0;i<FIDS.length;i+=20){const j=await (await fetch('${B}/fixtures?ids='+FIDS.slice(i,i+20).join('-'),{headers:{'x-apisports-key':KEY}})).json();out.push(...(j.response||[]));}
    let nLive=0,goals=[];
    for(const f of out){const m=document.querySelector('.m[data-fid="'+f.fixture.id+'"]');if(!m)continue;
      const st=f.fixture.status.short,el=f.fixture.status.elapsed,ex=f.fixture.status.extra;
      const isLive=['1H','2H','ET','P','LIVE','BT'].includes(st)||st==='HT',isFin=['FT','AET','PEN'].includes(st);
      m.classList.toggle('live',isLive);m.classList.toggle('fin',isFin);if(isLive)nLive++;
      const t=m.querySelector('.time');t.textContent=st==='HT'?'Przerwa':isLive?(el+(ex?'+'+ex:'')+"'"):isFin?'Koniec':t.dataset.t;
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
      const key=f.goals.home+':'+f.goals.away;if(prev[f.fixture.id]&&prev[f.fixture.id]!==key&&isLive){m.classList.add('goal');setTimeout(()=>m.classList.remove('goal'),90000);goals.push(f.teams.home.name+' '+key+' '+f.teams.away.name);}
      prev[f.fixture.id]=key;
      if(isLive&&st!=='HT'&&el){
        const gh=f.goals.home,ga=f.goals.away,H=f.teams.home.name,A=f.teams.away.name,label=H+' '+gh+':'+ga+' '+A+' ('+el+"')",id=f.fixture.id,tier=m.dataset.tier;
        // 1. Nacisk: w 5 min celny + 2 strzały albo 3 rożne
        for(const t of (f.statistics||[])){const g=Object.fromEntries(t.statistics.map(x=>[x.type,x.value]));const now={el,sh:+g['Total Shots']||0,so:+g['Shots on Goal']||0,co:+g['Corner Kicks']||0};
          const h=(hist[id+'|'+t.team.id]||=[]);h.push(now);const b=h.filter(x=>x.el<=el-5).pop();
          if(b&&el<=85){const d={sh:now.sh-b.sh,so:now.so-b.so,co:now.co-b.co};if((d.so>=1&&d.sh>=2)||d.co>=3)hint(id+'n'+Math.floor(el/10),'🔥','Gol '+t.team.name,'naciska: od '+b.el+"' strzały +"+d.sh+', celne +'+d.so+', rożne +'+d.co,m,label);}}
        // 2. MUSI, a nie wygrywa po 60'
        const mu=m.dataset.must;if(tier==='must'&&mu&&el>=60&&el<=80){const home=mu===m.dataset.h;if(home?gh<=ga:ga<=gh)hint(id+'m','🔥','Gol '+mu,'musi wygrać, a jest '+gh+':'+ga,m,label);}
        // 3. Ryzyko: faworyt z wyjazdu prowadzi → gol gospodarza
        if(tier==='ryzyko'&&el>=55&&el<=80&&ga>gh)hint(id+'r'+gh+ga,'🎲','Gol '+H,'faworyt prowadzi, gospodarz goni',m,label);
        // 4. Szansa: 0:0 lub 1:1 po 55'
        if(tier==='szansa'&&el>=55&&el<=70&&gh===ga&&gh<=1)hint(id+'s'+gh,'🟢','Padnie gol w meczu','liga z dużą liczbą goli, a jest '+gh+':'+ga,m,label);
        // 5. Czerwona dla prowadzącego od 70'
        if(el>=70&&gh!==ga&&Math.abs(gh-ga)<=2){const lead=gh>ga?f.teams.home:f.teams.away,trail=gh>ga?A:H;if((f.events||[]).some(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===lead.id))hint(id+'c','🔥','Gol '+trail,'prowadzący gra w dziesiątkę (historia: TAK)',m,label);}
      }
      const reds=side=>(f.events||[]).filter(e=>e.type==='Card'&&/Red/.test(e.detail)&&e.team.id===f.teams[side].id).length;
      m.querySelectorAll('.team').forEach((tm,i)=>{tm.querySelectorAll('.rc').forEach(x=>x.remove());const n=reds(i?'away':'home');for(let k=0;k<n;k++)tm.querySelector('.tn').insertAdjacentHTML('afterend','<span class="rc" title="Czerwona kartka"></span>');});
    }
    document.getElementById('lb').innerHTML='● na żywo: <b>'+nLive+'</b> w grze · odświeżono '+new Date().toLocaleTimeString('pl-PL');
    if(goals.length){document.title='⚽ GOL! '+goals[0];setTimeout(()=>document.title='Ściąga ${DATE}',60000);}
  }catch(e){document.getElementById('lb').textContent='● na żywo: brak połączenia, ponawiam';}
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
live().then(()=>{if(location.hash==='#gol')setTimeout(simGol,1500);});setInterval(live,30000);
// Symulacja gola (otwórz stronę z #gol na końcu adresu): pierwszy mecz w grze, +1 dla gospodarzy
function simGol(){const m=document.querySelector('.m.live')||document.querySelector('.m');const sr=m.querySelectorAll('.sr');const b=sr[0].querySelector('b');b.textContent=(+b.textContent||0)+1;
sr.forEach((r,i)=>r.querySelector('b').classList.toggle('last',i===0));m.classList.add('goal');setTimeout(()=>m.classList.remove('goal'),90000);
document.title='⚽ GOL! '+m.dataset.h+' '+b.textContent+':'+sr[1].querySelector('b').textContent+' '+m.dataset.a+' (symulacja)';m.scrollIntoView({block:'center'});}
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
