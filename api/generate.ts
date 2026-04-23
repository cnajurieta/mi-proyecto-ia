import type { VercelRequest, VercelResponse } from "@vercel/node";
// 1. CAMBIAMOS LA LIBRERÍA A LA OFICIAL
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  const { imageDataUrl, prompt } = req.body;

  if (!imageDataUrl || !prompt) {
    return res.status(400).json({ error: "Missing imageDataUrl or prompt" });
  }

  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    return res.status(400).json({ error: "Invalid imageDataUrl format" });
  }
  const [, mimeType, base64Data] = match;

  // 2. NUEVA FORMA DE INICIALIZAR
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 3. NUEVA SINTAXIS DE LLAMADA
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType, data: base64Data } },
      ]);
      
      const response = await result.response;
      const candidates = response.candidates;
      const imagePart = candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData
      );

      if (imagePart?.inlineData) {
        return res.status(200).json({
          mimeType: imagePart.inlineData.mimeType,
          data: imagePart.inlineData.data,
        });
      }

      return res.status(422).json({
        error: "no_image",
        text: response.text() || "No response",
      });
    } catch (err) {
      lastError = err;
      // Lógica de reintentos simplificada para el error 500
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      break;
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  return res.status(500).json({ error: errMsg });
}