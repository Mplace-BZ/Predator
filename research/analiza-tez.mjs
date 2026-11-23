// Sprawdza tezy Chrisa na meczach historycznych (zdarzenia-*.json z pobierz-zdarzenia.mjs).
// Użycie: node research/analiza-tez.mjs 2025 [2024 ...]
import { readFileSync } from 'node:fs';
const seasons = process.argv.slice(2);
const matches = seasons.flatMap(s => Object.values(JSON.parse(readFileSync(new URL(`./zdarzenia-${s}.json`, import.meta.url), 'utf8'))));
const CHECK = [55, 60, 65, 70, 75, 80];
const agg = {};
const add = (key, hit) => { const a = (agg[key] ||= [0, 0]); a[0]++; if (hit) a[1]++; };

for (const m of matches) {
  const goals = m.ev.filter(e => e.k === 'G').sort((a, b) => a.m - b.m);
  const reds = m.ev.filter(e => e.k === 'R');
  for (const c of CHECK) {
    let h = 0, a = 0, contactAt = null;
    for (const g of goals) {
      if (g.m > c) break;
      const behind = g.t === 'h' ? h < a : a < h;
      if (g.t === 'h') h++; else a++;
      contactAt = behind ? g.m : null;
    }
    const diff = Math.abs(h - a), trail = h < a ? 'h' : a < h ? 'a' : null, lead = trail && (trail === 'h' ? 'a' : 'h');
    const after = goals.filter(g => g.m > c);
    const anyAfter = after.length > 0;
    const trailScores = trail && after.some(g => g.t === trail);
    const leadRed = lead && reds.some(r => r.t === lead && r.m <= c) && !reds.some(r => r.t === trail && r.m <= c);
    const fresh = contactAt != null && c - contactAt <= 10;
    const d = diff >= 3 ? '3+' : String(diff);

    // A/D: przegrywający strzeli po minucie c — wg różnicy
    if (trail) add(`A|${c}'|różnica ${d}|przegrywający strzeli`, trailScores);
    // B: gol kontaktowy ≤10 min temu → padnie jeszcze gol? vs ten sam stan bez świeżego gola kontaktowego
    if (diff <= 1) add(`B|${c}'|różnica ${d}|${fresh ? 'ŚWIEŻY gol kontaktowy' : 'bez gola kontaktowego'}|padnie gol`, anyAfter);
    // C: czerwona kartka prowadzącego → przegrywający strzeli
    if (trail && diff <= 2) add(`C|${c}'|różnica ${d}|${leadRed ? 'PROWADZĄCY z czerwoną' : 'bez czerwonej'}|przegrywający strzeli`, trailScores);
  }
}

const pct = ([n, k]) => `${String(Math.round(100 * k / n)).padStart(3)}%  (${k}/${n})`;
console.log(`Meczów: ${matches.length} · sezony: ${seasons.join(', ')}\n`);
for (const sec of ['A', 'B', 'C']) {
  console.log({ A: 'A. Przegrywający strzeli jeszcze gola — wg różnicy goli', B: 'B. Padnie jeszcze gol — po świeżym golu kontaktowym (≤10 min) vs bez', C: 'C. Przegrywający strzeli — gdy prowadzący ma czerwoną kartkę' }[sec]);
  for (const [k, v] of Object.entries(agg).filter(([k]) => k.startsWith(sec + '|')).sort())
    if (v[0] >= 10 || sec === 'C') console.log('  ' + k.slice(2).padEnd(70) + pct(v));
  console.log();
}
