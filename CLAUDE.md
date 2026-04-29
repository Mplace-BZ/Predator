# Predator — Live Match Predictor

## Co to jest
Single-page aplikacja do przewidywania wyników meczów piłkarskich w czasie rzeczywistym.
Model Poissona z xG, używana głównie w ostatnich 15 minutach meczu dla najwyższych kursów.

## Brand identity (v7.0)
**Match Predictor** to apka MPlace. Tonalnie: Linear / Vercel dashboard, NIE casino panel.
- Logo: pomarańczowy płomień MPlace (inline SVG) + "Match Predictor" tekstowo
- Akcent: `#FF5A1F` (jeden), drugi: `#FFB347` (accent-soft)
- Stany semantyczne: positive `#4ADE80`, negative `#EF4444`, warning `#FFB347` — **TYLKO** dla werdyktów
- Reguła kolorów: max 3 akcenty na ekranie, kolor = znaczenie, nie dekoracja
- Font: Manrope (system-ui fallback). Mono tylko dla logów / paste textarea.
- Tabular figures dla wszystkich liczb metryk
- Spacing: wielokrotności 8px, padding kart 24px desktop / 16px mobile, gap między sekcjami 32px
- Border-radius: 12px (karty), 8px (input/btn), 999px (badge)
- Dark mode only, WCAG AA na text (kontrast text-dim podkręcony do 4.5:1)

## Layout v7.0 (3-section hierarchy)
1. **HEADER** — minimalny: flame logo + "Match Predictor" + traffic light (Czekam / Obserwuj / Graj / Nie graj)
2. **HERO RECOMMENDATION** — full-width karta, ikona + verdict title + reason; pewność modelu (64px) + CTA "Zapisz bet". Zmienia kolor border per stan (positive/warning/negative).
3. **LIVE CONTEXT** — 4 tile grid (mobile 2x2): Minuta, Wynik, Najlepszy edge, Siła sygnału. Liczby 36px białe. Akcent tylko na ikonie label.
4. **DETAILS** — 3 collapsible accordions (open by default for input/predictions, closed for raw data):
   - "Wklej dane meczu" — Match Scanner + paste (FootyStats/Sofascore) + score bar + red card
   - "Pełne predykcje modelu" — hero tiles + goal timing + results panel + edge% + corners + cards + value bets + calibration
   - "Edytuj dane meczu" — wszystkie inputy sezonu/live/corners/cards
5. **FOOTER** — "Powered by MPlace · Match Predictor v7.0" + flame icon

## Microcopy translation (v7.0)
Wszystkie etykiety user-facing przerobione na PL human-friendly:
- "Home scores next" → "Gospodarze strzelą"
- "Any goal remaining" → "Padnie jeszcze gol"
- "Most likely final score" → "Najbardziej prawdopodobny wynik"
- "Peak windows" → "Najgroźniejsze minuty"
- "Parse Data" → "Wczytaj dane"
- "BET / WATCH / NO BET" → "Graj / Obserwuj / Nie graj"
- "STRATEGY CHEATSHEET" → "Skrót strategii"

## Stack techniczny
- Vanilla HTML/CSS/JS — zero dependencies, zero backendu
- GitHub Pages: https://mplace-bz.github.io/Predator/
- Jeden plik: index.html
- Claude API: claude-sonnet-4-20250514 (Match Scanner)
- Cloudflare Worker: proxy dla Claude API (red-haze-5f37mplace-agent.contactmplace.workers.dev)
- Firebase: gotowy ale nie podpięty
- Repo: https://github.com/Mplace-BZ/Predator
- Local: /Users/chrismac/bazgroszyt/Predator/

## Aktualna wersja: v7.11 (Multi-league scan — 50 lig zamiast /todays-matches)

## Goal Velocity (v7.1)
**Problem:** PSG-Bayern @ 5:3 min 66 — model dawał "52% any goal" oparty o sezonowy xG. Mecz tymczasem był szaleńczy (8 goli vs ~2 oczekiwanych). Bayern strzelił → 5:4. Model za bardzo się trzymał baseline'u.

**Fix (calc, ~linia 1331):**
```js
const expectedByNow = (hXG+aXG) * (minute/90);
const ratio = totalGoalsNow / Math.max(0.4, expectedByNow);
if(ratio > 1.4){
  velMult = min(1.5, 1 + (ratio-1.4) * 0.18);
  hLambdaRem *= velMult; aLambdaRem *= velMult;
}
```
- Ratio 1.4 → 0% boost (próg)
- Ratio 2.0 → +11% boost
- Ratio 3.0 → +29%
- Ratio 4.0+ → +47% (capped 50%)
- **NIE dampen** — 0:0 z wysokim xG to anomalia (okazja), nie sygnał "mniej goli"
- Surface: w LIVE CONTEXT pod tile WYNIK pojawia się badge `⚡ 8 goli vs 2.1 xG (×1.43)`

## Match Context Tags (v7.1)
7 togglowanych pigułek nad HERO REC. Multi-select, persistowane w localStorage `predator_match_tags`. Każdy tag mnoży lambdy:

| Tag | Mnożnik | Logika |
|-----|---------|--------|
| 🏆 Finał | ×1.08 | Otwarty mecz, obie strony chcą goli |
| 🥈 Półfinał | ×1.05 | Less open than final |
| 🎯 Mecz decydujący | ×1.05 | O awans / utrzymanie |
| 🔥 Derby | ×1.05 | Emocjonalne, więcej szans |
| ⏱️ Dogrywka | ×0.92 | Zmęczenie, ostrożność |
| 🌧️ Deszcz | ×0.88 | Gorsze warunki, wolniejsza gra |
| 😴 Mecz o nic | ×0.85 | Obie zrelaksowane |

Tagi się kumulują (multiplikacyjnie). Restore on boot przez `loadTags()`.

## Verdict Bar (v7.1)
Wracają 3 przyciski (z v6.7 ale w MPlace tonacji), pod HERO REC:
- 🟧 **Obstaw 1–2 gole** (5% bankrolla) — aktywny gdy GREEN verdict
- 🟨 **Ryzykuj 1 gol** (2% bankrolla) — aktywny gdy YELLOW
- 🟥 **Wstrzymaj się** — aktywny gdy RED

Tylko 1 aktywny na raz (border + bg w stanie semantycznym), reszta na 0.6 opacity. Klik = `placeBet(verdict)` jak poprzednio. Toast wyświetla się przez `vbToast` (qdToast schowany w deprecated panelu).

## Red Card Model Logic (v6.5 — time-decayed, balanced)
Multipliers are time-decayed: full impact at min 0, fade to neutral at min 90.

1. **Lambda modifiers (xG) — time-decayed:**
   - `rcRemFrac = (90 - rcMinute) / 90`
   - `disMod = 1 - 0.45 * rcRemFrac` → 0.55 (early red) … 1.00 (red at 90')
   - `advMod = 1 + 0.55 * rcRemFrac` → 1.55 (early red) … 1.00 (red at 90')
   - **Balance:** 0.55 ↔ 1.55 preserves total xG (vs old 0.55/1.25 which shrank totala)

2. **Corners modifiers:**
   - Total corners lambda *= 1.3 (advantage team pushes more)

3. **Cards/penalty modifiers:**
   - Penalty risk += 8% (advantage team enters box more)
   - Second red card risk += 15% (desperation fouls)

4. **Status card:** Purple with "RED CARD ACTIVE" label

5. **Value bets:** Should auto-suggest advantage team to win/score, over corners

## Momentum blend (v6.5 — fixed averaging)
Linia ~691: `if(signals>1) hMom=0.5+(hMom-0.5)/signals;` — uśrednia odchylenie od neutralnego 0.5 przez liczbę aktywnych sygnałów (DA + SOT + liveXG). Stary kod miał `/signals*signals` (no-op) przez co momentum sumował sygnały bez normalizacji.

## Anomaly Score 2.0 (v6.5+v6.6)
Każdy trigger ma `strength` (0–10), Predator Mode pokazuje najmocniejszy:
- **xG live > thresh + 0:0 + min >25:** strength = 5 + (xG − thresh) × 10
- **xG sezon > thresh + 0:0 + min >25:** strength = 3 + (xG − thresh) × 8
- **DA diff > thresh + dominator nie prowadzi:** strength = 4 + (diff − thresh) / 5
- **SOT > thresh + brak gola:** strength = 2 + (SOT − thresh) × 0.5
- **Big Chances ≥ 2 + brak gola (v6.6):** strength = 6 + BC × 1.0 — JAKOŚĆ dominacji
- **Goal Timing hot zone + 0:0 (v6.6):** strength = 4 + (combined−11)/2 — historyczny peak

## GOAL PREDATOR features (v6.6)
- **Goal Timing Heat Map** — 9 buckets 10-min, kombinowane home+away % chance gola.
  Aktualne okno highlightowane (yellow), hot zones zielone (>=14%), cold czerwone (<9%).
  Peak windows pokazane w footerze.
- **Goal Timing boost in calc():** `boost = ((bucketPct/avgPct)−1) × 0.4` → 16% bucket = +18% lambda.
  Cap: −20%/+25%. Działa per-team (osobno H i A).
- **Big Chances (BC):** Sofascore "Okazje". Trigger Predator gdy BC≥2 bez gola — silniejszy sygnał niż SOT bo to JAKOŚĆ.
- **Form (PPG) nudge:** gdy diff > 0.5 PPG, lambda swing do ±10%. Capped, nie kumuluje się z H2H.
- **Odds Market auto-parse:** z tabeli FootyStats wyciąga 1X2, Over 2.5, Under 2.5, BTTS.
- **1H/2H stats parser:** halfStats.{home,away,league} z BTTS/Over X.Y per polowa.

## Quick Decision Panel (v6.7)
**Sedno apki — pod paste area, 3 wielkie przyciski.** Tylko jeden aktywny (pulsuje). Reszta dimmed.

### Decision logic (`decideQuickBet`)
**Hard skips (RED):**
- minuta brak / minuta > 75 (za późno)
- mniej niż 8/12 pól sezonowych wypełnionych
- brak kursów Over/Next Goal/BTTS (bez kursów = brak edge)

**GREEN — OBSTAW 1-2 GOLE** (stake = 5% bankrolla):
- minuta 30–72
- pAnyGoal ≥ 70%
- ANY: pOver15 ≥ 35% / Predator strength ≥ 6 / Big Chances ≥ 2
- totalLambda ≥ 0.8
- Pulsuje zielonym box-shadow 2s loop

**YELLOW — RYZYKUJ 1 GOL** (stake = 2% bankrolla):
- minuta 25–75
- pAnyGoal ≥ 50%
- ANY: Predator ≥ 3 / Big Chances ≥ 1 / xG rem ≥ 0.6

**RED — WSTRZYMAJ:** wszystko inne

### Stake + payout
`stake = round(bankroll × stakePct)` — 5% (GREEN) lub 2% (YELLOW). Najlepszy kurs (Over → Next Goal → BTTS) używany do wyliczenia `payout = stake × (odd − 1)`.

### Click handler — `placeBet(verdict)`
- Zapisuje do calibration log entry z `bet:{verdict, market, stake, odd, oddLabel, potentialPayout}` + standardowe predykcje
- Pokazuje toast "BET GREEN — X zł zapisane! 🎯"
- Marks button as `.placed` (✓ ZAPISANO badge)
- Po końcu meczu → user wpisuje wynik → calibration computuje hit/miss

### Gamification
- **Streak counter:** fire emoji się skaluje (1🔥, 3🔥🔥, 5🔥🔥🔥). Liczone z calibration history (consecutive wins from latest).
- **Today's W/L:** filtrowane po dzisiejszej dacie z calibration log
- **ROI:** P&L / total stake × 100% (kolorowane: zielony/czerwony)
- **Open positions:** ⏳ liczba zapisanych betów bez wpisanego outcome'u
- Toast celebrate animation (scale 0.5 → 1.15 → 1) przy save

## Field labels (PL — pomocne dla parser indicator)
- xG, goli/mecz, stracone, CS%, corners, kartki — sezonowe per team
- PPG — Points Per Game (form rating)
- Big Chances — Sofascore "Okazje" (jakościowa metryka)
- League avg — średnia goli w lidze (skala progów anomalii)

**League factor:** thresh skaluje się przez `leagueAvg / 1.5`. Przykład: U19 (leagueAvg=0.8) → xgThresh=0.32, DA thresh=10.7. Premier League (leagueAvg=2.7) → xgThresh=1.08, DA thresh=36.

Panel pokazuje: pasek siły 0/10, multi-signal badge ("3 sygnały aktywne"), powód, sugerowany rynek + szacowane kursy.

## Confidence intervals (v6.5)
Każda headline probability (Any goal, Home scores, Away scores) ma sub-line `CI: P10–P90`. Bootstrap: 80 iteracji z lambda perturbacją ±15%. Wąski CI = mocny signal, szeroki = model zgaduje.

## Calibration log (v6.5)
- localStorage `predator_history` (max 200 entries)
- Po analizie: "Zapisz mecz" zachowuje predykcje + kontekst (minuta, wynik, predator active)
- Po końcu meczu: "Wpisz wynik" → outcome computowany od momentu snapshotu
- **Calibration buckets:** 0–20%, 20–40%, …, 80–100% — predicted vs actual hit rate
- **Predator hit rate:** osobna metryka dla meczów gdzie Predator Mode był aktywny
- Po 3+ zamkniętych meczach pokazuje accuracy bars

## Źródła danych
- **FootyStats** — cała strona meczu (sezon, H2H, xG, corners, cards) → parseFooty()
- **Sofascore** — live stats po polsku (Posiadanie, xG, Strzały celne, Wejścia do strefy ataku) → parseLive()
- Sofascore xG live trafia do globalnych liveXGH/liveXGA (momentum), NIE nadpisuje sezonowego hXG/aXG
- parseLive() używa Math.max() — nie nadpisuje wyższych wartości niższymi (np. 2. połowa)
- Dropdown okresu: Cały mecz / 1. połowa / 2. połowa
- **Parsing indicator (v6.5):** po Parse Data widoczny licznik "X/12 pól sezonowych wypełnionych" + lista brakujących (kolor: zielony / żółty / czerwony)
- **League avg goals/match** parsed z FootyStats lub manualnie (default 1.5) → wpływa na progi anomalii

## Tuning parametrów modelu
- **Momentum blend:** 30% base, 40% gdy DA diff >15, 45% gdy >25
- **Red card decay:** liniowy `(90-rcMinute)/90`, max impact 0.55/1.55
- **Anomaly thresholds:** skalowane przez `leagueFactor = leagueAvg / 1.5`
- **CI bootstrap:** ±15% perturbation, 80 iteracji, p10/p90 percentiles
- **Calibration buckets:** 5 bucketów po 20%, kolor: |diff|<10% zielony, <20% żółty, ≥20% czerwony

## Źródła danych
- **FootyStats** — cała strona meczu (sezon, H2H, xG, corners, cards) → parseFooty()
- **Sofascore** — live stats po polsku (Posiadanie, xG, Strzały celne, Wejścia do strefy ataku) → parseLive()
- Sofascore xG live trafia do globalnych liveXGH/liveXGA (momentum), NIE nadpisuje sezonowego hXG/aXG
- parseLive() używa Math.max() — nie nadpisuje wyższych wartości niższymi (np. 2. połowa)
- Dropdown okresu: Cały mecz / 1. połowa / 2. połowa

## Momentum tuning
Wejścia do strefy ataku z Sofascore (lHDA/lADA) powinny mocniej wpływać na predykcję następnego gola gdy dysproporcja jest duża (np. 21 vs 40). Obecnie model blenduje 30% momentum — rozważ zwiększenie do 40% gdy różnica > 15.

## Następne zadania
1. Więcej value betów — rozszerzyć renderValueBets() o nowe sygnały
2. Yellow cards parser + betting market
3. Matchday form (last 5 games) parser
4. Momentum blend dynamiczny (30% → 40% przy dużej dysproporcji DA)

## Filozofia typowania
- TYLKO Live betting - nigdy przed meczem
- Cel: małe stawki (np. 20 USD) na wysokie kursy (2.1+)
- Szybka decyzja - max 2-3 minuty na analizę meczu
- Najlepszy moment wejścia: gdy wynik NIE odzwierciedla dominacji (np. 0:0 ale xG 0.8:0.1, DA 35:10)
- Kurs rośnie przy 0:0 = bukmacher wątpi = twoja szansa
- Im dłużej 0:0 przy aktywnej grze → tym wyższy kurs i tym bliżej "pęknięcia" — to jest ANOMALIA
- Nigdy nie goń za stratą — brak betu to też dobra decyzja
- Preferowane rynki wg skuteczności:
  1. Corners Over (najstabilniejszy, przewidywalny)
  2. Next Goal (gdy jedna drużyna dominuje DA)
  3. Away Win (gdy model widzi duży edge na niedowartościowanej drużynie)
  4. BTTS (gdy obie drużyny aktywne, H2H > 60%)

## Profil idealnego meczu do typowania
- Minuta: 55-70 (zostało czasu)
- Corners łącznie > 7 już w meczu
- Wynik: remis lub 1 gol różnicy
- DA dysproporcja > 15 (jedna drużyna dominuje)
- Edge% > 10% (VALUE lub STRONG)
- Kurs > 1.80 (warto ryzykować)
- ANOMALY SCORE wysoki: xG > 0.6 ale wynik 0:0 lub DA dysproporcja > 20 ale wynik nie odzwierciedla dominacji
- Kurs rośnie w trakcie meczu (bukmacher niepewny)

## Anomaly Score
Gdy xG home > 0.6 ale wynik 0:0 i minuta > 30:
- Pokazuj alert "ANOMALIA — dominacja bez gola"
- To sygnał że kurs na gola rośnie niesłusznie
- Idealny moment wejścia na Next Goal lub Over

Przykład: Pescara vs Spezia — 0:0 w przerwie, aktywna gra, wynik 1:1 w 86'. Klasyczna anomalia gdzie brak gola przy aktywnej grze = okazja live.

## Czego NIE typować
- Kursy < 1.80 (za mało zysku — filozofia to 2.1+)
- Minuta > 75 (za mało czasu na corners)
- Brak edge% (NO EDGE = skip)
- Pre-match (zbyt wiele niewiadomych)
- Mecze U19/akademie bez danych corners (mała liga = słabe dane FootyStats)

## Cashout
Nie dotyczy - zawsze dochodzimy do końca.
Małe stawki = nie potrzeba cashout.

## Styl kodu
- Komentarze po polsku lub angielsku
- Funkcje małe i czytelne
- Bez frameworków
