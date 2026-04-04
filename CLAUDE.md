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

## Aktualna wersja: v6.2

## Red Card Model Logic
When red card checkbox is active (rcActive) with team selection (home/away) and minute:

1. **Lambda modifiers (xG) in calc():**
   - Team with red card: lambda *= 0.55 (survival mode)
   - Team with advantage: lambda *= 1.25 (more space)

2. **Corners modifiers:**
   - Total corners lambda *= 1.3 (advantage team pushes more)

3. **Cards/penalty modifiers:**
   - Penalty risk += 8% (advantage team enters box more)
   - Second red card risk += 15% (desperation fouls)

4. **Status card:** Purple with "RED CARD ACTIVE" label

5. **Value bets:** Should auto-suggest advantage team to win/score, over corners

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
