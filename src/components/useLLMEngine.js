import { useState, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

const ENV_GEMINI_KEY = import.meta.env.VITE_GEMINI_API;

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite", // Fastest & lowest rate-limit usage
  "gemma-3-12b-it",        // High-quota open model
  "gemini-2.5-flash",      // Stable fallback
];

export function useLLMEngine() {
  const [isLLMThinking, setIsLLMThinking] = useState(false);
  const [llmError, setLlmError] = useState(null);

  const extractLegalMove = (rawText, legalMoves) => {
    if (!rawText) return null;
    const lower = rawText.trim().toLowerCase();
    const cleaned = lower.replace(/[^a-z0-9]/g, "");
    if (legalMoves.includes(cleaned)) return cleaned;
    return legalMoves.find((move) => lower.includes(move)) || null;
  };

  const fetchLLMMove = useCallback(async (fen, legalMoves, provider = "gemini", apiKeys = {}) => {
    const activeKey =
      apiKeys[provider]?.trim() ||
      (provider === "gemini" ? ENV_GEMINI_KEY : "");

    if (!activeKey) {
      setLlmError(`Missing ${provider.toUpperCase()} API Key! Click its logo to add one.`);
      return null;
    }

    setIsLLMThinking(true);
    setLlmError(null);

    // Ultra-compact prompt (~35 tokens total)
    const prompt = `FEN:${fen}\nLegal:${legalMoves.join(" ")}\nReply ONLY with 1 move from Legal:`;

    try {
      // 1. GOOGLE GEMINI
      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(activeKey);
        for (const modelName of GEMINI_MODELS) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: {
                maxOutputTokens: 30,
                temperature: 0.1,
              },
            });
            const result = await model.generateContent(prompt);
            const move = extractLegalMove(await result.response.text(), legalMoves);
            if (move) {
              setIsLLMThinking(false);
              return move;
            }
          } catch (err) {
            console.warn(`Gemini ${modelName} error:`, err.message);
            // Stop immediately if API key is invalid
            if (err.message?.includes("API_KEY_INVALID")) break;
          }
        }
      }

      // 2. OPENAI / GROQ / DEEPSEEK (OpenAI-Compatible Endpoints)
      if (provider === "openai" || provider === "groq" || provider === "deepseek") {
        const endpoints = {
          openai: {
            url: "https://api.openai.com/v1/chat/completions",
            model: "gpt-4o-mini",
          },
          groq: {
            url: "https://api.groq.com/openai/v1/chat/completions",
            model: "llama-3.3-70b-versatile",
          },
          deepseek: {
            url: "https://api.deepseek.com/chat/completions",
            model: "deepseek-chat",
          },
        };

        const { url, model } = endpoints[provider];
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 15,
            temperature: 0.1,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `${provider} error`);
        const text = data.choices?.[0]?.message?.content || "";
        const move = extractLegalMove(text, legalMoves);
        if (move) {
          setIsLLMThinking(false);
          return move;
        }
      }

      // 3. ANTHROPIC CLAUDE
      if (provider === "claude") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-latest",
            max_tokens: 15,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Claude error");
        const text = data.content?.[0]?.text || "";
        const move = extractLegalMove(text, legalMoves);
        if (move) {
          setIsLLMThinking(false);
          return move;
        }
      }
    } catch (err) {
      console.warn(`${provider} API failed:`, err.message);
      setLlmError(`${provider.toUpperCase()}: ${err.message}`);
    }

    // Fallback legal move so the game doesn't freeze on rate-limit spikes
    setIsLLMThinking(false);
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }, []);

  return { fetchLLMMove, isLLMThinking, llmError, setLlmError };
}