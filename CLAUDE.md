# Predator — Live Match Predictor

## Co to jest
Single-page aplikacja do przewidywania wyników meczów piłkarskich w czasie rzeczywistym.
Model Poissona z xG, używana głównie w ostatnich 15 minutach meczu dla najwyższych kursów.

## Stack techniczny
- Vanilla HTML/CSS/JS — zero dependencies, zero backendu
- GitHub Pages: https://mplace-bz.github.io/Predator/
- Jeden plik: index.html
- Claude API: claude-sonnet-4-20250514 (Match Scanner)
- Cloudflare Worker: proxy dla Claude API (red-haze-5f37mplace-agent.contactmplace.workers.dev)
- Firebase: gotowy ale nie podpięty
- Repo: https://github.com/Mplace-BZ/Predator
- Local: /Users/chrismac/bazgroszyt/Predator/

## Aktualna wersja: v6.5

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

## Anomaly Score 2.0 (v6.5)
Każdy trigger ma `strength` (0–10), Predator Mode pokazuje najmocniejszy:
- **xG live > thresh + 0:0 + min >25:** strength = 5 + (xG − thresh) × 10
- **xG sezon > thresh + 0:0 + min >25:** strength = 3 + (xG − thresh) × 8
- **DA diff > thresh + dominator nie prowadzi:** strength = 4 + (diff − thresh) / 5
- **SOT > thresh + brak gola:** strength = 2 + (SOT − thresh) × 0.5

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
