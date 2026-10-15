
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

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";

const DAILY_LIMIT = 5;
const VERSION = "1.3.0";

const WEB_SEARCH_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b"
]);

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

function supabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_PUBLISHABLE_KEY &&
    SUPABASE_SECRET_KEY
  );
}

// Vérifie le jeton auprès de Supabase Auth.
// L'identifiant utilisateur vient de Supabase, jamais du corps envoyé par le navigateur.
async function authenticateUser(req) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return {
      ok: false,
      status: 401,
      error: "AUTH_REQUIRED",
      message: "Connecte-toi avec ton compte Google pour utiliser ARIANE."
    };
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      status: 503,
      error: "AUTH_NOT_CONFIGURED",
      message: "L'authentification Supabase n'est pas configurée sur le serveur."
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${match[1]}`
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 401,
        error: "INVALID_SESSION",
        message: "Ta session a expiré ou n'est plus valide. Reconnecte-toi."
      };
    }

    const user = await response.json().catch(() => null);

    if (!user || typeof user.id !== "string") {
      return {
        ok: false,
        status: 401,
        error: "INVALID_SESSION",
        message: "Supabase n'a pas pu confirmer ton identité. Reconnecte-toi."
      };
    }

    return { ok: true, user };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "AUTH_SERVICE_UNAVAILABLE",
      message: "Impossible de vérifier la session Supabase. Réessaie plus tard."
    };
  }
}

// Appelle la fonction SQL existante :
// public.consume_ariane_daily_message(p_user_id uuid)
async function consumeDailyMessage(userId) {
  if (!supabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "QUOTA_NOT_CONFIGURED",
      message: "Le service de quota Supabase n'est pas entièrement configuré."
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/consume_ariane_daily_message`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_user_id: userId }),
        signal: AbortSignal.timeout(15000)
      }
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      // Ne jamais journaliser les clés ni les en-têtes d'autorisation.
      console.error("Supabase quota error:", JSON.stringify({
        status: response.status,
        code: result?.code || null,
        message: result?.message || null
      }));

      return {
        ok: false,
        status: 503,
        error: "QUOTA_CHECK_FAILED",
        message: "Le compteur de messages est indisponible. Aucun appel à Groq n'a été effectué."
      };
    }

    const quota = Array.isArray(result) ? result[0] : result;

    if (
      !quota ||
      typeof quota.allowed !== "boolean" ||
      typeof quota.remaining !== "number"
    ) {
      console.error("Supabase quota error: unexpected response format");

      return {
        ok: false,
        status: 503,
        error: "QUOTA_RESPONSE_INVALID",
        message: "Le compteur Supabase a renvoyé une réponse inattendue."
      };
    }

    if (!quota.allowed) {
      return {
        ok: true,
        allowed: false,
        remaining: 0,
        limit: DAILY_LIMIT
      };
    }

    return {
      ok: true,
      allowed: true,
      remaining: quota.remaining,
      limit: quota.limit || DAILY_LIMIT
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "QUOTA_SERVICE_UNAVAILABLE",
      message: "Impossible de joindre le compteur Supabase. Réessaie plus tard."
    };
  }
}

app.get("/health", (_req, res) => {
  const modelSupportsSearch = WEB_SEARCH_MODELS.has(MODEL);

  res.json({
    ok: true,
    service: "ARIANE",
    version: VERSION,
    aiConfigured: Boolean(API_KEY),
    model: API_KEY ? MODEL : null,
    authConfigured: Boolean(
      SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ),
    quotaConfigured: supabaseConfigured(),
    dailyMessageLimit: DAILY_LIMIT,
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

  // 1. Vérifier l'identité.
  const authentication = await authenticateUser(req);

  if (!authentication.ok) {
    return res.status(authentication.status).json({
      error: authentication.error,
      message: authentication.message
    });
  }

  // 2. Réserver un message pour cet utilisateur authentifié.
  // En cas d'erreur de quota, aucun appel à Groq n'est effectué.
  const quota = await consumeDailyMessage(authentication.user.id);

  if (!quota.ok) {
    return res.status(quota.status).json({
      error: quota.error,
      message: quota.message
    });
  }

  if (!quota.allowed) {
    return res.status(429).json({
      error: "DAILY_LIMIT_REACHED",
      message: "Tu as utilisé tes 5 messages pour aujourd'hui. Reviens demain.",
      remaining: 0,
      limit: DAILY_LIMIT
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
        rateLimits,
        remaining: quota.remaining,
        limit: quota.limit
      });
    }

    const choice = payload?.choices?.[0];
    const assistantMessage = choice?.message;
    const analysis = assistantMessage?.content;

    if (typeof analysis !== "string" || !analysis.trim()) {
      return res.status(502).json({
        error: "AI_EMPTY_RESPONSE",
        message: useWebSearch
          ? "Groq n'a pas fourni de réponse textuelle après la requête de recherche."
          : "Réponse IA vide.",
        remaining: quota.remaining,
        limit: quota.limit
      });
    }

    const toolCalls = Array.isArray(assistantMessage?.tool_calls)
      ? assistantMessage.tool_calls
      : [];

    return res.json({
      ok: true,
      model: MODEL,
      webSearchRequested: searchRequested,
      webSearchEnabled: useWebSearch,
      toolCallsReported: toolCalls.length,
      finishReason: choice?.finish_reason || null,
      analysis,
      remaining: quota.remaining,
      limit: quota.limit
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
        : "Impossible de joindre Groq. Réessaie plus tard.",
      remaining: quota.remaining,
      limit: quota.limit
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
  console.log(`Supabase auth configured: ${
    Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) ? "yes" : "no"
  }`);
  console.log(`Supabase quota configured: ${
    supabaseConfigured() ? "yes" : "no"
  }`);
  console.log(`Daily message limit: ${DAILY_LIMIT}`);
  console.log(`Web search supported by configured model: ${
    WEB_SEARCH_MODELS.has(MODEL) ? "yes" : "no"
  }`);
});
