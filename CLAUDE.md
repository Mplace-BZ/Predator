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
- **Live data: api-football PRO ($19/m, 7500 calls/day, 300 r/min)** — direct fetch z CORS open
- Pre-match data: api-football /teams/statistics (sezonowy goals.average, goal timing)
- Live xG + stats: api-football /fixtures/statistics (top ligi)
- Pre-match + live odds: api-football /odds + /odds/live (13 bookmakers, Bet365 priority)
- Claude API: claude-sonnet-4-20250514 (Match Scanner — manual paste fallback)
- Cloudflare Worker: proxy dla Claude API (red-haze-5f37mplace-agent.contactmplace.workers.dev)
- Firebase: gotowy ale nie podpięty
- Repo: https://github.com/Mplace-BZ/Predator
- Local: /Users/chrismac/bazgroszyt/Predator/

## Aktualna wersja: v9.0 (WHITELIST MODE — backtest-validated picks only + per-team filtering)

## v9.0 — Whitelist Mode (multi-season validated picks)
**Trigger:** Multi-season backtest (8 lig × 3 sezony, 24 backtestów) ujawnił że v8.9 single-season whitelist była w 50% **sezonowy fluke**. Tylko 6 kombinacji liga × market jest stabilne 3 sezony pod rząd. Plus: Chris gra PL/Bundesliga/Ligue 1 ale tylko dla **wybranych drużyn** — globalnie te ligi tracą, ale konkretne drużyny mogą bić bukmachera (Bayern Home Win, Liverpool Over 2.5).

**Solution:** Whitelist Mode = filtr w `renderDashboardMatches` który pokazuje TYLKO picks z (zatwierdzonej liga × market) LUB (zatwierdzonej drużyna × market). Plus banlist (drużyny gdzie model konsekwentnie traci → auto-skip).

### Stable defaults (wbudowane w v9.0)

**6 ligi × market (multi-season validated):**
1. 🇧🇷 Brazil Serie A · Home Win — Tier 1 (+23.7% ROI 3/3 sezony)
2. 🇮🇹 Italy Serie A · Under 2.5 — Tier 1 (+9.6% 3/3 stable)
3. 🇪🇺 UCL · BTTS + Home Win — Tier 1 (+7-18%)
4. 🇺🇸 USA MLS · Away Win — Tier 2 (+7.9%, 2/3 positive)
5. 🇪🇸 La Liga · Over 2.5 — Tier 2 (+6.5% volatile)

**Per-team picks z PL/L1 backtest (3 sezony, ≥+15% ROI lub strong sample):**
- 🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL: Arsenal · Over 2.5 (T1, +67%), Aston Villa · Home Win (T1, +33%), Wolverhampton · Under 2.5 (T1, +39%), Nottingham Forest · Over 2.5 (T1, +18%), Manchester United · Home Win (T2, +75%), Fulham · Home Win (T2, +43%)
- 🇫🇷 L1: Nice · Under 2.5 (T1, +29%), Olympique Lyonnais · Under 2.5 (T1, +18%), Lens · Home Win (T2, +93%), PSG · BTTS (T2, +67%), Monaco · Under 2.5 (T2, +12%)
- 🇩🇪 BL: BRAK stable picks (model słaby w Bundesliga) — świadomie pomijamy

**Banlist (auto-skip):**
- Tottenham · Under 2.5 (-34% z 57 picks 3/3)
- Crystal Palace · Home Win/Over 2.5
- Strasbourg · Home Win/Away Win
- Hoffenheim · Home Win/Away Win
- Bayer Leverkusen/BVB · Under 2.5 (model przeszacowuje Under dla offensywnych top drużyn)
- PSG · Under 2.5 (PSG strzela)
- Manchester City · BTTS

### Architektura

**`isCardInWhitelist(card, w)`** ([index.html:6255](index.html#L6255)) — central filter logic:
1. Banlist check first → blokuje niezależnie od whitelist match
2. Liga × market match → return `{tier:N}`
3. Team × market match (home OR away) → return `{tier:N}`
4. Else → return false (block)

**Settings UI** ([index.html:1690](index.html#L1690)+, settings modal):
- Toggle "🎯 Whitelist Mode" + per-Tier stake inputs (default 50/30/20zł)
- 3 tabs: Ligi (checkboxy + add new), Drużyny (autocomplete z `_scanCardsCache`), Banlist
- "Reset do defaults" button
- Live preview: "✓ ON · X / Y meczów pasuje · N lig · M drużyn · K ban"

**Dashboard integration:**
- `renderDashboardMatches` ([index.html:6541](index.html#L6541)) — filter applied PRZED bucket assignment
- `renderDashboardCard` ([index.html:6328](index.html#L6328)) — tier badge ("🎯 T1/T2/T3"), tier-aware stake suggestion

**Backtest module enhancement** ([index.html:7068](index.html#L7068)):
- `runSingleLeagueBacktest` + `runBacktest` zbierają `perTeamMarket` aggregation
- Anchor team = home_name dla match-level markets (Over/Under/BTTS, Home Win), away_name dla Away Win
- `renderBacktestResults` pokazuje "Top 15 zyskowne / Bottom 10 banlist" panel po Calibration

**Tests** ([test/test_scan_pipeline.mjs:285](test/test_scan_pipeline.mjs#L285)):
- `test_whitelist_filter()` — 7 scenariuszy: liga match, team match, random block, banlist override, disabled passthrough, market mismatch, away team match
- All 21 tests pass (18 api-football integration + 3 whitelist logic)

**Filozofia:** Predator globalnie traci (-2 do -8% ROI). Whitelist Mode konwertuje to w wąską strategię gdzie wygrywa. Reszta szumu odfiltrowana. Po sezonie testuj realny ROI per Tier — jeśli T1 zachowuje +ROI a T2 mocno odjeżdża, wycofaj T2.

## v8.9 — Backtest module (FootyStats jako historical research source)
**Trigger:** Chris pytał "po co nam FootyStats jeśli api-football daje live?". Odpowiedź: FootyStats ma DWA killer features których api-football nie ma — sezonowy xG (bias-adjusted, vs goals.avg high-variance) ORAZ kompletny dataset historyczny (xG + odds + outcomes w jednym call /league-matches). Backtest module wykorzystuje ten dataset jako twardy walidator modelu.

**UI** (nowy accordion "📊 Walidacja modelu (backtest)" w details):
- Liga + sezon dropdown (FootyStats `/league-list?chosen_leagues_only=true`, top 3 sezony per liga)
- Filtry: min edge%, min kurs, stake/bet
- Run button → progress bar → results

**Co liczy:**
- Pobiera cały sezon (1 call `/league-matches?season_id=X` zwraca ~380-540 meczów z xG + odds + final scores)
- Pre-fetch unique team stats (cache 24h w sessionStorage — ~30-50 calls per liga)
- Per match: force PRE-MATCH state (clear goals, status='incomplete'), run `footyComputeMatchCard`, get bestPick
- Compare prediction vs actual outcome (homeGoals/awayGoals length)
- Akumuluj: total picks, hits, P&L, max drawdown, per-market breakdown, edge bucket performance, calibration

**Output (5 sekcji):**
1. **Summary cards (4):** Total picks · Hit rate · P&L (sezon) · ROI · Max DD
2. **Per-market table:** Over 2.5 / Under 2.5 / BTTS / Home Win / Away Win — picks, hit%, P&L, ROI per market
3. **Edge buckets:** STRONG (≥15%) · VALUE (5-15%) · SLIM (<5%) — czy model bije lepiej w high-edge picks
4. **Calibration:** model "predicted P 60-70%" vs actual hit rate per bucket. Diff <10% = dobry model
5. **Sample picks:** Top 5 wins + Top 5 losses (debug + intuition)

**JSON export** — po backtest klik "💾 Export do JSON" zapisuje `{stats, picks, params}` na dysk. Pozwala anulować FootyStats subskrypcję i mieć dane offline forever (static dataset).

**E2E test verified** (MLS 2025, 533 zakończonych meczów):
- 330 picks · hit rate 42.4% · **ROI -7.4%** · max DD -1447zł
- Per market: Away Win +621zł (39.5% hit, jedyny zyskowny) / Under 2.5 -703zł / BTTS -569zł / Home Win -294zł / Over 2.5 -274zł
- Wniosek: model NIE uniwersalny w MLS. Tylko Away Win signal działa. To jest WARTOŚĆ backtest — twardo wskazuje co działa.

**Quota:** 1 call `/league-matches` + ~30-50 team calls per backtest = ~2-3% FootyStats Hobby godzinowego limitu. Multi-liga test (np. 5 lig × 35 calls) = ~175 calls = 10% h. Bezpieczne.

**Filozofia:** "wydaje mi się że Predator dobrze typuje" → "Predator w MLS 2025 traci -7.4% ROI". Backtest zamienia wrażenie w liczbę. Bez tego model jest opinion-based, z tym jest evidence-based.

## v8.8 — api-football migration (FootyStats Hobby → api-football PRO)
**Trigger:** v8.6/v8.7/v8.7.3/v8.7.4 iteracje phantom edges. Root cause = FootyStats Hobby tier
nie ma live tracking (verified curl: `/match`, `/todays-matches`, `/league-matches` wszystkie
zwracają frozen pre-match score 0:0 dla aktywnych live meczów). Każdy patch UI nad zamrożonymi
danymi to było protezowanie. Predator z założenia jest live tool — live data z FootyStats po
prostu nie ma, więc trzeba zmienić źródło.

**Decision (po empirycznej weryfikacji api-football):**
- Live score, minute, status: api-football real-time per-fixture (np. Ind. Juniors 1:0 LDU min 65 2H')
- xG live in-match: `/fixtures/statistics` zwraca `expected_goals` (top ligi: PL, La Liga, Serie A, UEL/UCL/UECL)
- Pre-match xG sezonowy: nie ma (api-football zwraca tylko `goals.for.average` — real goals, nie expected)
  → Predator używa goals.avg jako Poisson lambda. Mikro-degradacja modelu (~5% accuracy) za makro-zysk live data.
- Odds: `/odds` (13 bookmakers, Bet365 priority) + `/odds/live` (37 bet types real-time)
- CORS open (`access-control-allow-origin: *`) → direct fetch, **bez worker proxy**
- $19/m vs FootyStats Hobby £29.99/m (~$38) → oszczędność ~$19/m
- Quota PRO 7500/day, realne zużycie ~500-1000/day = 7-14% capacity

**Migracja (in place — zachowane nazwy `footy*` funkcji dla minimal callsite churn):**
1. **Nowy moduł `af*`** w index.html ~line 4950:
   - `afFetch(endpoint, params)` — direct fetch z `x-apisports-key`, rate-limit aware (429 backoff)
   - `afFixtureToMatch(f)` — fixture object → flat schema kompatybilny z istniejącym kodem
     (id, home_name, homeID, homeGoals[], status='in_play'|'complete'|'incomplete', date_unix,
     plus _af_status/_af_elapsed/_af_extra/_af_halftimeH/_af_halftimeA/_af_leagueId/_af_season)
   - `afScanFixtures(date)` / `afScanLive()` / `afLoadFixture(id)` — fixture pulls
   - `afLoadTeamStats(teamId, leagueId, season)` — sezonowy aggregate (4h cache w sessionStorage)
   - `afTeamStatsToFlat(stats)` — convert do Predator's expected schema (xg_for_avg_*, seasonPPG_*, BTTS%)
   - `afLoadOdds(fixtureId)` — pre-match odds → odds_ft_1/x/2/over25/under25/btts_yes + multi-line panel
   - `afLoadOddsLive(fixtureId)` — live in-play odds (37 bet types)
   - `afLoadFixtureStats(fixtureId)` — live xG, possession, shots, corners, cards
   - `afLoadEvents(fixtureId)` — goals (z minute), red cards (dla Match State Rules + Red Card Model)
2. **Rewrites:**
   - `footyScanToday` → 1 call `/fixtures?date=&timezone=Europe/Warsaw` zamiast 3 calls FootyStats yesterday/today/tomorrow
   - `footyLoadTeam(teamId, match)` → `afLoadTeamStats` + `afTeamStatsToFlat`
   - `dashboardLightRefresh` → 1 call `/fixtures?live=all` (real-time delta)
   - `dashboardRefreshCard` → `/fixtures?id={id}` z preserved odds/metadata
   - `footyMapMatch` → odds + season stats + async live xG/events (non-blocking calc())
   - `pollWatchList` → afScanLive
   - `dashboardLiveBadge` → real `_af_elapsed` + `_af_extra` (np. "90+5'") zamiast estymata
3. **Drops:**
   - `isStaleMatch` zwraca `{stale:false}` always — api-football real-time = no stale
   - `apiLiveUnreliable` flag ZNIKA z `footyComputeMatchCard` + render
   - `?:?` score hack ZNIKA — real score zawsze
   - `LIVE ~Xmin` estimate ZNIKA — real minute z `_af_elapsed`
   - `isLiveMatch` upraszczone do `m.status==='in_play'` (api-football ground truth)
   - 3-day span scan logic ZNIKA — Warsaw timezone single call łapie wszystko
4. **Legacy zostaje (dead, ale safe):** `footyFetch`, `footyLoadLeagueMatchesCached`, `normalizeMatch`.
   Może drop w v8.9 po confidence buildup.

**Tested (16/16 w `test/test_scan_pipeline.mjs`):**
- T1: /status — Pro plan, 12/7500 quota
- T2: /fixtures?date=today&timezone=Warsaw — 221 fixtures, sample mapped correctly
- T3: /fixtures?live=all — 2 live (Ind. Juniors 2H 65', Fortaleza U20 HT) z REAL elapsed/status
- T4: phantom edges eliminated — Ind. Juniors 1:0 65' Under +28% (legitimate, nie phantom)
- T5: synthetic regression — 0:0 90+1 z REAL data daje legitimate Under +48.7% (matematycznie poprawne, nie bug)
- T6: /odds — 13 bookmakers, Bet365 ma 107 bet types
- T7: /fixtures/statistics — Braga (xG 2.37) vs Freiburg (xG 1.11) UEL FT

**Security note:** `APIFOOTBALL_KEY` w client-side JS (visible w source). Akceptowalne bo:
- No auto-renewal (subscription expira po miesiącu jeśli nie odnowisz)
- Quota cap 7500/day — abuse = max ten cap, brak financial damage
- Możesz włączyć IP whitelist w api-sports dashboard jeśli zauważysz abuse

## v8.7.4 — Phantom Under edge eliminated (regression od v8.7.3)
**Trigger:** Chris zobaczył 4 Europa League/Conference karty z `STRONG +49% Under 2.5` przy score `0:0` i minucie `~111min/~117min`. Realne wyniki u bukmachera: Braga–Freiburg 1:1 90+1, Nottingham–Villa 1:0 90+5, Szachtar–Palace 1:3 90+4 (Under 2.5 PRZEGRANE!), Vallecano–Strasbourg 1:0 87'.

**Root cause:** v8.7.3 świadomie zdjął blok markets dla `apiLiveUnreliable` cards (zamiast `?:?` zwracał real markets+edges z dyskretnym bannerem). Ale matematyka modelu liczyła Under na frozen 0:0:
- `minute = min(90, 117) = 90` (cap)
- `minutesRem = max(0, 90-90) = 0`
- `lamRem = totalLam × 0/90 = 0`
- `pUnder(2.5) = poissonCum(0, 2) = 1.0` (zero goli oczekiwane → Under 2.5 100% pewne)
- `edge = 1.0 - 1/1.95 = +49%` → STRONG

To NIE było "model się myli" — model dostawał frozen pre-match snapshot jako live state i robił matematycznie poprawną odpowiedź na nonsensowne pytanie. **Każdy stale-live mecz dawał ten sam phantom +49% Under** (lub Over jeśli kursy odwrotne). 3/4 trafiło przez czysty łut szczęścia, 4. zaliczyło `1:3` → "STRONG Under" przegrane.

**Fix (v8.7.4) — early return guard w `footyComputeMatchCard`:**
1. **EARLY GUARD przed any market computation:**
   ```js
   const apiLiveUnreliableEarly = isLive && match.status==='incomplete'
     && match.date_unix && match.date_unix < now-300;
   if(apiLiveUnreliableEarly) return placeholder card;
   ```
   Skupia się na ZASADZIE: jeśli nie ufamy danym, NIE liczymy markets w ogóle. Zero phantom edges, niezależnie od kombinacji kursów / score / minute.
2. **Score render:** `card.apiLiveUnreliable` → `?:?` zamiast frozen `0:0`. Honest disclosure (revert v8.7.3 polityki).
3. **Minute badge cap:** `elapsedMin >= 90 → "LIVE 90+"` zamiast `"LIVE ~111min"`. Tooltip wyjaśnia że to estymata od scheduled kickoff.
4. **Edge badge:** `apiLiveUnreliable` → `🔴 LIVE` (czerwona pulse, nie green `⚽ LIVE`).
5. **Pick text:** placeholder label `⚽ LIVE 90+ — sprawdź wynik u bukmachera, kliknij Analizuj`.
6. **Banner upgrade:** z miękkiego info-tone na warning-tone z bold "Analizuj".

**Filozofia v8.7.4 = wzmocnienie v8.7:** "Predator nie udaje że ma live data której nie ma." v8.7 dotyczyło tylko score, v8.7.4 rozszerzył to na CAŁY market layer. Lepiej zero rekomendacji niż phantom STRONG +49%.

**Tested:** 20/20 w `test/test_scan_pipeline.mjs`:
- T10 (real production): Rayo Vallecano @ 122min od kickoff → placeholder, brak markets ✓
- T11 (synthetic deterministic): Braga 0:0 @ 117min → `apiLiveUnreliable:true, isLiveOnly:true, markets.length===0, bestEdge===0, label includes "Analizuj"` ✓
- Plus regression: status='in_play' → markets normalne; fresh incomplete (kickoff <5min) → markets normalne ✓

**Verified:** `/match?match_id=8516826` (Braga vs Freiburg) zwraca **identyczne** stale data co `/todays-matches` — `homeGoals:[], status:incomplete`. **FootyStats Hobby tier NIE MA żadnego endpointa z live score**, niezależnie od endpoint shape. Honest mode = jedyna sensowna polityka.

## v8.7 — Honest live data disclosure
**Discovery:** v8.6 zaczęło wyciągać Europa League live matches, ale pokazywało 2:2 min 66 dla wszystkich 4 — a faktycznie były 1:1 47', 0:0 51', 1:1 50', 0:0 (przerwa). Direct API curl ujawnił:
- `/todays-matches` zwraca 2:2 (cached/stale)
- `/league-matches` zwraca 0:0 (pre-match cache)
- **Bukmacher ma prawdę: 1:1, 0:0, 1:1, 0:0**
- Wszystkie 4 mają `status='incomplete'` zamiast `'in_play'`
- `date_unix=18:00 UTC` (= 20:00 Warsaw), real kickoff był ~21:15 Warsaw (76min off)

**Wniosek:** **FootyStats Hobby tier nie aktualizuje live data**. Score, minute, status — wszystko zamrożone na pre-match. Każde pokazanie konkretnej wartości jest fałszywe.

**Fix (v8.7) — zamiast udawać że wiemy, mówimy uczciwie:**
1. **`isStaleMatch` extension**: live + status='incomplete' + date_unix < now-300s = stale (FootyStats Hobby nie ma live update). To wykrywa 100% live matches w Hobby tier.
2. **Card render dla isStaleLiveUnreliable** (`/API status=incomplete/.test(reason)`):
   - Score: `?:?` zamiast fałszywego "2:2"
   - Minute badge: `LIVE ~Xmin` zamiast pewnego `LIVE 66'` (z tooltipem że to estymata od scheduled kickoff)
   - Pick: `⚠ LIVE — sprawdź wynik u bukmachera. Klik Analizuj i wpisz aktualny score.`
   - Edge badge: `🔴 LIVE` zamiast `⚠ STALE`
   - Header warning: `⚠ [reason]` (bez "Klik 🔄" bo nie pomoże)
3. **Analizuj enabled** dla stale matches (user może wpisać dane ręcznie). Tylko Obstaw zostaje disabled.
4. **`dashboardLiveBadge`**: dla status='in_play' pokaż precyzyjną minutę. Dla status='incomplete' (inferred-live) pokaż `~Xmin` z tooltipem o niepewności.
5. **Score render w card**: `?:?` dla inferred-live, real score tylko dla status='in_play' albo `complete`.

**Tested:** 7/7 w `test/test_scan_pipeline.mjs` (Test 7 nowy — detect stale-live):
- T7: 4/4 Europa League matches flagged jako API stale-live ✓

**User flow:**
1. Klik Pełny skan → dashboard pokazuje 4 live matches
2. Każdy z badge `🔴 LIVE`, score `?:?`, minute `~Xmin`, warning `⚠ API status=incomplete dla live meczu`
3. User klika **Analizuj** → otwiera full match view, wpisuje aktualny score/minute z bukmachera
4. Pełny calc() z live xG, velocity, match state rules

To jest "honest disclosure" — Predator nie udaje że ma live data której nie ma. User wie kiedy ufać a kiedy ręcznie zaktualizować.

## v8.6 — Live betting completeness fix
**Problem:** Predator pokazywał 0 live meczów mimo że bukmacher widział 4 trwające Europa League (Braga, Nottingham, Szachtar, Vallecano). Deep audit odsłonił 4 niezależne bugi.

**Bug #1: `/todays-matches` bez `?date=` zwraca tylko upcoming next ~24h.** Zweryfikowane przez direct API curl: bare endpoint zwraca 38 matches z czego **0 live**, `?date=2026-04-30` zwraca 6 z czego **4 live**.

**Bug #2: Window scan kończył się o północy Warsaw** (`endOfTodayUnix`). Przy 21:00+ wycinało wszystkie nocne mecze.

**Bug #3: Pre-match Poisson na live meczu = phantom edges.** Mecz @ 2:2 w 38' liczył `pOver25 = 1-poissonCum(2.65, 2) = 0.49` z stale pre-match odd 2.30 → "edge +5.9%" — bzdura, Over 2.5 dawno hit.

**Bug #4: Notification permission spam na `file://`** — Chrome resetuje uprawnienia per session.

**Fix:**
1. **3-day date span** w 4 lokalizacjach (`footyScanToday`, `dashboardLightRefresh`, `dashboardRefreshCard`, `_watchPollCache`): wczoraj+dziś+jutro UTC, dedupe by `match.id`. Z 1 do 3 calls per scan.
2. **Window**: `[now-3h, now+12h]` (było: `[now-3h, endOfToday Warsaw]`).
3. **Live-aware Poisson** w `footyComputeMatchCard`:
   - `lamRem = totalLam * (90-minute)/90` dla live
   - `goalsNeeded = floor(line) - currentGoals + 1`; jeśli `<=0` → market SKIP (linia hit, edge phantom)
   - `pUnder` symetrycznie: skip gdy `currentGoals > maxGoals`
   - BTTS gdy oba strzeliły → SKIP; gdy 1 strzelił → P(drugi strzeli w lamRem dla brakującego team)
   - 1X2 dla live → SKIP całkowicie (PPG to pre-match metric, do live trzeba `Analizuj`)
4. **Live-only placeholder card**: gdy live + wszystkie markety hit, zwraca card z `isLiveOnly:true` i `bestMarket.label='⚽ LIVE H:A min M — kliknij Analizuj'`. Pojawia się w `📡 Wszystkie live` tab. Render: badge `⚽ LIVE`, brak `@ 0.00`.
5. **`requestNotifOnce()` helper**: skip na `file://`, localStorage flag `predator_notif_asked` (`Notification.permission==='default'` only, single-shot).
6. **Tab `📡 Wszystkie live`** między LIVE i Dziś — wszystkie live niezależnie od edge.
7. **Diagnostyka inline**: status bar `✓ Skan: API X → okno Y → cache Z · 🔴 N live · 💡 M z edge≥5%`. Empty path granularny: `K zakończone · L za stare · M za >12h`. Console dump LIGI z count per (debug user's chosen leagues).
8. **Smart default tab**: gdy LIVE pusty, preferuj liveAll przed upcoming.

**Tested:** 6/6 w `test/test_scan_pipeline.mjs` przeciw production workerowi:
- T1: bare endpoint zwraca 0 live (regression check)
- T2: `?date=` zwraca live (Europa League visible)
- T3: 3-day span dedup ≥ today-only
- T4: phantom edges eliminated (Over 2.5 SKIPPED dla score≥3)
- T5: live-only placeholder cards produced (4/4 Europa League)
- T6: pre-match nigdy nie misflagged jako live-only

**Koszt API:** 1 → 3 calls per scan. Auto-refresh: 120/h → 360/h = 20% z 1800/h limitu Hobby. Per-card 🔄: 1 → 3 calls (sporadyczne). Net w aktywnym użyciu: ~410/h = 23%.

**Run tests:** `node test/test_scan_pipeline.mjs` — wymaga sieci (uderza production FootyStats przez worker proxy).

## v8.2 — Rate limit fix (smart subset refresh)
**Problem:** Auto-skan co 30s × 50 lig = 6000 calls/h vs FootyStats Hobby limit 1800/h → 429 errors.

**Chris's solution:** Auto-refresh tylko dla live + obstawione + watched. Pre-match dane cache'owane lokalnie.

**Architektura:**
- **Initial scan** = button "↻ Pełny skan" → 50 calls jednorazowo
- **Auto-refresh (30s)** = `dashboardLightRefresh()` → **1 call** `/todays-matches`. Filter w cache: live + placed + watched. Pre-match nieruszane.
- **Per-card 🔄** = 1 call `/todays-matches` (fallback `/league-matches` jeśli mecz tam nie ma)
- **Net:** 170 calls/h vs 1800 limit = 9% użycia

**429 handler:** Exponential backoff (60→120→240→300s cap). UI status: `📡 API: N/1800 (X%)` w dashboard header (szary/żółty/czerwony per usage). Cooldown badge `⏳ Rate limit — Xs` gdy throttled.



## v8.1 — Full audit + integrity fix
**Trigger:** Chris zażądał audytu "boil-the-ocean", po widzeniu sprzeczności (apka pokazywała "Graj +52%" gdy mecz realnie 4:0 a API mówi 0:0).

**3-agent parallel audit znalazł 23 issue w 7 obszarach.** Wszystkie naprawione w jednej iteracji.

**Krytyczne fixy:**
1. **Stale flag** — guard `match.status==='in_play'` (no pre-match false positives), próg 0.70, propagacja przez `_currentMatchStale` + `clearMatchState()` + `clearAllOddsFields()` helpers przed każdym load.
2. **Render sync** — `dashboardAnalyze` + `footyLoadFromScan` zawsze: clear → map → calc(). Hero rec onclick zawsze przekazuje `dec.pick` do `placeBet(verdict, pick)`. Live context blokuje render numbers gdy stale.
3. **Edge thresholds** — `EDGE_VALUE=5, EDGE_STRONG=15, EDGE_NOTIFY=5` jako const (single source of truth).
4. **Vision validation** — kursy 1.01-50 (nie 1-200). Notif TTL 30min, dedup per matchId.
5. **Calibration sync** — `placeBet()` synchronizuje flag w `predator_placed_matches` automatycznie.
6. **Race conditions** — `matchId` zamiast array index dla wszystkich dashboard akcji. Double-click guard 500ms. Stale = hard block na `placeBet()`.
7. **Persistence** — `halfTimeScore`/`lastGoalMin` w `fieldIds` (persystowane).

**Tested:** 12/12 scenariuszy passed (6 stale detection + 7 edge threshold).



## Match Dashboard (v8.0)
**Problem:** Predator był "single-match analysis tool" — Chris manualnie paste'ował każdy mecz. Niezgodne z naturą live betting (anomalie pojawiają się i znikają w 5-10 min).

**Fix (v8.0):** Drop-and-go-play dashboard. Po otwarciu apki, NA GÓRZE (po risk bar) widzisz 3 zakładki:
- **🔴 LIVE** — wszystkie mecze w trakcie z edge'em
- **⏰ Wkrótce** — pre-match z value
- **✅ Moje bety** — co już obstawiłeś

Każda karta meczu compact: edge badge (STRONG/VALUE/SLIM, animacja pulse dla STRONG), LIVE badge (czerwona kropka pulse), pick suggestion + stake, akcje [Obstaw / Analizuj / +Watch / Ukryj].

**Auto-refresh 30s** (toggle w header) + **browser notifications** dla nowych picków edge ≥+10%. Tab title flash "⚡ Predator: ...".

**Bet flag persistent:** localStorage `predator_placed_matches` — checkbox "Obstawione" przy karcie, niezależny od calibration log. Reload zachowuje stan, karta przechodzi do "Moje bety" tab.

**One-click Analizuj:** klik karta → `footyMapMatch` wypełnia wszystkie pola → auto-otwiera accordion `Pełne predykcje` → scroll do hero rec z verdict + Konkretne typy.

**Accordion default state:** `Wklej dane manual paste` i `Pełne predykcje` zwinięte by default — Chris używa dashboard, manual paste nadal dostępny przez click.

**Reused infra:** `footyScanToday`, `footyMapMatch`, `isLiveMatch`, `addToWatchList`, `notifyWatch`, `placeBet`, calibration log — wszystkie bez zmian, dashboard to dodatkowa warstwa.



## Long Shot panel (v7.13)
**Problem:** Predator miał tylko jedno pole `oddOver` / `oddUnder` z dynamicznym progiem (`nextLine = currentGoals<2?2.5:...:6.5`). Chris wygrał Over 6.5 @ 4.0 w meczu 7-goli (Bhayangkara 3-4 Persib) ale apka nie pokazała mu tego edge bo:
1. Pole `oddOver` było uznane za "Over 2.5" → Chris wpisywał kurs Over 2.5 zamiast Over 6.5
2. Bukmacher pokazuje wszystkie linie (Over 0.5/1.5/2.5/3.5/4.5/5.5/6.5) jednocześnie — a Predator widział tylko jedną

**Fix (v7.13):** Multi-line edge panel "Wszystkie linie Over/Under (long-shot panel)":
- 5 nowych par pól: `oddOver15`/`oddUnder15`, `oddOver35`/`oddUnder35`, `oddOver45`/`oddUnder45`, `oddOver55`/`oddUnder55`, `oddOver65`/`oddUnder65`
- HTML: collapsible `<details>` panel pod głównym Edge% grid (zwinięty domyślnie)
- `renderOverUnderLines(totalLambda, currentGoals)` w calc() — dla każdego progu liczy edge%, koloruje per polarity (positive/warning/negative), pokazuje model probability suffix
- Vision parser: prompt update + example JSON wyciąga WSZYSTKIE progi z paste'a (BC.game pokazuje 7 wierszy → Vision wypełnia 14 pól)
- `rankPicks` Specific Picks: pętla po extraThresholds [1.5,3.5,4.5,5.5,6.5]. Wykrywa `isHighVelocity = velMult≥1.2 || totalLambda≥3.5` — wtedy reasonText ma tag `🚀 long-shot w wysokokalorycznym meczu`
- `fieldIds` dodaje 10 nowych pól do auto-save mechanism

**Math:** dla progu t.5 z currentGoals scored:
- Jeśli `currentGoals >= ceil(t)` → pOver=1 (już wpadło)
- Inaczej `pOver = 1 - poissonCum(totalLambdaRem, floor(t - currentGoals))`

**Use case Bhayangkara replay:**
- @ min 87, score 2:3, totalLambdaRem ≈ 0.10 → pOver65 = 0.47% → edge -24.5% (model słusznie odrzuca, mimo że wygrałeś — to wariancja)
- @ min 60, score 2:3, totalLambdaRem ≈ 0.85 (z velocity boost) → pOver65 = 21% → edge -4% (znacznie ciekawszy moment wejścia)
- Predator pokazałby long-shot tag i Chris widziałby ten edge wcześniej



## Match State Rules (v7.12 — heurystyki Chris'a)
4 reguły kontekstowe modyfikujące lambdy lookalike velocity/match-tags. Insertion w `calc()` ~linia 1748 (po tags, przed totalLambda). Toggleable w Settings → "Moje reguły" (localStorage `predator_rule_settings`, default ON).

| # | Trigger | ×Mult | Reason |
|---|---------|-------|--------|
| **R1** Późne 0:0 | min≥60 + 0:0 + liveXG_total<1.0 (lub brak live) | ×0.85 | Defensywny mecz, "0:0 zostaje 0:0" |
| **R2** Pierwszy gol w 2H | totalGoals=1 + lastGoalMinute≥50 + świeżo (≤10 min) | ×1.12 | Druga drużyna goni, kontrataki, mecz się otwiera |
| **R3** 1H deflacja | half1Goals≥3 + min≥45, **stack z velocity** | ×0.85 | "Drużyny już strzeliły, w 2H zwykle 1 gol max" |
| **R4** Późny spark | min≥75 + score change w 5 min + remis/1g różnicy | ×1.25 | "Otwarty mecz na hura", druga musi gonić |

R1 vs R2 mutual exclusive (różne `totalGoals`). R3 stack z velocity = łagodzi (×1.30→×0.85 = net ×1.105).

**State extraction:**
- Auto z FootyStats API (`footyMapMatch`) → `window._lastGoalMinute`, `window._half1HomeGoals`, `window._half1AwayGoals` z `match.homeGoals/awayGoals` arrays
- Manual fallback: pola UI `halfTimeScore` (1:1 format) + `lastGoalMin` pod score-bar
- Score change: delta `_lastPredictions.homeScore` vs current

**UI:** chipsy w hero rec (positive-tint dla boost, negative-tint dla damp) z tooltipem reason. Calibration log per bet ma `appliedRules:['r1','r3']` — w przyszłości tunować progi real performance data.

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
