# Notatnik Głosowy — MVP

Aplikacja do nagrywania i automatycznej klasyfikacji notatek głosowych.

## Uruchomienie

### Opcja 1 — Live Server w VSCode (zalecane)
1. Zainstaluj rozszerzenie **Live Server** w VSCode
2. Otwórz folder `voicenotes` w VSCode
3. Kliknij prawym na `index.html` → **Open with Live Server**
4. Aplikacja otworzy się na `http://127.0.0.1:5500`

### Opcja 2 — Python (jeśli masz zainstalowany)
```bash
cd voicenotes
python -m http.server 8080
# Otwórz: http://localhost:8080
```

### Opcja 3 — Node.js
```bash
cd voicenotes
npx serve .
# Otwórz podany adres
```

> ⚠️ NIE otwieraj index.html bezpośrednio przez File Explorer (file://) — mikrofon nie będzie działał. Musisz używać lokalnego serwera (http://localhost).

---

## Konfiguracja klucza API

Bez klucza API aplikacja działa w **trybie demo** — nagrywa i symuluje wyniki przykładowymi notatkami.

Aby włączyć prawdziwą transkrypcję AI:

1. Wejdź na https://console.anthropic.com/
2. Utwórz klucz API
3. Otwórz plik `js/app.js`
4. Zamień w linii 7:
   ```js
   const API_KEY = 'WSTAW_TUTAJ_KLUCZ_API';
   ```
   na:
   ```js
   const API_KEY = 'sk-ant-...twój-klucz...';
   ```

---

## Jak używać

1. **Nagraj** — kliknij przycisk mikrofonu, mów, kliknij ponownie aby zakończyć
2. **Kategoria** — możesz wybrać kategorię ręcznie przed nagraniem, lub pozwolić AI zdecydować
3. **Weryfikacja** — w zakładce "Notatki" sprawdź czy AI poprawnie sklasyfikowała
4. **Edycja** — możesz poprawić tekst transkrypcji i zmienić kategorię
5. **Szukaj** — w zakładce "Szukaj" przeszukuj wszystkie notatki

---

## Struktura plików

```
voicenotes/
├── index.html        # Główny plik HTML
├── css/
│   └── style.css     # Style aplikacji
├── js/
│   └── app.js        # Logika aplikacji
└── README.md         # Ten plik
```

---

## Dane

Notatki i kategorie są zapisywane w **localStorage** przeglądarki — zostają po zamknięciu i ponownym otwarciu aplikacji.
