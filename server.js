import express from "express";
import helmet from "helmet";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const systemPrompt = `Tu es ARIANE, une intelligence d'audit et de diagnostic systémique orientée vers le Bien.
Architecture conceptuelle : ARI v1.2, IOB v1.0 et IFH-TEC.
Distingue les faits vérifiés, les informations fournies, les hypothèses, les interprétations et les incertitudes.
Contrôle la cohérence interne : définitions, unités, relations logiques, calculs et versions.
N'invente ni sources, ni chiffres, ni scores, ni validations. Ne calcule pas de score IFH sans données suffisantes.
Distingue une initiative diplomatique de sa mise en œuvre et des résultats observés.
Indique les limites et propose des vérifications concrètes. Ne prétends pas avoir consulté des sources ou outils non disponibles.
Réponds en français de façon claire et structurée.`;

app.get("/health", (_req, res) => res.json({
  ok: true, service: "ARIANE", version: "1.0.0",
  aiConfigured: Boolean(API_KEY), model: API_KEY ? MODEL : null
}));

app.post("/api/analyze", async (req, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
  if (!input) return res.status(400).json({ error: "INPUT_REQUIRED", message: "Ajoute un texte à analyser." });
  if (input.length > 20000) return res.status(413).json({ error: "INPUT_TOO_LONG", message: "Limite : 20 000 caractères." });
  if (!API_KEY) return res.status(503).json({
    error: "AI_NOT_CONFIGURED",
    message: "Le serveur fonctionne, mais la clé API n'est pas configurée côté hébergeur.",
    fallback: { facts: ["Texte reçu par le backend."], hypotheses: [],
      uncertainties: ["L'analyse IA n'a pas été exécutée : clé API absente."],
      nextSteps: ["Configurer OPENAI_API_KEY dans les variables secrètes de l'hébergeur."] }
  });
  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [
        { role: "system", content: systemPrompt }, { role: "user", content: input }
      ], temperature: 0.2 })
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({
      error: "AI_PROVIDER_ERROR",
      message: payload?.error?.message || `Le fournisseur IA a répondu avec le statut ${upstream.status}.`,
      providerStatus: upstream.status
    });
    const analysis = payload?.choices?.[0]?.message?.content;
    if (typeof analysis !== "string" || !analysis.trim())
      return res.status(502).json({ error: "AI_EMPTY_RESPONSE", message: "Réponse IA vide." });
    return res.json({ ok: true, model: MODEL, analysis });
  } catch {
    return res.status(502).json({ error: "AI_CONNECTION_ERROR", message: "Impossible de joindre le fournisseur IA." });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "BODY_TOO_LARGE" });
  res.status(400).json({ error: "INVALID_REQUEST", message: "Requête JSON invalide." });
});

app.listen(PORT, "0.0.0.0", () => console.log(`ARIANE backend listening on port ${PORT}`));
