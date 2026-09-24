# Szerszy briefing dzienny z GPT-6 Luna

## Cel i zakres

- Dla nowego przebiegu uwzględnić do 20 opublikowanych, kwalifikujących się historii zamiast obecnych 10. Jeśli materiałów z wystarczającym pokryciem jest mniej, opisać tylko je i wyjaśnić pominięcia.
- Zachować krótki lead, a pełny briefing zwiększyć z 280–500 do orientacyjnie 1100–1600 słów: 8–10 historii rozwiniętych i pozostałe opisane zwięźlej. Każda uwzględniona historia ma mieć własną referencję do źródła.
- Używać GPT-6 Luna wyłącznie w etapie `ai_brief`. Krótkie opisy kart newsów i pozostałe wywołania NVIDIA pozostają osobnymi zadaniami.
- Zachować publikację newsów i użytecznego briefingu awaryjnego przed wywołaniem AI, a także zamrożone wejście, trwałe retry, lease i atomowe zatwierdzanie istniejącego pipeline v2.

## Punkt wyjścia

- `reader-publication.ts` publikuje domyślnie do 20 newsów, lecz przekazuje do `buildBriefInput` pole `row.summary`, zwykle przycięte do 500 znaków.
- `digest-brief-job.ts` dopuszcza tylko 10 historii i zamraża input do 48 tys. znaków.
- `ai-summary.ts` wysyła modelowi maksymalnie 800 znaków streszczenia z każdej historii, wymaga 2–6 sekcji i ma limit 2400 tokenów wyjścia. Wymogi długości są ostrzeżeniami, więc krótsza odpowiedź może zostać przyjęta.
- `articles.enriched_text` jest dostępne przed publikacją, ale nie wchodzi do zamrożonego inputu briefingu. Dla pipeline v2 finalizacja odracza czyszczenie, jednak retry AI powinien nadal korzystać wyłącznie z zamrożonego inputu.
- Nie ma pomiaru tokenów ani pełnego podziału czasu AI; nie zakładamy poprawy szybkości bez porównania na tych samych danych.

## 1. Zamrożony materiał źródłowy v2

1. Po wyborze `story_snapshots` w `reader-publication.ts` pobrać wskazane `canonicalArticleId` i, gdy potrzebne, identyfikatory wariantów z `articleIds` jedną ograniczoną paczką. Czytać wyłącznie potrzebne kolumny, w tym `enriched_text`, `raw_summary`, `content_mode`, źródło i URL.
2. Zbudować deterministyczny pakiet na historię: tytuł, data, krótki opis, status pokrycia, fragment czytelnej pełnej treści i ewentualnie fragment drugiego niezależnego źródła. Preferować akapity zawierające główny fakt, liczby, daty i nazwy; zachować kolejność zdań i oznaczenie pochodzenia. Gdy pełnej treści brak, użyć dostępnych opisów i jawnie oznaczyć ograniczenie.
3. Przyciąć pakiety według budżetu per historia i budżetu całego żądania; nie ucinać arbitralnie JSON ani referencji. Wstępny budżet do pomiaru: około 1000–1500 znaków tekstu dowodowego na historię oraz 20 historii. Wyliczać rzeczywistą liczbę tokenów przed wysyłką i dostosować limity po próbie.
4. Wprowadzić `BriefInputV2` z wersją, listą historii, pakietami dowodowymi, decyzjami wyboru, identyfikatorem dostawcy i modelu oraz hashem. Nie zmieniać istniejących rekordów V1; retry rozpoznaje wersję zamrożonego wejścia. Zachować dotychczasowy kontrakt bazy JSONB, jeśli mieści się w istniejących kolumnach.
5. Zostawić `summaryMaxChars` dla kart newsów bez zmian. Bogatszy materiał jest osobnym wejściem briefingu, dzięki czemu nie zmienia listy newsów ani rozmiaru jej odpowiedzi API.

## 2. Większe pokrycie i format wyniku

1. Zwiększyć limit wejścia z 10 do maksymalnie 20 różnych klastrów historii, zachowując ranking, różnorodność kategorii i próg jakości źródeł.
2. Wprowadzić dwa rodzaje sekcji w istniejącym JSON `sections`: `full` dla 8–10 najważniejszych historii i `short` dla pozostałych. Każda sekcja odnosi się do jednej historii albo do kilku źródeł opisujących to samo zdarzenie. Nie łączyć niezależnych wiadomości na podstawie samej kategorii.
3. Lead pozostawić w zakresie około 70–100 słów. Sekcje `full` celują w 80–120 słów, a `short` w 30–60. Globalny cel 1100–1600 słów ma być zależny od liczby historii i ilości wiarygodnego materiału, bez sztucznego rozciągania.
4. Zmienić parser, walidację, materializację i UI dla 20 sekcji oraz nowego pola `kind`. Starsze zapisane briefingi bez tego pola mają nadal się wyświetlać. Usunąć pięciominutowy sufit licznika czasu czytania.
5. Walidator sprawdza, że każda kwalifikująca się historia pojawia się dokładnie raz w `sections`, indeksy istnieją, lead ma przypisane źródła, a odpowiedź nie jest ucięta. Brak pokrycia albo błędna referencja blokuje publikację wersji AI; odchylenie liczby słów przy ubogim materiale pozostaje opisanym ostrzeżeniem.

## 3. Dostawca GPT-6 Luna

1. Wydzielić adapter dostawcy dla pełnego briefingu z obecnego `ai-summary.ts`. Nowe przebiegi wybierają `openai` i dokładny model `gpt-6-luna`; wybór zostaje zapisany z zamrożonym jobem. Istniejące joby NVIDIA zachowują dotychczasową ścieżkę.
2. Wykorzystać Responses API i Structured Outputs z jednym wersjonowanym schematem JSON. Zachować walidację znaczenia i referencji w aplikacji: poprawny schemat nie dowodzi prawdziwości tekstu.
3. Zacząć od `reasoning.effort: low`, porównać z `none` i `medium` na identycznych inputach. Dla `low` nie wysyłać odziedziczonych `temperature` ani `top_p`. Ustalić `max_output_tokens` po pomiarze pełnego JSON i tokenów rozumowania; wstępnie testować zakres 5000–7000, bez zakładania, że zostanie w całości wykorzystany.
4. Obsłużyć jawnie: brak klucza, 401/403, 429, 5xx, timeout, odmowę, niepełną odpowiedź i niepoprawne referencje. Zachować limit prób i fallback; nie ponawiać błędu konfiguracji. Sekret `OPENAI_API_KEY` tylko po stronie serwera, bez logowania payloadu artykułów.
5. Rejestrować dla próby: model, wersję promptu, liczbę tokenów wejścia/wyjścia/rozumowania, koszt szacunkowy, czas dostawcy, kod błędu i powód retry. Zapisywać metryki w istniejącym stanie etapu/joba, o ile nie okaże się potrzebna osobna migracja.

## 4. Szybkość i jakość

1. Przed zmianą zebrać próbkę co najmniej 10 zakończonych digestów lub powtarzalnych zamrożonych wejść. Zmierzyć czas od publikacji newsów do pełnego briefingu, czas requestu AI, odsetek poprawnych odpowiedzi za pierwszym razem, liczbę pokrytych historii i błędy źródłowe.
2. Odtworzyć tę samą próbkę offline dla obecnej wersji i wariantu Luna. Ocenić anonimowo: zgodność faktów ze źródłami, konkretność, polszczyznę, powtórzenia, pokrycie i czas. Nie wysyłać kosztownych prób w CI.
3. Najpierw testować jeden request na briefing. Jeśli rozszerzony wynik przekracza budżet 60 sekund lub psuje p95, skrócić prompt i pakiety dowodowe albo podzielić pełne sekcje na 2–3 niezależne, równoległe i osobno checkpointowane części. Nie zwiększać samego timeoutu ponad budżet funkcji i lease.
4. Utrzymać natychmiastowy briefing awaryjny podczas generowania. UI pokazuje status pracy i aktualizuje wynik po zatwierdzeniu AI; nie czeka na pełną odpowiedź w żądaniu użytkownika.

## 5. Wdrożenie i kryteria odbioru

1. Tworzyć nowe joby V2 z Luna po dodaniu `OPENAI_API_KEY`; `DIGEST_BRIEF_OPENAI_ENABLED=false` wycofuje tylko nowe joby do NVIDIA. Nie przełączać aktywnych ani historycznych jobów zmianą globalnej konfiguracji. Po wdrożeniu kodu i klucza sprawdzić pierwszy przebieg przed szerszą oceną.
2. Dodać testy selekcji 20 historii, pakietów pełnej treści, braku pełnej treści, deterministycznego hasha, zgodności V1/V2, walidacji 20 sekcji, odmowy/ucięcia odpowiedzi, retry i odczytu UI. Przeprowadzić test integracyjny z testową bazą oraz `pnpm test:reader`, `pnpm typecheck:reader`, `pnpm build:reader` i `pnpm knip`.
3. Przyjąć zmianę, gdy briefing opisuje wszystkie kwalifikujące się historie z wybranych 20, nie powiela ich, każda sekcja ma poprawne referencje, a ocena faktów i czytelności jest co najmniej tak dobra jak dotychczas. Porównać medianę i p95 czasu do pełnego briefingu z bazą; jeśli jest wolniej, zastosować krok 4.3 przed pełnym włączeniem.
4. Po canary sprawdzić koszty i błędy na kilku rzeczywistych przebiegach. Wycofanie polega na wyłączeniu tworzenia nowych jobów Luna; istniejące joby kończą pracę według zapisanej wersji i dostawcy.

## Koszt orientacyjny

Oficjalna cena GPT-6 Luna to $0.10 za 1 mln tokenów wejścia i $0.50 za 1 mln tokenów wyjścia. Przy 8 tys. tokenów wejścia i 3 tys. wyjścia koszt jednej udanej próby to około $0.0023, czyli $0.069 za 30 briefingów. Przy szerszym wariancie 20 tys. tokenów wejścia i 5 tys. wyjścia byłoby to około $0.0045 za briefing i $0.135 za 30. Są to szacunki dla jednej udanej próby; rzeczywisty koszt zależy od liczby tokenów, także tokenów rozumowania, oraz ponowień.

Źródła: [model i cena GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [wskazówki dotyczące GPT-6](https://developers.openai.com/api/docs/guides/latest-model), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
