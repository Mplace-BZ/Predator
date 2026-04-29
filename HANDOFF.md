# Handoff — Predator v7.9

**Data:** 2026-04-29 22:30 Warsaw

## Stan projektu

Match Predictor (Predator) — single-page live football betting tool dla Chris'a (KrzMac2020).

- **Lokalizacja:** `/Users/chrismac/bazgroszyt/Predator/index.html`
- **Live:** https://mplace-bz.github.io/Predator/
- **Repo:** https://github.com/Mplace-BZ/Predator (main)
- **Wersja:** v7.9 (commit `1d0d4df`)

## Co zostało dziś zrobione (v7.5 → v7.9)

Pełna integracja FootyStats API (Hobby £29.99/m, 50 lig wybranych przez Chris'a):

1. **v7.5** — Test API panel w Settings modal (3 buttony: health / lista lig / mecze dziś)
2. **v7.6** — Auto-fetch single match: dropdown liga → dropdown mecz → 1-click fill 25+ pól
3. **v7.7** — Dropdown z 50 ligami alfabetycznie + LIVE/upcoming/finished optgroups
4. **v7.8** — Multi-match scan dashboard "🎯 Skanuj" — sortowanie po edge × confidence
5. **v7.9** — Day labels (Dziś/Jutro) + filter dropdown (Wszystkie/Tylko dziś/Tylko jutro), bo API `/todays-matches` zwracał next 24h zamiast ściśle dziś

## Architektura backend

**Cloudflare Worker:** `https://red-haze-5f37mplace-agent.contactmplace.workers.dev`
- Auth: `Authorization: Bearer Czucio123$`
- Routes: `/footy/*` (FootyStats), `/tts` (ElevenLabs), `/health`, default → Claude API
- Secrets: `FOOTY_API_KEY` (Hobby key 64 znaki, aktywny)
- Anthropic + ElevenLabs keys hardcoded w kodzie Workera

## Status: gotowe do pracy

✅ Worker proxy działa (200 OK, quota 1700+/1800)
✅ 50 lig wybranych w FootyStats Account (Brazil Serie A, EPL, top 5 europejskie, J1, MLS, mniejsze ligi)
✅ Auto-fetch testowany na Manchester United vs Aston Villa (mapping perfect)
✅ Scan dashboard testowany — dziś (środa) brak meczów, jutro (czwartek) 6 meczów UEL/UECL
✅ Wszystkie 25+ pól wypełniają się jednym klikiem

## Następny milestone: Backtest module (v8.0)

**Najważniejsze brakujące:** weryfikacja czy model faktycznie bije bukmachera.

Plan:
1. Nowa sekcja w Predator: "📊 Walidacja modelu (backtest)"
2. User wybiera przeszły sezon (np. Premier League 24/25 = `season_id 12325`)
3. Predator fetcha wszystkie zakończone mecze (380 dla PL)
4. Per match: oblicza picks używając obecnego modelu + parametrów Chris'a
5. Compare z faktycznymi outcomes (homeGoals, awayGoals, BTTS itd.)
6. Pokazuje: total picks, hit rate, ROI, max drawdown, accuracy per market type (Over/BTTS/1X2/Corners)
7. Cache aggresywnie (sessionStorage) bo 380 meczów × 3 calls = ~760 calls (40% quota godzinowej)

To powie Chris'owi czy ma podstawy do dalszego inwestowania w model — twardy dowód numeryczny.

## Filozofia Chris'a (krytyczne dla decyzji modelu)

- Stawki 20-50zł, kursy 2.1+
- Anomaly hunting: 0:0 z wysokim xG
- Konserwatywny Kelly 0.25, daily limit 20%
- Cool-off auto po 3 stratach
- Boil-the-ocean mindset — robić dobrze, kompletnie, nie odkładać "na później"
- Krótko, na temat — nie lej wody

## Pliki referencyjne

- **CLAUDE.md** w `/Users/chrismac/bazgroszyt/Predator/` — pełna dokumentacja modelu (v7.9 actual)
- **Memory:** `/Users/chrismac/.claude/projects/-Users-chrismac-bazgroszyt-Predator/memory/`
  - `project_predator_state.md` — szczegółowo wszystko built do v7.9
  - `user_chris_betting_profile.md` — stakes, philosophy, preferences
  - `reference_footystats_api.md` — endpoints, field mapping, quota strategy

## Co zrobi nowy czat na starcie

1. Auto-load CLAUDE.md (project memory)
2. Read MEMORY.md → 3 memories powyżej
3. User powie czy lecimy z Backtest (v8.0) czy coś innego
