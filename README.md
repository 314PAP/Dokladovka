<div align="center">

# Dokladovka

**Chytrý správce účtenek a osobních dokumentů**  
*Synchronizace a záloha přímo na váš Google Disk. Vyvinuto pro PIPAP.cz.*

[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-314pap.github.io%2FDokladovka-blue?logo=github)](https://314pap.github.io/Dokladovka)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](#licence)
[![React](https://img.shields.io/badge/React-19.0-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Gemini AI](https://img.shields.io/badge/AI-Gemini_3.5_Flash-4285f4?logo=google)](https://ai.google.dev/)

</div>

---

## O projektu

**Dokladovka** je moderní webová aplikace pro správu účtenek a osobních dokumentů. Díky umělé inteligenci (Google Gemini API) automaticky extrahuje údaje z naskenovaných dokladů, kategorizuje je a zabezpečuje jejich zálohu na Google Disk.

Aplikace je optimalizována pro české uživatele — rozumí českým účtenkám a dokumentům a pracuje s lokálními kategorizacemi.

## Hlavní funkce

- **Scan účtenek** — Nahrání účtenky (foto/soubor) → automatická extrakce jména obchodu, částky, data a kategorií pomocí AI.
- **Scan dokumentů** — Nahrání dokumentu → automatické rozpoznání vystavitele, názvu, data vystavení a kategorie.
- **Správa položek** — Přehledné zobrazení účtenek a dokumentů v karticích s možností úpravy a mazání.
- **Synchronizace na Google Disk** — Záloha všech dokladů do strukturovaných složek na Google Drive.
  - Kořenová složka: `Dokladovka`
  - Kategorizace: `zdravotni`, `pracovni_urad`, `socialni_zabezpeceni`, `smlouvy`, `ostatni`
- **PDF export** — Export seznamu výdajů do PDF souboru.
- **Sémantické vyhledávání** — Fulltextové hledání v názvech, obchodech a klíčových detailech dokumentů.
- **Offline režim** — Data se ukládají lokálně; synchronizace probíhá na pozadí.
- **Resize & komprese obrázků** — Automatická optimalizace velikosti souborů před odesláním.
- **Light/Dark režim** — Podpora světlého a tmavého motivu.

## Tech stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion (Framer Motion) |
| Backend | Express.js (Node.js / TypeScript / tsx) |
| AI / OCR | Google Gemini API (`@google/genai`) — model `gemini-3.5-flash` |
| Google Workspace | Google Drive API (REST v3) + Google OAuth 2.0 |
| PDF | jsPDF |
| Ikony | Lucide React |
| Ořezávání obrázků | react-easy-crop |
| Nasazení | GitHub Pages (statická SPA) |

## Architektura

```
┌─────────────────────────────────────────────┐
│                  Frontend (SPA)              │
│  React + Vite + Tailwind + Motion           │
│  - Zustand-like state management            │
│  - Offline-first (localStorage)             │
└──────────────────────┬──────────────────────┘
                       │ HTTP/JSON
┌──────────────────────▼──────────────────────┐
│              Backend (Express)               │
│  ---------------------------                 │
│  POST /api/extract-receipt                  │
│  POST /api/extract-document                 │
│  GET  /api/db/receipts                      │
│  POST /api/db/receipts                      │
│  GET  /api/db/documents                     │
│  POST /api/db/documents                     │
│  GET  /api/debug-errors                     │
└──────────────────────┬──────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   [Gemini API]  [JSON Storage]  [Google Drive API]
```

**Zpracování účtenek:** Frontend odešle obrázek → backend převede na base64, odešle k Gemini modelu → AI vrátí strukturovaný JSON (název, částka, datum, kategorie, položky). Backend provádí retry s exponenciálním backoffem pro přechodové chyby.

**Synchronizace:** Uživatel se přihlásí Google účtem → aplikace získá OAuth token → vytvoří strukturu složek na Disku a nahraje soubory.

## Struktura projektu

```
Dokladovka/
├── .env.example                 # Předvolený konfigurační soubor (bez klíčů)
├── .gitignore                  # Ignoruje node_modules, .env, dist, .history
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deploy na GitHub Pages
├── data/                       # Lokální úložiště (receipts.json, documents.json)
├── dist/                       # Sestavená statická aplikace
├── index.html                  # Vstupní HTML (meta tagy, SEO)
├── metadata.json               # Metadata pro AI Studio / konfiguraci
├── package.json                # Závislosti a skripty
├── server.ts                   # Express backend + Vite dev middleware
├── src/
│   ├── App.tsx                 # Hlavní komponenta — stav UI, workflow
│   ├── components/
│   │   ├── DocumentSection.tsx # Sekce náhledu a správy dokumentů
│   │   └── GoogleSettings.tsx   # Nastavení Google přihlášení
│   ├── index.css                # Základní styly + Tailwind import
│   ├── main.tsx                 # Mountpoint React aplikace
│   ├── utils/
│   │   ├── googleService.ts     # Integrace Google Drive (upload, struktura)
│   │   ├── imageCompressor.ts   # Komprese a resize obrázků
│   │   ├── pdfExport.ts         # Export výdajů do PDF
│   │   └── smartFallback.ts     # Fallback data při chybě AI
│   └── vite-env.d.ts
├── tsconfig.json               # Konfigurace TypeScriptu
└── vite.config.ts              # Konfigurace Vite buildu
```

## Nasazení

### Online verze (GitHub Pages)

🔗 **https://314pap.github.io/Dokladovka**

Push na `main` branch spustí automatický deploy pomocí GitHub Actions, který publikuje aplikaci do `gh-pages` branch.

### Lokální vývoj

**Požadavky:** Node.js 20+, npm 10+

**Kroky:**

1. Naklonujte repozitář:
   ```bash
   git clone https://github.com/314PAP/Dokladovka.git
   cd Dokladovka
   ```

2. Nainstalujte závislosti:
   ```bash
   npm install
   ```

3. Vytvořte `.env.local` a přidejte klíče:
   ```env
   GEMINI_API_KEY=váš_klic_gemini
   VITE_GOOGLE_CLIENT_ID=vas_google_oauth_client_id
   ```

4. Spusťte vývojový server:
   ```bash
   npm run dev
   ```

5. Otevřete http://localhost:3000

### Dostupné npm skripty

| Skript | Popis |
|--------|-------|
| `npm run dev` | Vývojový server (Express + Vite middleware) |
| `npm run build` | Sestavení frontendu (Vite) + backendu (esbuild) do `dist/` |
| `npm run start` | Spuštění produkčního serveru z `dist/server.cjs` |
| `npm run clean` | Vymazání adresáře `dist` a `server.js` |
| `npm run lint` | Kontrola TypeScript typů (`tsc --noEmit`) |

## Configurace

### Proměnné prostředí

| Proměnná | Popis | Povinná |
|----------|-------|---------|
| `GEMINI_API_KEY` | Klíč pro Google Gemini API (backend). | Ano (lokálně) |
| `VITE_GOOGLE_CLIENT_ID` | ID Google OAuth klienta (frontend). | Ano (pro přihlášení) |

> n.pozn.: V produkci na GitHub Pages se podle potřeby nahrazuje ve workflow prostřednictvím GitHub Variables (`VITE_GOOGLE_CLIENT_ID`).

### Google OAuth nastavení

1. Vytvořte **OAuth 2.0 Client ID** v Google Cloud Console (typ *Webová aplikace*).
2. Povolené JavaScript zdroje:
   - `http://localhost:5173` (lokální vývoj)
   - `https://314pap.github.io` (produkce)
3. Povolené přesměrovací URI:
   - `http://localhost:5173/`
   - `https://314pap.github.io/Dokladovka/`
4. Vložte Client ID do konfigurace aplikace.

## Licence

```
Apache-2.0
```

Viz soubor [LICENCE](LICENCE) pro details.

## Kontakt

Projekt vyvinut pro **[PIPAP.cz](https://pipap.cz)**.

Repozitář: https://github.com/314PAP/Dokladovka
