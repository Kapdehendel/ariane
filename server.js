
import express from "express";
import helmet from "helmet";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GROQ_API_KEY || "";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const WEB_SEARCH_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b"
]);

const VERSION = "1.2.2";

const systemPrompt = `Tu es ARIANE, intelligence d’audit et de diagnostic systémique orientée vers le Bien.

ARCHITECTURE DE RÉFÉRENCE
- Architecture globale : ARIANE.
- Méthode active : ARI v1.2.
- Cadre normatif : IOB v1.0.
- Cadre d’analyse : IFH-TEC.
- Ne présente jamais ARI v1.1 comme version active.

1. ARI v1.2 — COHÉRENCE
Vérifie les définitions, les faits, les hypothèses, les unités, les calculs, les contradictions et la cohérence des conclusions. Signale les incohérences détectées.

2. IOB v1.0 — ORIENTATION VERS LE BIEN
Évalue les conditions susceptibles de réduire la souffrance évitable et de développer des conditions favorables. Considère la protection de la vie, la réduction des dommages, la coopération, la création et le discernement.
Distingue constats empiriques, jugements normatifs et interprétations métaphysiques.

3. IFH-TEC
Examine, lorsque les données le permettent, les dimensions cosmologique, biologique, sociale et de conscience, ainsi que les mécanismes de condensation, d’expansion, de vide critique et d’implosion.
N’invente aucun score IFH ni aucune valeur observée.

4. PRÉDICTIONS
Distingue observations, hypothèses, scénarios conditionnels, prédictions vérifiables et résultats observés.
Précise les conditions, les indicateurs de confirmation et les éléments susceptibles d’infirmer une prédiction.
Une annonce ne prouve ni la mise en œuvre ni l’efficacité.

5. SOURCES ET INCERTITUDES
N’affirme jamais avoir consulté une source sans l’avoir réellement fait.
Distingue informations fournies, informations vérifiées, déductions et hypothèses. Signale les incertitudes, divergences et limites.
L’absence d’information ne constitue pas automatiquement une preuve d’absence.

6. STRUCTURE
Adapte la réponse au sujet. Pour un audit systémique, examine la question, les faits, les incertitudes, l’analyse causale, la lecture IOB et IFH-TEC, les scénarios, les limites et les vérifications prioritaires.
Ne force pas cette structure pour les questions simples.

7. DISCIPLINE DE CONCLUSION
Conclue uniquement à la hauteur des éléments disponibles. Distingue conclusions solides et provisoires. N'ajoute pas de score ni de certitude sans justification.

8. TRAÇABILITÉ
Utilise si nécessaire les catégories :
- FOURNI : présent dans l’énoncé, sans validation indépendante.
- VÉRIFIÉ : contrôlé à partir d’éléments identifiables.
- DÉDUIT : conclusion tirée de prémisses explicites.
- HYPOTHÉTIQUE : explication possible non confirmée.
- NON ÉTABLI : éléments insuffisants pour conclure.
Distingue absence d'information, données insuffisantes, contradiction documentée et réfutation étayée.

9. RECHERCHE WEB
Pour toute demande d’actualité, d’information récente ou de vérification externe, utilise la recherche web lorsqu’elle est disponible.
Privilégie des sources identifiables, examine les dates, compare les sources et fournis les liens réellement disponibles.
Distingue faits rapportés, faits corroborés, interprétations et hypothèses.
Pour l’actualité mondiale, couvre plusieurs régions et domaines lorsque la demande le justifie.
N’invente aucun titre, aucune date, aucun chiffre, aucune citation et aucune source.
Si la recherche échoue, dis-le clairement. Ne prétends pas avoir consulté Internet si ce n’est pas le cas.

10. LIMITES
L’accès à Internet dépend des outils réellement activés et de leur disponibilité chez le fournisseur. Ne prétends pas disposer d’un accès illimité ni avoir lu une page entière si seuls des extraits sont disponibles.
ARIANE est une architecture conceptuelle d’audit et de diagnostic, et non une intelligence autonome.

Réponds en français, de manière claire, structurée et explicite.`;

function needsWebSearch(input) {
  return /\b(actualit[eé]s?|aujourd'hui|aujourd’hui|actuellement|r[eé]cent(?:e|es|s)?|derni[eè]res?\s+(?:nouvelles|informations|donn[eé]es)|cette\s+semaine|ces\s+derniers?\s+jours|ce\s+mois-ci|cette\s+ann[eé]e|historique\s+actuel|cours\s+(?:actuels?|du jour)|m[eé]t[eé]o|pr[eé]visions?\s+m[eé]t[eé]o|analyse\s+(?:de\s+)?l['’]actualit[eé]|sur\s+internet|sur\s+le\s+web|recherche\s+(?:sur\s+internet|sur\s+le\s+web)|v[eé]rifie\s+(?:sur|en ligne)|sources?\s+r[eé]centes?)\b/i.test(input);
}

function getRateLimitHeaders(headers) {
  const names = [
    "retry-after",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens"
  ];

  const result = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) result[name] = value;
  }
  return result;
}

app.get("/health", (_req, res) => {
  const modelSupportsSearch = WEB_SEARCH_MODELS.has(MODEL);

  res.json({
    ok: true,
    service: "ARIANE",
    version: VERSION,
    aiConfigured: Boolean(API_KEY),
    model: API_KEY ? MODEL : null,
    webSearchAvailable: Boolean(API_KEY) && modelSupportsSearch,
    webSearchMode: modelSupportsSearch
      ? "available-for-current-events-requests"
      : "disabled-for-current-model"
  });
});

app.post("/api/analyze", async (req, res) => {
  const input =
    typeof req.body?.input === "string"
      ? req.body.input.trim()
      : "";

  if (!input) {
    return res.status(400).json({
      error: "INPUT_REQUIRED",
      message: "Ajoute un texte à analyser."
    });
  }

  if (input.length > 20000) {
    return res.status(413).json({
      error: "INPUT_TOO_LONG",
      message: "Limite : 20 000 caractères."
    });
  }

  if (!API_KEY) {
    return res.status(503).json({
      error: "AI_NOT_CONFIGURED",
      message: "La clé API Groq n'est pas configurée côté hébergeur."
    });
  }

  const modelSupportsSearch = WEB_SEARCH_MODELS.has(MODEL);
  const searchRequested = needsWebSearch(input);
  const useWebSearch = modelSupportsSearch && searchRequested;

  if (searchRequested && !modelSupportsSearch) {
    return res.status(503).json({
      error: "WEB_SEARCH_UNAVAILABLE",
      message:
        "Le modèle configuré n'est pas autorisé par cette configuration de recherche."
    });
  }

  const requestBody = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input }
    ],
    temperature: 0.2
  };

  if (useWebSearch) {
    requestBody.tools = [{ type: "browser_search" }];
    requestBody.tool_choice = "required";
  }

  try {
    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(90000)
      }
    );

    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const providerError = payload?.error || {};
      const rateLimits = getRateLimitHeaders(upstream.headers);

      // Ne jamais journaliser la clé API ni les en-têtes d'autorisation.
      console.error("Groq API error:", JSON.stringify({
        status: upstream.status,
        type: providerError.type || null,
        code: providerError.code || null,
        message: providerError.message || null,
        rateLimits
      }));

      let message = "Groq n'a pas pu traiter la demande.";

      if (upstream.status === 401) {
        message = "La clé Groq est invalide ou non autorisée.";
      } else if (upstream.status === 429) {
        message =
          providerError.message ||
          "Groq a refusé la demande pour une limite d'utilisation. Consulte les détails de diagnostic.";
      } else if (upstream.status === 400 && useWebSearch) {
        message =
          providerError.message ||
          "Groq a refusé la requête avec recherche web. Vérifie la compatibilité du modèle et de l'outil.";
      } else if (providerError.message) {
        message = providerError.message;
      }

      return res.status(502).json({
        error: "AI_PROVIDER_ERROR",
        message,
        providerStatus: upstream.status,
        providerError: {
          type: providerError.type || null,
          code: providerError.code || null,
          message: providerError.message || null
        },
        rateLimits
      });
    }

    const choice = payload?.choices?.[0];
    const message = choice?.message;
    const analysis = message?.content;

    if (typeof analysis !== "string" || !analysis.trim()) {
      return res.status(502).json({
        error: "AI_EMPTY_RESPONSE",
        message: useWebSearch
          ? "Groq n'a pas fourni de réponse textuelle après la requête de recherche."
          : "Réponse IA vide."
      });
    }

    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls
      : [];

    return res.json({
      ok: true,
      model: MODEL,
      webSearchRequested: searchRequested,
      webSearchEnabled: useWebSearch,
      toolCallsReported: toolCalls.length,
      finishReason: choice?.finish_reason || null,
      analysis
    });
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError";

    console.error("Groq connection error:", JSON.stringify({
      name: error?.name || "UnknownError",
      message: isTimeout ? "Request timed out" : "Connection failed"
    }));

    return res.status(502).json({
      error: isTimeout ? "AI_TIMEOUT" : "AI_CONNECTION_ERROR",
      message: isTimeout
        ? "La requête a dépassé le délai maximal de 90 secondes."
        : "Impossible de joindre Groq. Réessaie plus tard."
    });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "BODY_TOO_LARGE",
      message: "La requête est trop volumineuse."
    });
  }

  return res.status(400).json({
    error: "INVALID_REQUEST",
    message: "Requête JSON invalide."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ARIANE backend listening on port ${PORT}`);
  console.log(`Version: ${VERSION}`);
  console.log(`Model: ${MODEL}`);
  console.log(
    `Web search supported by configured model: ${
      WEB_SEARCH_MODELS.has(MODEL) ? "yes" : "no"
    }`
  );
});
