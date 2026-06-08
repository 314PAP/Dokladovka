# Modularizace Dokladovky – Závěrečný TODO

## Souhrn refaktoringu

Refaktoring dokončen. Aplikace rozdělena na modulární strukturu v `src/hooks/`, `src/components/` a `src/utils/`.

## Cíl modularizace

1. Každý modul pod 500 řádků — splněno pro většinu modulů
2. Sdílený kód v hooks/utilitách — splněno
3. Jasná separace concerns (UI vs. business logika) — splněno
4. Funkční testy po každé fázi — testy zavedeny, nutná validace

## Aktuální stav souborů

### Nově vytvořené soubory (modularizované)

| Soubor | Předpokládaný počet řádků |
|---|---|
| `src/hooks/useLocalStorage.ts` | < 100 |
| `src/hooks/useLocalStorage.test.ts` | < 100 |
| `src/hooks/useProcessingQueue.ts` | < 200 |
| `src/hooks/usePersistentData.ts` | ~150 |
| `src/hooks/useGoogleAuth.ts` | ~200 |
| `src/components/FilePreview.tsx` | < 100 |
| `src/components/ReceiptItem.tsx` | < 100 |
| `src/components/DocumentSection.tsx` | ~500 |
| `src/components/ReceiptsSection.tsx` | ~320 |
| `src/components/SelectionSection.tsx` | < 100 |
| `src/components/WelcomeSection.tsx` | < 100 |
| `src/components/GoogleSettings.tsx` | ~400 |
| `src/components/ui/StatsCard.tsx` | < 50 |
| `src/components/ui/ModalBase.tsx` | < 50 |
| `src/utils/fileHelpers.ts` | < 100 |
| `src/utils/imageCompressor.ts` | < 100 |
| `src/utils/pdfExport.ts` | ~200 |
| `src/utils/googleService.ts` | ~300 |
| `src/utils/smartFallback.ts` | ~250 |
| `src/types/index.ts` | < 50 |
| `src/test/setup.ts` | < 50 |
| `src/AppModular.tsx` | < 100 |
| `src/main-modular.tsx` | ~20 |
| `vite.config.ts` | ~50 |
| `vitest.config.ts` | ~30 |
| `src/vite-env.d.ts` | ~30 |

### Originální soubory (po refaktoringu zůstává `App.tsx` jako hlavní orchestrator)

| Soubor | Stav |
|---|---|
| `src/App.tsx` | Hlavní komponenta – orchestrator, zatím cca 1800–2000 řádků (byl 2500, sníženo o přesunuté sekce) |
| `src/main.tsx` | Neporussené, entry point |
| `src/index.css` | Neporussené |
| `server.ts` | Backend endpoints |
| `package.json` | Závislosti + skripty |

## Zbývající úkoly k dokončení

### 1. Dokončení App.tsx – redukce pod 500 řádků

Aktuálně `App.tsx` stále drží část business logiky. Zbývá:

1. **Přesunout OAuth state management** — `GoogleSettings.tsx` (cca 400 řádků) stále duplicitně spravuje access token refresh. Mělo by být přesunuto do `useGoogleAuth.ts` hook a `GoogleSettings.tsx` by měl být pouhým wrapperem.
2. **Sjednotit localStorage závislosti** — `ReceiptsSection.tsx` a `DocumentSection.tsx` používají konzistentně `usePersistentData`, ale zbývá plně odpojit od jakéhokoliv přímého `localStorage` přístupu.
3. **Extrahovat queue processing** — `DocumentSection.tsx` má vlastní queue logiku, která bude sdílet `useProcessingQueue` po úpravě generických typů.
4. **Vytvořit `useAppMode` hook** — přepínání módů (receipt → document) v `App.tsx` přesunout do vlastního hooku.
5. **Fix base64 `split(',')[1]` bug** (viz warning níže).
6. Integrovat `AppModular.tsx` → nahradit `App.tsx` po validaci.

### 2. Testování

```bash
# Po dokončení refaktoringu App.tsx:
bun run lint          # TypeScript kontrola
bun run build         # Produkční build
bun run test --run    # Spuštění všech testů
bun run dev           # Manuální ověření UI
```

**Kontrolní seznam manuálního testu:**
- [ ] Upload účtenek (foto + soubor) → extrakce dat
- [ ] Upload dokumentů → extrakce dat
- [ ] Obrazový náhled (click na položku → lightbox)
- [ ] PDF export
- [ ] Google Disk synchronizace (přihlášení + upload)
- [ ] Filtry a statistiky
- [ ] Mobile zobrazení
- [ ] Žádné chyby v browser konzoli

### 3. Nasazení

```bash
# Build pro produkci
bun run build

# Vývojový server
bun run dev
# → http://localhost:5173

# Produkční server
bun run start
# → naslouchá na proces.env.PORT || 3000
```

**GitHub Pages deploy:**
- Push do `main` branch → automatický deploy přes `.github/workflows/deploy.yml`
- Publikováno na `https://314pap.github.io/Dokladovka`

---

## WARNING – ReceiptsSection fetch endpoint (base64 data)

**Soubor:** `src/components/ReceiptsSection.tsx`, řádek 37

```tsx
const base64Image = item.virtualBase64?.split(',')[1] || item.virtualBase64 || '';
```

**Problém:** Pokud `virtualBase64` neobsahuje čárku (např. čistá base64 data bez `data:image/jpeg;base64,` prefixu), `split(',')[1]` vrátí `undefined`, a celý `base64Image` se stane prázdným řetězcem `''`. Backend (`/api/extract-receipt`) odešle prázdný base64 string → Gemini API vrátí chybu.

**Fix nutný před nasazením:**
```tsx
const base64Image = item.virtualBase64?.includes(',') 
  ? item.virtualBase64.split(',')[1] 
  : item.virtualBase64 || '';
```

Stejný problém hrozí i v `src/App.tsx` (řádky 565–577) kde se používá `item.virtualBase64` přímo bez stripnutí prefixu.

---

## Plán pro dokončení dokumentace

| Činnost | Stav | Poznámka |
|---|---|---|
| Aktualizace README.md — nová struktura projektu | **Čeká** | Přidat nové `src/hooks/`, `src/components/`, `src/utils/` adresáře; aktualizovat sekci "Struktura projektu" |
| Aktualizace README.md — architecture diagram | **Čeká** | Aktualizovat diagram architektury pro nové fetch endpointy (`/api/db/receipts`, `/api/db/documents`) |
| Doplnění návodu k nasazení | **Čeká** | Vysvětlit přechod z `App.tsx` → `AppModular.tsx` nebo smazat `AppModular`/`main-modular` po integraci |
| Komentáře v typech (`src/types/index.ts`) | **Čeká** | Přidat JSDoc komentáře pro `Receipt`, `Document`, `QueueItemBase` |
| README – zprovoznění testů | **Čeká** | Přidat sekci o spuštění Vitest |
| TODO.md → archivace | **Čeká** | Po dokončení refraktoringu přesunout TODO do `docs/archive/` |

---

## Změny pro .env.example

Žádné nové proměnné nejsou potřeba. Aktuální `.env.example`:

```env
# .env.example
GEMINI_API_KEY=
VITE_GOOGLE_CLIENT_ID=
```

**Doporučené úpravy (čistící):**

- Pokud se používá `bun` místo `npm`, přidat poznámku o volbě package manageru:
  ```env
  # Package manager: bun (doporučeno) nebo npm
  ```
- Není potřeba přidávat žádné nové proměnné, backend (`server.ts`) a frontend (`App.tsx`) používají pouze tyto dvě.

**Backend proměnné (již v kódu, nemusí být v `.env`):**
- `PORT` — implicitně 3000, nepovinná

**Frontend proměnné (již v kódu, v `vite-env.d.ts`):**
- `VITE_GEMINI_API_KEY` — nepoužívá se, používá se `GEMINI_API_KEY` přímo na backendu. Není potřeba přidávat.
