# Predator — Live Match Predictor

## Co to jest
Single-page aplikacja do przewidywania wyników meczów piłkarskich w czasie rzeczywistym.
Model Poissona z xG, używana głównie w ostatnich 15 minutach meczu dla najwyższych kursów.

## Stack
- Vanilla HTML/CSS/JS — zero dependencies, zero backendu
- GitHub Pages: https://mplace-bz.github.io/Predator/
- Jeden plik: index.html

## Źródła danych
- **FootyStats** — cała strona meczu (sezon, H2H, xG, corners, cards)
- **Sofascore** — live stats po polsku (Posiadanie, xG, Strzały celne, Wejścia do strefy ataku)

## Priorytety rozwoju
1. Parser FootyStats + Sofascore PL — musi wyciągać dane niezawodnie
2. Model — lepsze prawdopodobieństwa w końcówkach (75'+)
3. Nowe rynki — BTTS, kartki, rzuty rożne
4. Value bets — realne kursy bukmacherów

## Styl kodu
- Komentarze po polsku lub angielsku
- Funkcje małe i czytelne
- Bez frameworków