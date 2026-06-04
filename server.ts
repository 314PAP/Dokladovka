import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Explicitly use the user's active, verified working Gemini API key to override depleted environment defaults
const API_KEY = "AQ.Ab8RN6K2voDjgYBqIemIlMuzMnn1mgpzC_TLXF0Rt1zv0I8DNQ";

// Global array to store key details of the latest system extraction errors for diagnostics
const debugErrors: Array<{ timestamp: string; endpoint: string; errorMessage: string; errorStack?: string }> = [];

const ai = new GoogleGenAI({
  apiKey: API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper function to call generateContent with retry and exponential backoff
async function generateContentWithRetry(apiKeyToUse: string, params: any, maxRetries = 3) {
  const dynamicAi = new GoogleGenAI({
    apiKey: apiKeyToUse || API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  let delay = 1000; // start with 1 second delay
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!apiKeyToUse && !API_KEY) {
        throw new Error("GEMINI_API_KEY is not defined");
      }
      return await dynamicAi.models.generateContent(params);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isTransient = 
        errorMessage.includes("503") || 
        errorMessage.includes("UNAVAILABLE") || 
        errorMessage.includes("high demand") || 
        errorMessage.includes("429") || 
        errorMessage.includes("RESOURCE_EXHAUSTED") ||
        error?.status === 503 ||
        error?.status === 429 ||
        error?.code === 503 ||
        error?.code === 429;

      if (isTransient && attempt < maxRetries) {
        console.warn(`[Gemini API] Attempt ${attempt} failed with transient error: "${errorMessage}". Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      } else {
        console.warn(`[Gemini API] Permanent error or max retries reached: ${errorMessage}`);
        throw error;
      }
    }
  }
  throw new Error("Failed to generate content after retries");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API route for receipt extraction
  app.post("/api/extract-receipt", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      const clientKey = req.headers["x-gemini-key"];
      const keyToUse = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : API_KEY;

      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log(`Processing receipt extraction. MimeType: ${mimeType}. Custom Key: ${clientKey ? "Yes" : "No"}`);

      // Remove prefix if exists (e.g. data:image/png;base64,)
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const response = await generateContentWithRetry(keyToUse, {
        model: "gemini-3.5-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              },
              {
                text: "Analyzuj a přesně vytěž (OCR) tuto účtenku/složenku. Vyplň požadovaná pole na základě viditelných finančních údajů a faktů v českém jazyce."
              }
            ]
          }
        ],
        config: {
          systemInstruction: `Jsi špičkový asistent pro digitalizaci, OCR a přesnou analýzu českých účtenek, nákupních dokladů a finančních složenek.
Tvá práce musí být stoprocentně spolehlivá, faktická a zcela bez jakýchkoliv halucinací.

PŘÍSNÁ PRAVIDLA PRO ZABRÁNĚNÍ HALUCINACÍM:
1. ŽÁDNÉ HALUCINACE. Nikdy si nic nevymýšlej. Pokud v účtence/složence nevidíš konkrétní jméno obchodu, datum nebo položky, neodhaduj je, neodvozuj fiktivně ani si je nevymýšlej. Místo domýšlení použij "Neznámo" nebo prázdný řetězec "".
2. NÁZEV OBCHODU (shopName): Skutečný, přesný název obchodníka obvykle v záhlaví účtenky (např. "Albert", "Lidl", "Tesco", "Lékárna Dr.Max", "České dráhy"). Pokud tam není, použij "Neznámo".
3. CELKOVÁ ČÁSTKA (totalAmount): Finální částka k úhradě zaokrouhlená na dvě desetinná místa jako číslo (např. 1450.50). Hledej slova jako CELKEM, K ÚHRADĚ, SUMA, TOTAL.
4. DATUM (date): Datum nákupu/vystavení ve formátu YYYY-MM-DD. Pokud na dokladu není, použij dnešní datum, ale nevymýšlej si náhodná historická data.
5. KATEGORIE (category): Vyber výhradně z: Potraviny, Elektronika, Drogerie, Doprava, Restaurace, Zdraví, Ostatní. (Medicínské záležitosti, doplatky za léky a nákup v lékárně spolehlivě zařazuj pod "Zdraví").
6. POLOŽKY (items): Seznam nakoupených položek (název jako string, cena položky jako číslo). Součet cen položek musí odpovídat nebo se blízce blížit celkové částce.`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shopName: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              category: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    price: { type: Type.NUMBER }
                  },
                  required: ["name", "price"]
                }
              }
            },
            required: ["shopName", "totalAmount", "date", "category", "items"]
          }
        }
      });

      const extractedData = JSON.parse(response.text);
      console.log("Extracted data successfully:", extractedData.shopName);
      res.json(extractedData);
    } catch (error: any) {
      console.warn("Extraction warning details:", error?.message || error);
      debugErrors.push({
        timestamp: new Date().toISOString(),
        endpoint: "/api/extract-receipt",
        errorMessage: error?.message || String(error),
        errorStack: error?.stack
      });
      res.json({ isFallback: true, error: error?.message || String(error) });
    }
  });

  // API route for document extraction
  app.post("/api/extract-document", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      const clientKey = req.headers["x-gemini-key"];
      const keyToUse = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : API_KEY;

      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log(`Processing document extraction. MimeType: ${mimeType}. Custom Key: ${clientKey ? "Yes" : "No"}`);

      // Remove prefix if exists
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const response = await generateContentWithRetry(keyToUse, {
        model: "gemini-3.5-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              },
              {
                text: "Analyzuj tento dokument. Hlavním a nejdůležitějším úkolem je najít PŮVODNÍ DATUM VYSTAVENÍ/VYDÁNÍ/SEPSÁNÍ dokumentu (např. datum lékařské kontroly, datum podpisu smlouvy, datum vydání rozhodnutí zapsané na dokumentu v záhlaví či v textu) a uložit jej ve formátu YYYY-MM-DD. Pokud je vyfoceno více dokumentů, vytáhni datum prvního z nich."
              }
            ]
          }
        ],
        config: {
          systemInstruction: `Jsi špičkový OCR asistent pro rychlou digitalizaci a přesné vytěžování záhlaví českých úředních, lékařských, sociálních a pracovních dokumentů.
Tvá práce musí být stoprocentně spolehlivá, faktická, přesná a zcela bez jakýchkoliv halucinací.

PŘÍSNÁ PRAVIDLA PRO ZABRÁNĚNÍ HALUCINACÍM:
1. ŽÁDNÉ HALUCINACE A SMYŠLENÁ JMÉNA. Nikdy si nic nevymýšlej. Pokud v dokumentu nevidíš konkrétní jméno úřadu, jméno lékaře, firmu atd., NEODHADUJ JE. Místo domýšlení použij "Neznámo" nebo prázdný řetězec "".
2. VYSTAVITEL (issuer): Skutečná, doložitelná instituce, firma, lékař či úřad, který dokument v záhlaví vydal a podepsal (např. "Fakultní nemocnice v Motole", "Úřad práce ČR", "Česká správa sociálního zabezpečení", "Zaměstnavatel ACME s.r.o."). Pokud razítko nebo vystavitel není čitelný, použij "Neznámo".
3. NÁZEV (title): Výstižný název dokumentu v češtině (např. "Pracovní smlouva", "Lékařská zpráva", "Rozhodnutí o přiznání podpory", "Potvrzení o studiu", "Zápočtový list"). Pokud chybí jasný nadpis, pojmenuj jej věcně a stručně podle obsahu záhlaví.
4. DATUM VYSTAVENÍ (issueDate): NEJDŮLEŽITĚJŠÍ POLE. Vytáhni skutečné původní datum podpisu, konání vyšetření, vystavení či doručení zapsané na samotném dokumentu jako text či razítko ve formátu YYYY-MM-DD (např. "V Praze dne 15. ledna 2026" -> "2026-01-15"). Pokud na dokumentu vidíš pouze rok, doplň jej rozumně (např. 2026-01-01). Pokud je vyfoceno více dokumentů, vezmi datum toho prvního. Pokud na celém dokumentu žádné datum opravdu není, použij rok obsažený v názvu souboru, případně dnešní datum jako absolutně poslední nouzi.
5. KATEGORIE (category): Spáruj dokument s přesně jednou z následujících povolených kategorií: "Zdravotní", "Pracovní úřad", "Sociální zabezpečení", "Pracovní smlouvy", "Ostatní".`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              issuer: { type: Type.STRING },
              issueDate: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["title", "issuer", "issueDate", "category"]
          }
        }
      });

      const extractedData = JSON.parse(response.text);
      console.log("Extracted document successfully:", extractedData.title);
      res.json(extractedData);
    } catch (error: any) {
      console.warn("Document extraction warning details:", error?.message || error);
      debugErrors.push({
        timestamp: new Date().toISOString(),
        endpoint: "/api/extract-document",
        errorMessage: error?.message || String(error),
        errorStack: error?.stack
      });
      res.json({ 
        isFallback: true,
        error: "Failed to process document image",
        message: error?.message || String(error)
      });
    }
  });

  // Diagnostic GET endpoint to check the latest errors
  app.get("/api/debug-errors", (req, res) => {
    res.json({
      currentApiKeyMasked: API_KEY ? (API_KEY.substring(0, 7) + "..." + API_KEY.substring(API_KEY.length - 4)) : "None",
      errors: debugErrors
    });
  });

  // Persistent storage endpoints (workspace-level persistent JSON files)
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Failed to create data dir:", e);
    }
  }

  const RECEIPTS_FILE = path.join(DATA_DIR, "receipts.json");
  const DOCUMENTS_FILE = path.join(DATA_DIR, "documents.json");

  // GET Receipts
  app.get("/api/db/receipts", (req, res) => {
    try {
      if (fs.existsSync(RECEIPTS_FILE)) {
        const data = fs.readFileSync(RECEIPTS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json([]);
    } catch (error) {
      console.error("Error reading receipts database:", error);
      res.status(500).json({ error: "Failed to read receipts" });
    }
  });

  // POST Receipts
  app.post("/api/db/receipts", (req, res) => {
    try {
      const { receipts } = req.body;
      if (!Array.isArray(receipts)) {
        return res.status(400).json({ error: "Invalid receipts data" });
      }
      fs.writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), "utf-8");
      console.log(`Saved ${receipts.length} receipts to backend file.`);
      res.json({ success: true, count: receipts.length });
    } catch (error) {
      console.error("Error writing receipts database:", error);
      res.status(500).json({ error: "Failed to save receipts" });
    }
  });

  // GET Documents
  app.get("/api/db/documents", (req, res) => {
    try {
      if (fs.existsSync(DOCUMENTS_FILE)) {
        const data = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json([]);
    } catch (error) {
      console.error("Error reading documents database:", error);
      res.status(500).json({ error: "Failed to read documents" });
    }
  });

  // POST Documents
  app.post("/api/db/documents", (req, res) => {
    try {
      const { documents } = req.body;
      if (!Array.isArray(documents)) {
        return res.status(400).json({ error: "Invalid documents data" });
      }
      fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documents, null, 2), "utf-8");
      console.log(`Saved ${documents.length} documents to backend file.`);
      res.json({ success: true, count: documents.length });
    } catch (error) {
      console.error("Error writing documents database:", error);
      res.status(500).json({ error: "Failed to save documents" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
