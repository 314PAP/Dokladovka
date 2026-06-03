import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper function to call generateContent with retry and exponential backoff
async function generateContentWithRetry(params: any, maxRetries = 3) {
  let delay = 1000; // start with 1 second delay
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is not defined");
      }
      return await ai.models.generateContent(params);
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
      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log(`Processing receipt extraction. MimeType: ${mimeType}`);

      // Remove prefix if exists (e.g. data:image/png;base64,)
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const response = await generateContentWithRetry({
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
      res.json({ isFallback: true, error: error?.message || String(error) });
    }
  });

  // API route for document extraction
  app.post("/api/extract-document", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log(`Processing document extraction. MimeType: ${mimeType}`);

      // Remove prefix if exists
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const response = await generateContentWithRetry({
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
                text: "Analyzuj a přesně vytěž (OCR) tento dokument. Vyplň požadovaná pole na základě viditelných zjištěných faktů v českém jazyce."
              }
            ]
          }
        ],
        config: {
          systemInstruction: `Jsi špičkový OCR asistent pro digitalizaci, analýzu a přesné vytěžování českých úředních, lékařských, sociálních a pracovních dokumentů.
Tvá práce musí být stoprocentně spolehlivá, faktická, přesná a zcela bez jakýchkoliv halucinací.

PŘÍSNÁ PRAVIDLA PRO ZABRÁNĚNÍ HALUCINACÍM:
1. ŽÁDNÉ HALUCINACE A SMYŠLENÁ JMÉNA. Nikdy si nic nevymýšlej. Pokud v dokumentu nevidíš konkrétní jméno úřadu, jméno lékaře, firmu, jméno zaměstnance nebo ustanovení, NEODHADUJ JE ani si nevymýšlej náhodné subjekty. Místo domýšlení použij "Neznámo" nebo prázdný řetězec "".
2. VYSTAVITEL (issuer): Skutečná, doložitelná instituce, firma, lékař či úřad, který dokument vydal a podepsal (např. "Fakultní nemocnice v Motole", "Úřad práce ČR", "Česká správa sociálního zabezpečení", "Zaměstnavatel ACME s.r.o.", "MŠMT ČR"). Pokud razítko nebo vystavitel není čitelný, použij "Neznámo", nikdy si nevymýšlej fiktivní instituci.
3. NÁZEV (title): Výstižný název dokumentu v češtině (např. "Pracovní smlouva", "Lékařská zpráva", "Rozhodnutí o přiznání podpory", "Potvrzení o studiu", "Zápočtový list"). Pokud chybí jasný nadpis, pojmenuj jej věcně a stručně podle obsahu.
4. DATUM VYSTAVENÍ (issueDate): Vytáhni datum podpisu či vydání dokumentu ve formátu YYYY-MM-DD. Pokud s jistotou žádné datum na dokumentu není vidět, použij dnešní datum rozumným způsobem jako zálohu, nebo prázdný řetězec.
5. KATEGORIE (category): Spáruj dokument s přesně jednou z následujících povolených kategorií: "Zdravotní", "Pracovní úřad", "Sociální zabezpečení", "Pracovní smlouvy", "Ostatní".
6. SOUHRN (summary): Napiš stručný, ale 100% věcný souhrn obsahu dokumentu v rozsahu 1-3 vět v českém jazyce. Uveď pouze to, co je v textu přímo napsáno (např. "Lékařská zpráva z ortopedického vyšetření pacienta, diagnostikována distorze kolena a doporučena rehabilitace", nebo "Pracovní smlouva uzavřená na dobu neurčitou s nástupem od 1. 2. 2026"). Nikdy neuváděj detaily, které na snímku nejsou zapsány!
7. KLÍČOVÉ DETAILY (keyDetails): Získej pole 1 až 4 nejdůležitějších faktických detailů zapsaných přímo v textu (diagnózy, pracovní schůzky, výše finanční podpory, termíny, limitní závazky apod.). Pokud detaily chybí, uveď pouze ty prokazatelně čitelné.`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              issuer: { type: Type.STRING },
              issueDate: { type: Type.STRING },
              category: { type: Type.STRING },
              summary: { type: Type.STRING },
              keyDetails: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["title", "issuer", "issueDate", "category", "summary", "keyDetails"]
          }
        }
      });

      const extractedData = JSON.parse(response.text);
      console.log("Extracted document successfully:", extractedData.title);
      res.json(extractedData);
    } catch (error: any) {
      console.warn("Document extraction warning details:", error?.message || error);
      res.json({ 
        isFallback: true,
        error: "Failed to process document image",
        message: error?.message || String(error)
      });
    }
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
