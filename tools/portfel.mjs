#!/usr/bin/env node
// Portfel Claude — wirtualna pula (domyślnie 100 zł). Uczciwy zapis: kurs i wynik w chwili zakładu pobiera skrypt z API
// (nie da się wpisać kursu „z głowy”), rozliczenie też robi skrypt. Podatek 12% od stawki jak w STS.
//   node tools/portfel.mjs scan                      → kandydaci na żywo (kursy, faworyt przedmeczowy, statystyki)
//   node tools/portfel.mjs bet <fixtureId> <rynek> <stawka> "<dlaczego>"
//        rynki: over (kolejny gol w meczu) · over2 (jeszcze 2 gole) · tg:home|away:1.5 (gole drużyny powyżej) · dc:1x|x2|12 (podwójna szansa) · next:home|away (kto strzeli następny) · win:home|draw|away
//   node tools/portfel.mjs sklad <fixtureId>   // ilu podstawowych w wyjściowej 11
//        node tools/portfel.mjs watch                     → co 60 s rozlicza i odświeża sciaga/portfel.html; kończy się przy zmianie
//   node tools/portfel.mjs reset [kwota]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const KEY = '3821c5caa752d0533003cfa14a4c2650', B = 'https://v3.football.api-sports.io', TAX = 0.88;
const NO_STS = ['Russia', 'Belarus', 'Iran'];
const DIR = new URL('../sciaga/', import.meta.url); mkdirSync(DIR, { recursive: true });
const SF = new URL('portfel.json', DIR), HF = new URL('portfel.html', DIR);
const load = () => existsSync(SF) ? JSON.parse(readFileSync(SF, 'utf8')) : { start: 100, bets: [] };
const save = s => { writeFileSync(SF, JSON.stringify(s, null, 1)); writeFileSync(new URL('portfel.js', DIR), 'window.PORTFEL=' + JSON.stringify(s) + ';'); }; // .js czyta ściąga (oznacza mecze AI BOT)
const af = async p => { for (let k = 0; k < 3; k++) { try { return (await (await fetch(B + p, { headers: { 'x-apisports-key': KEY } })).json()).response || []; } catch { await new Promise(r => setTimeout(r, 8000)); } } return []; };
const zl = x => x.toFixed(2).replace('.', ',') + ' zł', k2 = x => (+x).toFixed(2).replace('.', ',');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' }).slice(0, 5);
const vals = (o, test) => ((o?.odds || []).find(test)?.values || []).filter(v => !v.suspended);
const liveOdds = (o, g) => ({
  over: vals(o, b => b.id === 25).find(v => v.value === 'Over' && +v.handicap === g + 0.5)?.odd,
  over2: vals(o, b => b.id === 25).find(v => v.value === 'Over' && +v.handicap === g + 1.5)?.odd,
  next: Object.fromEntries(vals(o, b => /which team will score the \d+\w\w goal/i.test(b.name)).map(v => [v.value, v.odd])),
  ft: Object.fromEntries(vals(o, b => b.id === 59).map(v => [v.value, v.odd])),
  tg: (side, line) => vals(o, b => b.id === (side === 'home' ? 58 : 39)).find(v => v.value === 'Over' && +v.handicap === +line)?.odd,
  dc: Object.fromEntries(vals(o, b => b.id === 72).map(v => [v.value, v.odd])),
});
const balance = s => { const staked = s.bets.reduce((a, b) => a + b.stake, 0), back = s.bets.reduce((a, b) => a + (b.payout || 0), 0), open = s.bets.filter(b => b.status === 'open').reduce((a, b) => a + b.stake, 0); return { free: s.start - staked + back, open, total: s.start - staked + back + open, staked, back }; };

async function scan() {
  const live = await af('/fixtures?live=all'), L = Object.fromEntries(live.map(f => [f.fixture.id, f]));
  for (const o of await af('/odds/live')) {
    const f = L[o.fixture.id]; if (!f || NO_STS.includes(f.league.country)) continue;
    const st = f.fixture.status.short, el = f.fixture.status.elapsed || 0; if (!['1H', '2H', 'HT'].includes(st)) continue;
    const gh = f.goals.home, ga = f.goals.away; if (o.teams?.home?.goals != null && (o.teams.home.goals !== gh || o.teams.away.goals !== ga)) continue;
    const lo = liveOdds(o, gh + ga); let extra = '';
    if (el >= 35 && el <= 82) {
      const pm = (await af(`/odds?fixture=${f.fixture.id}&bookmaker=8`))[0]?.bookmakers?.[0]?.bets?.find(b => b.id === 1)?.values || [];
      const pv = n => pm.find(v => v.value === n)?.odd || '-';
      const s = await af(`/fixtures/statistics?fixture=${f.fixture.id}`);
      const stat = s.map(t => { const m = Object.fromEntries(t.statistics.map(x => [x.type, x.value])); return `${m['Total Shots'] ?? '-'}/${m['Shots on Goal'] ?? '-'}/${m['Corner Kicks'] ?? '-'} xg${m.expected_goals ?? '-'}`; }).join(' vs ');
      const reds = f.events.filter(e => e.type === 'Card' && /Red/.test(e.detail)).map(e => 'RED ' + e.team.name).join(',');
      extra = ` | przedmecz ${pv('Home')}/${pv('Draw')}/${pv('Away')} | ${stat || 'brak stat'} ${reds}`;
    }
    console.log(`${f.fixture.id} ${f.league.country}: ${f.league.name} | ${f.teams.home.name} ${gh}:${ga} ${f.teams.away.name} ${st} ${el}' | +gol ${lo.over ?? '-'} +2gole ${lo.over2 ?? '-'} | next 1=${lo.next['1'] ?? '-'} brak=${lo.next['No goal'] ?? '-'} 2=${lo.next['2'] ?? '-'} | 1X2 ${lo.ft.Home ?? '-'}/${lo.ft.Draw ?? '-'}/${lo.ft.Away ?? '-'}${extra}`);
  }
}

// Skład: ilu zawodników z wyjściowej 11 zaczynało co najmniej połowę z ostatnich 5 meczów tych rozgrywek (lekcja 2026-11-24: Palmeiras 0/11 przed finałem Copa Libertadores)
async function sklad(f) {
  const out = [];
  for (const t of await af(`/fixtures/lineups?fixture=${f.fixture.id}`)) {
    const last = (await af(`/fixtures?team=${t.team.id}&last=8`)).filter(x => x.fixture.id !== f.fixture.id && x.league.id === f.league.id).slice(0, 5), cnt = {}; let n = 0;
    for (const x of last) { const l = (await af(`/fixtures/lineups?fixture=${x.fixture.id}`)).find(y => y.team.id === t.team.id); if (!l) continue; n++; for (const p of l.startXI) cnt[p.player.id] = (cnt[p.player.id] || 0) + 1; }
    if (n >= 3) out.push({ name: t.team.name, reg: t.startXI.filter(p => (cnt[p.player.id] || 0) >= Math.ceil(n / 2)).length, n });
  }
  return out;
}
async function bet(fid, market, stake, note) {
  const s = load(), f = (await af(`/fixtures?id=${fid}`))[0], o = (await af(`/odds/live?fixture=${fid}`))[0];
  if (!f || !o) throw new Error('brak meczu albo kursów na żywo');
  const gh = f.goals.home, ga = f.goals.away, el = f.fixture.status.elapsed;
  if (o.teams.home.goals !== gh || o.teams.away.goals !== ga) throw new Error('kursy nie pasują do wyniku — odrzucam');
  // Dwumecz (lekcja 2026-11-24: Coquimbo przegrywało 0:1, ale po 2:0 w pierwszym meczu nie musiało gonić): pokaż wynik łączny
  if (!/regular season/i.test(f.league.round || '')) {
    const first = (await af(`/fixtures/headtohead?h2h=${f.teams.home.id}-${f.teams.away.id}&last=3`)).find(x => x.fixture.id !== f.fixture.id && x.league.id === f.league.id && x.league.round === f.league.round && ['FT', 'AET', 'PEN'].includes(x.fixture.status.short) && Date.now() - new Date(x.fixture.date) < 45 * 864e5);
    if (first) { const hA = gh + (first.teams.home.id === f.teams.home.id ? first.goals.home : first.goals.away), aA = ga + (first.teams.home.id === f.teams.away.id ? first.goals.home : first.goals.away); console.log(`DWUMECZ: pierwszy mecz ${first.teams.home.name} ${first.goals.home}:${first.goals.away} ${first.teams.away.name} → łącznie ${f.teams.home.name} ${hA}:${aA} ${f.teams.away.name}. ${hA === aA ? 'Remis w dwumeczu.' : 'Gonić musi ' + (hA < aA ? f.teams.home.name : f.teams.away.name) + '.'}`); }
  }
  // Bramka „rezerwowy skład”: mniej niż 6 podstawowych w wyjściowej 11 → odrzucam (chyba że --mimo)
  const xi = await sklad(f); for (const t of xi) { const msg = `SKŁAD: ${t.name} — ${t.reg} z 11 podstawowych (z ostatnich ${t.n} meczów)`; console.log(msg); if (t.reg < 6 && !process.argv.includes('--mimo')) throw new Error(msg + ' — rezerwowy skład. Dodaj --mimo, żeby zagrać mimo to.'); }
  // Bramka „ważny mecz za kilka dni” (lekcja 2026-11-24: Palmeiras 4 dni przed finałem Copa Libertadores): bez --mimo zakład jest odrzucany
  for (const t of [f.teams.home, f.teams.away]) for (const x of await af(`/fixtures?team=${t.id}&next=2`)) {
    const days = (new Date(x.fixture.date) - Date.now()) / 864e5, big = /libertadores|sudamericana|champions|europa|conference|cup|copa|coppa|pokal|puchar|final/i.test(x.league.name + ' ' + (x.league.round || ''));
    if (days <= 5 && big) { const msg = `UWAGA: ${t.name} gra za ${Math.ceil(days)} dni ${x.league.name} (${x.league.round || ''}) — ${x.teams.home.name} – ${x.teams.away.name}. Możliwy rezerwowy skład.`; if (!process.argv.includes('--mimo')) throw new Error(msg + ' Dodaj --mimo, żeby zagrać mimo to.'); console.log(msg); }
  }
  const lo = liveOdds(o, gh + ga), [kind, side, line] = market.split(':'), DC = { '1x': 'Home or Draw', x2: 'Away or Draw', '12': 'Home or Away' };
  const odd = +(kind === 'tg' ? lo.tg(side, line) : kind === 'dc' ? lo.dc[DC[side]] : kind === 'over' ? lo.over : kind === 'over2' ? lo.over2 : kind === 'next' ? lo.next[side === 'home' ? '1' : '2'] : lo.ft[{ home: 'Home', draw: 'Draw', away: 'Away' }[side]]);
  if (!odd) throw new Error('rynek zawieszony albo niedostępny');
  stake = +stake; if (balance(s).free < stake) throw new Error('za mało wolnych środków');
  const tn = side === 'home' ? f.teams.home.name : f.teams.away.name;
  const label = kind === 'tg' ? `${tn}: powyżej ${String(line).replace('.', ',')} gola w meczu` : kind === 'dc' ? `Podwójna szansa: ${side === '1x' ? f.teams.home.name + ' lub remis' : side === 'x2' ? f.teams.away.name + ' lub remis' : 'nie będzie remisu'}` : kind === 'over' ? `Kolejny gol w meczu (razem ${gh + ga + 1} lub więcej)` : kind === 'over2' ? `Jeszcze 2 gole w meczu (razem ${gh + ga + 2} lub więcej)` : kind === 'next' ? `Następny gol: ${side === 'home' ? f.teams.home.name : f.teams.away.name}` : `Wynik: ${side === 'draw' ? 'remis' : side === 'home' ? f.teams.home.name : f.teams.away.name}`;
  s.bets.push({ n: s.bets.length + 1, time: now(), fid: +fid, league: `${f.league.country}: ${f.league.name}`, home: f.teams.home.name, away: f.teams.away.name, kind, side: side || '', line: line ? +line : undefined, xi: xi.map(t => `${t.name} ${t.reg}/11`).join(' · '), label, odd, stake, at: [gh, ga], min: el, note, status: 'open', cur: [gh, ga], curMin: el });
  save(s); await render(s); console.log(`ZAPISANO #${s.bets.length}: ${f.teams.home.name} ${gh}:${ga} ${f.teams.away.name} (${el}') · ${label} · kurs ${odd} · ${stake} zł · do wygrania ${zl(stake * TAX * odd)}`);
}

async function settle(s) {
  const open = s.bets.filter(b => b.status === 'open'); if (!open.length) return [];
  const fx = await af(`/fixtures?ids=${[...new Set(open.map(b => b.fid))].join('-')}`), changed = [];
  for (const b of open) {
    const f = fx.find(x => x.fixture.id === b.fid); if (!f) continue;
    const st = f.fixture.status.short, fin = ['FT', 'AET', 'PEN'].includes(st), reg = ['AET', 'PEN'].includes(st) && f.score.fulltime.home != null ? f.score.fulltime : f.goals;
    const h = reg.home, a = reg.away, tot0 = b.at[0] + b.at[1]; b.cur = [h, a]; b.curMin = fin ? 'koniec' : f.fixture.status.elapsed;
    let res = null;
    if (b.kind === 'over') res = h + a > tot0 ? true : fin ? false : null;
    else if (b.kind === 'over2') res = h + a > tot0 + 1 ? true : fin ? false : null;
    else if (b.kind === 'next') {
      const dh = h - b.at[0], da = a - b.at[1];
      if (dh > 0 && da === 0) res = b.side === 'home'; else if (da > 0 && dh === 0) res = b.side === 'away';
      else if (dh > 0 && da > 0) { // oba strzeliły między odświeżeniami → kolejność z osi zdarzeń
        const gl = f.events.filter(e => e.type === 'Goal' && !/Missed/.test(e.detail)), e = gl[tot0];
        if (e) { let sd = e.team.id === f.teams.home.id ? 'home' : 'away'; res = b.side === sd; }
      } else if (fin) res = false;
    } else if (b.kind === 'tg') { const tg = b.side === 'home' ? h : a; res = tg > b.line ? true : fin ? false : null; }
    else if (b.kind === 'dc') res = fin ? (b.side === '1x' ? h >= a : b.side === 'x2' ? a >= h : h !== a) : null;
    else if (b.kind === 'win') res = fin ? (b.side === 'home' ? h > a : b.side === 'away' ? a > h : h === a) : null;
    if (res !== null) { b.status = res ? 'won' : 'lost'; b.payout = res ? +(b.stake * TAX * b.odd).toFixed(2) : 0; b.end = now(); changed.push(b); }
  }
  save(s); return changed;
}

async function render(s) {
  const bal = balance(s), done = s.bets.filter(b => b.status !== 'open'), won = done.filter(b => b.status === 'won').length;
  const row = b => `<tr class="${b.status}"><td>${b.n}</td><td>${b.time}</td><td><b>${esc(b.home)} – ${esc(b.away)}</b><small>${esc(b.league)}</small></td><td><b>${esc(b.label)}</b><small>${esc(b.note)}</small></td>
<td class="num">${b.at.join(':')}<small>${b.min}'</small></td><td class="num">${k2(b.odd)}</td><td class="num">${zl(b.stake)}</td><td class="num">${b.cur.join(':')}<small>${b.curMin}${typeof b.curMin === 'number' ? "'" : ''}</small></td>
<td class="st">${b.status === 'open' ? 'GRA' : b.status === 'won' ? '✓ WYGRANY' : '✗ PRZEGRANY'}</td><td class="num pl">${b.status === 'open' ? `<small>do wygrania</small>${zl(b.stake * TAX * b.odd)}` : (b.payout - b.stake >= 0 ? '+' : '−') + zl(Math.abs(b.payout - b.stake))}</td></tr>`;
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>Portfel Claude</title>
<style>
:root{--bg:#001e28;--panel:#00141e;--lh:#0b2a36;--line:#0e3442;--text:#e6eef0;--dim:#8ba0a8;--red:#ff0046;--acc:#FF5A1F;--pos:#4ADE80;--warn:#FFB347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 Manrope,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
.top{background:var(--panel);padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}.top h1{margin:0;font-size:18px}.top h1 b{color:var(--acc)}.top a{color:var(--dim);font-size:12px}.top .meta{color:var(--dim);font-size:12px}
.wrap{max-width:1300px;margin:0 auto;padding:16px}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}.kpi div{background:var(--panel);border-radius:12px;padding:16px}.kpi small{display:block;color:var(--dim);font-size:11px;letter-spacing:.05em;text-transform:uppercase}.kpi b{font-size:28px}
.up{color:var(--pos)}.down{color:var(--red)}
.card{background:var(--panel);border-radius:12px;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:900px}th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dim);padding:10px 12px;background:var(--lh);font-weight:600}
td{padding:10px 12px;border-top:1px solid var(--line);vertical-align:top}td small{display:block;color:var(--dim);font-size:11px;font-weight:400}.num{white-space:nowrap}
tr.open .st{color:var(--warn);font-weight:800}tr.won .st,tr.won .pl{color:var(--pos);font-weight:800}tr.lost .st,tr.lost .pl{color:var(--red);font-weight:800}tr.lost td:not(.st):not(.pl){opacity:.6}
.rules{color:var(--dim);font-size:12px;margin-top:14px;line-height:1.6}.rules b{color:var(--text)}.empty{padding:24px;color:var(--dim)}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}.pills a{background:#0d2f3c;color:var(--text);border:1px solid transparent;border-radius:8px;padding:7px 14px;font:700 12px/1 inherit;letter-spacing:.06em;text-decoration:none}.pills a:hover{border-color:#2b6577}.pills a.on{background:var(--red);margin-left:auto}
@media(max-width:800px){.kpi{grid-template-columns:1fr 1fr}}
</style></head><body>
<div class="top"><h1>Portfel <b>Claude</b></h1><span class="meta">wirtualna pula · start ${zl(s.start)} · odświeżono ${new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' })} · strona odświeża się sama co 30 s</span></div>
<div class="wrap">
<div class="pills"><a href="index.html#all">ALL</a><a href="index.html#must">MUST</a><a href="index.html#szansa">CHANCE</a><a href="index.html#ryzyko">RISK</a><a href="index.html#fav">FAVOURITE</a><a href="index.html#moje">MY BETS</a><a href="index.html#hist">HISTORY</a><a class="on" href="portfel.html">AI BOT</a><a href="wiki.html">WIKI</a></div>
<div class="kpi"><div><small>Pula teraz</small><b class="${bal.total > s.start ? 'up' : bal.total < s.start ? 'down' : ''}">${zl(bal.total)}</b></div><div><small>Wolne środki</small><b>${zl(bal.free)}</b></div><div><small>W grze</small><b>${zl(bal.open)}</b></div><div><small>Trafione</small><b>${won}/${done.length}</b></div><div><small>Pula, gdy wejdą wszystkie</small><b class="up">${zl(bal.free + s.bets.filter(b => b.status === 'open').reduce((a, b) => a + b.stake * TAX * b.odd, 0))}</b></div></div>
<div class="card">${s.bets.length ? `<table><tr><th>#</th><th>Godz.</th><th>Mecz</th><th>Zakład i powód</th><th>Wynik przy wejściu</th><th>Kurs</th><th>Stawka</th><th>Teraz</th><th>Status</th><th>Zysk</th></tr>${[...s.bets].reverse().map(row).join('')}</table>` : '<div class="empty">Jeszcze nic nie zagrałem. Czekam na okazję zgodną z regułami.</div>'}</div>
<div class="rules"><b>Zasady:</b> kurs i wynik w chwili zakładu zapisuje skrypt prosto z API (kursy bukmacherskie na żywo, mogą się różnić od STS o kilka setnych). Podatek 12% od stawki jak w STS. Bez AKO.<br><b>Test przyspieszony (start 23:00, 60 minut gry):</b> cel 200 zł. Połowa puli (50 zł) jest nietykalna, drugą połową gram ostro — kilka zakładów na jeden scenariusz, wyższe kursy.<br>
<b>Gram tylko trzy schematy:</b> 1) faworyt nie prowadzi po 45' → jego gol albo kolejny gol w meczu · 2) otwarty mecz, obie drużyny muszą → kolejny gol · 3) rywal w dziesiątkę. Kurs co najmniej 1,90.</div>
</div></body></html>`;
  writeFileSync(HF, html);
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'scan') await scan();
else if (cmd === 'sklad') { const f = (await af(`/fixtures?id=${a[0]}`))[0]; for (const t of await sklad(f)) console.log(`${t.name}: ${t.reg} z 11 podstawowych (z ostatnich ${t.n} meczów)`); }
else if (cmd === 'bet') await bet(a[0], a[1], a[2], a[3] || '');
else if (cmd === 'reset') { const s = { start: +(a[0] || 100), bets: [] }; save(s); await render(s); console.log('portfel wyzerowany:', zl(s.start)); }
else if (cmd === 'watch') {
  for (let i = 0; i < 240; i++) {
    const s = load(), ch = await settle(s); await render(s); const bal = balance(s);
    if (ch.length) { for (const b of ch) console.log(`ROZLICZONY #${b.n}: ${b.home} ${b.cur.join(':')} ${b.away} · ${b.label} · ${b.status === 'won' ? 'WYGRANY +' + zl(b.payout - b.stake) : 'PRZEGRANY −' + zl(b.stake)}`); console.log(`PULA: ${zl(bal.total)} (wolne ${zl(bal.free)}, w grze ${zl(bal.open)})`); process.exit(0); }
    if (!s.bets.some(b => b.status === 'open')) { console.log('brak otwartych zakładów · PULA: ' + zl(bal.total)); process.exit(0); }
    await new Promise(r => setTimeout(r, 60_000));
  }
} else { const s = load(); await settle(s); await render(s); const bal = balance(s); console.log(`PULA ${zl(bal.total)} · wolne ${zl(bal.free)} · w grze ${zl(bal.open)} · zakładów ${s.bets.length}`); }
