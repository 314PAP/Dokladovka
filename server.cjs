var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"));
import_dotenv.default.config();
var API_KEY = process.env.GEMINI_API_KEY || "";
var debugErrors = [];
async function generateContentWithRetry(apiKeyToUse, params, maxRetries = 3) {
  const dynamicAi = new import_genai.GoogleGenAI({
    apiKey: apiKeyToUse || API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  let delay = 1e3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!apiKeyToUse && !API_KEY) {
        throw new Error("GEMINI_API_KEY is not defined");
      }
      return await dynamicAi.models.generateContent(params);
    } catch (error) {
      const errorMessage = error?.message || String(error);
      const isTransient = errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE") || errorMessage.includes("high demand") || errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || error?.status === 503 || error?.status === 429 || error?.code === 503 || error?.code === 429;
      if (isTransient && attempt < maxRetries) {
        console.warn(`[Gemini API] Attempt ${attempt} failed with transient error: "${errorMessage}". Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        console.warn(`[Gemini API] Permanent error or max retries reached: ${errorMessage}`);
        throw error;
      }
    }
  }
  throw new Error("Failed to generate content after retries");
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "10mb" }));
  app.post("/api/extract-receipt", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      const clientKey = req.headers["x-gemini-key"];
      const keyToUse = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : API_KEY;
      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }
      console.log(`Processing receipt extraction. MimeType: ${mimeType}. Custom Key: ${clientKey ? "Yes" : "No"}`);
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
                text: "Analyzuj a p\u0159esn\u011B vyt\u011B\u017E (OCR) tuto \xFA\u010Dtenku/slo\u017Eenku. Vypl\u0148 po\u017Eadovan\xE1 pole na z\xE1klad\u011B viditeln\xFDch finan\u010Dn\xEDch \xFAdaj\u016F a fakt\u016F v \u010Desk\xE9m jazyce."
              }
            ]
          }
        ],
        config: {
          systemInstruction: `Jsi \u0161pi\u010Dkov\xFD asistent pro digitalizaci, OCR a p\u0159esnou anal\xFDzu \u010Desk\xFDch \xFA\u010Dtenek, n\xE1kupn\xEDch doklad\u016F a finan\u010Dn\xEDch slo\u017Eenek.
Tv\xE1 pr\xE1ce mus\xED b\xFDt stoprocentn\u011B spolehliv\xE1, faktick\xE1 a zcela bez jak\xFDchkoliv halucinac\xED.

P\u0158\xCDSN\xC1 PRAVIDLA PRO ZABR\xC1N\u011AN\xCD HALUCINAC\xCDM:
1. \u017D\xC1DN\xC9 HALUCINACE. Nikdy si nic nevym\xFD\u0161lej. Pokud v \xFA\u010Dtence/slo\u017Eence nevid\xED\u0161 konkr\xE9tn\xED jm\xE9no obchodu, datum nebo polo\u017Eky, neodhaduj je, neodvozuj fiktivn\u011B ani si je nevym\xFD\u0161lej. M\xEDsto dom\xFD\u0161len\xED pou\u017Eij "Nezn\xE1mo" nebo pr\xE1zdn\xFD \u0159et\u011Bzec "".
2. N\xC1ZEV OBCHODU (shopName): Skute\u010Dn\xFD, p\u0159esn\xFD n\xE1zev obchodn\xEDka obvykle v z\xE1hlav\xED \xFA\u010Dtenky (nap\u0159. "Albert", "Lidl", "Tesco", "L\xE9k\xE1rna Dr.Max", "\u010Cesk\xE9 dr\xE1hy"). Pokud tam nen\xED, pou\u017Eij "Nezn\xE1mo".
3. CELKOV\xC1 \u010C\xC1STKA (totalAmount): Fin\xE1ln\xED \u010D\xE1stka k \xFAhrad\u011B zaokrouhlen\xE1 na dv\u011B desetinn\xE1 m\xEDsta jako \u010D\xEDslo (nap\u0159. 1450.50). Hledej slova jako CELKEM, K \xDAHRAD\u011A, SUMA, TOTAL.
4. DATUM (date): Datum n\xE1kupu/vystaven\xED ve form\xE1tu YYYY-MM-DD. Pokud na dokladu nen\xED, pou\u017Eij dne\u0161n\xED datum, ale nevym\xFD\u0161lej si n\xE1hodn\xE1 historick\xE1 data.
5. KATEGORIE (category): Vyber v\xFDhradn\u011B z: Potraviny, Elektronika, Drogerie, Doprava, Restaurace, Zdrav\xED, Ostatn\xED. (Medic\xEDnsk\xE9 z\xE1le\u017Eitosti, doplatky za l\xE9ky a n\xE1kup v l\xE9k\xE1rn\u011B spolehliv\u011B za\u0159azuj pod "Zdrav\xED").
6. POLO\u017DKY (items): Seznam nakoupen\xFDch polo\u017Eek (n\xE1zev jako string, cena polo\u017Eky jako \u010D\xEDslo). Sou\u010Det cen polo\u017Eek mus\xED odpov\xEDdat nebo se bl\xEDzce bl\xED\u017Eit celkov\xE9 \u010D\xE1stce.`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              shopName: { type: import_genai.Type.STRING },
              totalAmount: { type: import_genai.Type.NUMBER },
              date: { type: import_genai.Type.STRING },
              category: { type: import_genai.Type.STRING },
              items: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    name: { type: import_genai.Type.STRING },
                    price: { type: import_genai.Type.NUMBER }
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
    } catch (error) {
      console.warn("Extraction warning details:", error?.message || error);
      debugErrors.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        endpoint: "/api/extract-receipt",
        errorMessage: error?.message || String(error),
        errorStack: error?.stack
      });
      res.json({ isFallback: true, error: error?.message || String(error) });
    }
  });
  app.post("/api/extract-document", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      const clientKey = req.headers["x-gemini-key"];
      const keyToUse = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : API_KEY;
      if (!image) {
        return res.status(400).json({ error: "No image data provided" });
      }
      console.log(`Processing document extraction. MimeType: ${mimeType}. Custom Key: ${clientKey ? "Yes" : "No"}`);
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
                text: "Analyzuj tento dokument. Hlavn\xEDm a nejd\u016Fle\u017Eit\u011Bj\u0161\xEDm \xFAkolem je naj\xEDt P\u016EVODN\xCD DATUM VYSTAVEN\xCD/VYD\xC1N\xCD/SEPS\xC1N\xCD dokumentu (nap\u0159. datum l\xE9ka\u0159sk\xE9 kontroly, datum podpisu smlouvy, datum vyd\xE1n\xED rozhodnut\xED zapsan\xE9 na dokumentu v z\xE1hlav\xED \u010Di v textu) a ulo\u017Eit jej ve form\xE1tu YYYY-MM-DD. Pokud je vyfoceno v\xEDce dokument\u016F, vyt\xE1hni datum prvn\xEDho z nich."
              }
            ]
          }
        ],
        config: {
          systemInstruction: `Jsi \u0161pi\u010Dkov\xFD OCR asistent pro rychlou digitalizaci a p\u0159esn\xE9 vyt\u011B\u017Eov\xE1n\xED z\xE1hlav\xED \u010Desk\xFDch \xFA\u0159edn\xEDch, l\xE9ka\u0159sk\xFDch, soci\xE1ln\xEDch a pracovn\xEDch dokument\u016F.
Tv\xE1 pr\xE1ce mus\xED b\xFDt stoprocentn\u011B spolehliv\xE1, faktick\xE1, p\u0159esn\xE1 a zcela bez jak\xFDchkoliv halucinac\xED.

P\u0158\xCDSN\xC1 PRAVIDLA PRO ZABR\xC1N\u011AN\xCD HALUCINAC\xCDM:
1. \u017D\xC1DN\xC9 HALUCINACE A SMY\u0160LEN\xC1 JM\xC9NA. Nikdy si nic nevym\xFD\u0161lej. Pokud v dokumentu nevid\xED\u0161 konkr\xE9tn\xED jm\xE9no \xFA\u0159adu, jm\xE9no l\xE9ka\u0159e, firmu atd., NEODHADUJ JE. M\xEDsto dom\xFD\u0161len\xED pou\u017Eij "Nezn\xE1mo" nebo pr\xE1zdn\xFD \u0159et\u011Bzec "".
2. VYSTAVITEL (issuer): Skute\u010Dn\xE1, dolo\u017Eiteln\xE1 instituce, firma, l\xE9ka\u0159 \u010Di \xFA\u0159ad, kter\xFD dokument v z\xE1hlav\xED vydal a podepsal (nap\u0159. "Fakultn\xED nemocnice v Motole", "\xDA\u0159ad pr\xE1ce \u010CR", "\u010Cesk\xE1 spr\xE1va soci\xE1ln\xEDho zabezpe\u010Den\xED", "Zam\u011Bstnavatel ACME s.r.o."). Pokud raz\xEDtko nebo vystavitel nen\xED \u010Diteln\xFD, pou\u017Eij "Nezn\xE1mo".
3. N\xC1ZEV (title): V\xFDsti\u017En\xFD n\xE1zev dokumentu v \u010De\u0161tin\u011B (nap\u0159. "Pracovn\xED smlouva", "L\xE9ka\u0159sk\xE1 zpr\xE1va", "Rozhodnut\xED o p\u0159izn\xE1n\xED podpory", "Potvrzen\xED o studiu", "Z\xE1po\u010Dtov\xFD list"). Pokud chyb\xED jasn\xFD nadpis, pojmenuj jej v\u011Bcn\u011B a stru\u010Dn\u011B podle obsahu z\xE1hlav\xED.
4. DATUM VYSTAVEN\xCD (issueDate): NEJD\u016ELE\u017DIT\u011AJ\u0160\xCD POLE. Vyt\xE1hni skute\u010Dn\xE9 p\u016Fvodn\xED datum podpisu, kon\xE1n\xED vy\u0161et\u0159en\xED, vystaven\xED \u010Di doru\u010Den\xED zapsan\xE9 na samotn\xE9m dokumentu jako text \u010Di raz\xEDtko ve form\xE1tu YYYY-MM-DD (nap\u0159. "V Praze dne 15. ledna 2026" -> "2026-01-15"). Pokud na dokumentu vid\xED\u0161 pouze rok, dopl\u0148 jej rozumn\u011B (nap\u0159. 2026-01-01). Pokud je vyfoceno v\xEDce dokument\u016F, vezmi datum toho prvn\xEDho. Pokud na cel\xE9m dokumentu \u017E\xE1dn\xE9 datum opravdu nen\xED, pou\u017Eij rok obsa\u017Een\xFD v n\xE1zvu souboru, p\u0159\xEDpadn\u011B dne\u0161n\xED datum jako absolutn\u011B posledn\xED nouzi.
5. KATEGORIE (category): Sp\xE1ruj dokument s p\u0159esn\u011B jednou z n\xE1sleduj\xEDc\xEDch povolen\xFDch kategori\xED: "Zdravotn\xED", "Pracovn\xED \xFA\u0159ad", "Soci\xE1ln\xED zabezpe\u010Den\xED", "Pracovn\xED smlouvy", "Ostatn\xED".`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              title: { type: import_genai.Type.STRING },
              issuer: { type: import_genai.Type.STRING },
              issueDate: { type: import_genai.Type.STRING },
              category: { type: import_genai.Type.STRING }
            },
            required: ["title", "issuer", "issueDate", "category"]
          }
        }
      });
      const extractedData = JSON.parse(response.text);
      console.log("Extracted document successfully:", extractedData.title);
      res.json(extractedData);
    } catch (error) {
      console.warn("Document extraction warning details:", error?.message || error);
      debugErrors.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
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
  app.get("/api/debug-errors", (req, res) => {
    res.json({
      currentApiKeyMasked: API_KEY ? API_KEY.substring(0, 7) + "..." + API_KEY.substring(API_KEY.length - 4) : "None",
      errors: debugErrors
    });
  });
  const DATA_DIR = import_path.default.join(process.cwd(), "data");
  if (!import_fs.default.existsSync(DATA_DIR)) {
    try {
      import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Failed to create data dir:", e);
    }
  }
  const RECEIPTS_FILE = import_path.default.join(DATA_DIR, "receipts.json");
  const DOCUMENTS_FILE = import_path.default.join(DATA_DIR, "documents.json");
  app.get("/api/db/receipts", (req, res) => {
    try {
      if (import_fs.default.existsSync(RECEIPTS_FILE)) {
        const data = import_fs.default.readFileSync(RECEIPTS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json([]);
    } catch (error) {
      console.error("Error reading receipts database:", error);
      res.status(500).json({ error: "Failed to read receipts" });
    }
  });
  app.post("/api/db/receipts", (req, res) => {
    try {
      const { receipts } = req.body;
      if (!Array.isArray(receipts)) {
        return res.status(400).json({ error: "Invalid receipts data" });
      }
      import_fs.default.writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), "utf-8");
      console.log(`Saved ${receipts.length} receipts to backend file.`);
      res.json({ success: true, count: receipts.length });
    } catch (error) {
      console.error("Error writing receipts database:", error);
      res.status(500).json({ error: "Failed to save receipts" });
    }
  });
  app.get("/api/db/documents", (req, res) => {
    try {
      if (import_fs.default.existsSync(DOCUMENTS_FILE)) {
        const data = import_fs.default.readFileSync(DOCUMENTS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json([]);
    } catch (error) {
      console.error("Error reading documents database:", error);
      res.status(500).json({ error: "Failed to read documents" });
    }
  });
  app.post("/api/db/documents", (req, res) => {
    try {
      const { documents } = req.body;
      if (!Array.isArray(documents)) {
        return res.status(400).json({ error: "Invalid documents data" });
      }
      import_fs.default.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documents, null, 2), "utf-8");
      console.log(`Saved ${documents.length} documents to backend file.`);
      res.json({ success: true, count: documents.length });
    } catch (error) {
      console.error("Error writing documents database:", error);
      res.status(500).json({ error: "Failed to save documents" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
