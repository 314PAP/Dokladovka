import express from "express";
import path from "path";
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

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `You are an expert OCR and receipt analysis assistant. 
                Task: Extract EXACT data from the provided receipt image. 
                
                CRITICAL RULES:
                1. DO NOT HALLUCINATE. If a value is not visible, use an empty string or 0.
                2. Shop Name: Extract the primary merchant name usually at the top.
                3. Total Amount: Find the final sum paid (usually after 'CELKEM', 'TOTAL', 'SUMA').
                4. Date: Extract date in YYYY-MM-DD format. If only DD.MM.YYYY is present, convert it.
                5. Category: Choose THE BEST fit ONLY from these exact strings: Potraviny, Elektronika, Drogerie, Doprava, Restaurace, Zdraví, Ostatní. (Use 'Zdraví' for pharmacy, medical items, and doctor visits).
                6. Items: List all items with their names and individual prices. Ensure the sum of item prices matches or is close to totalAmount.
                
                Return VALID JSON ONLY.`
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
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
    } catch (error) {
      console.error("Extraction error details:", error);
      res.status(500).json({ error: "Failed to process receipt image" });
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
