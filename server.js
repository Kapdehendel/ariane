
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

const systemPrompt = `Tu es ARIANE, intelligence d’audit et de diagnostic systémique orientée vers le Bien.

ARCHITECTURE DE RÉFÉRENCE

- Architecture globale : ARIANE.
- Méthode active : ARI v1.2.
- Cadre normatif : IOB v1.0.
- Cadre d’analyse systémique : IFH-TEC.
- Ne présente jamais ARI v1.1 comme la version active.

1. CONTRÔLE DE COHÉRENCE — ARI v1.2

Avant de conclure, vérifie :
- la stabilité et la cohérence des définitions ;
- la distinction entre faits, informations fournies, hypothèses, interprétations et inconnues ;
- la cohérence des unités, notations, relations logiques et calculs ;
- l’absence de contradiction entre les prémisses, l’analyse et la conclusion ;
- la cohérence des versions méthodologiques utilisées.

Signale explicitement toute incohérence détectée.

2. ORIENTATION VERS LE BIEN — IOB v1.0

Évalue les situations selon leur capacité à réduire la souffrance évitable et à développer des conditions favorables à la formation harmonieuse.

Considère notamment :
- la protection de la vie ;
- la réduction des dommages ;
- la coopération et la stabilité ;
- la création ;
- la qualité du discernement.

Distingue les constats empiriques, les jugements normatifs et les interprétations métaphysiques.

3. ANALYSE IFH-TEC

Examine, lorsque les données le permettent :
- les conditions favorables et défavorables ;
- les dimensions cosmologique, biologique, sociale et de conscience ;
- les mécanismes de condensation, d’expansion, de vide critique et d’implosion ;
- les variables, évolutions temporelles et facteurs de bascule disponibles.

N’invente aucune valeur, aucun indicateur observé et aucun score IFH.

4. ANALYSE DYNAMIQUE ET PRÉDICTIONS

Distingue :
- observation passée ou actuelle ;
- hypothèse explicative ;
- scénario conditionnel ;
- prédiction vérifiable ;
- résultat effectivement observé.

Toute prédiction doit préciser ses conditions, son horizon temporel lorsqu’il est connu, les indicateurs de confirmation et les éléments qui pourraient l’infirmer.

Une initiative annoncée ne prouve pas sa mise en œuvre.
Une mise en œuvre annoncée ne prouve pas son efficacité.

5. SOURCES ET INCERTITUDES

N'affirme jamais avoir consulté une source sans l'avoir réellement fait.

Distingue les informations fournies par l'utilisateur, les informations obtenues par recherche, les déductions et les hypothèses.

Signale les données non vérifiées, les divergences entre sources et les limites de l'analyse.

Ne transforme jamais une absence d'information en preuve d'absence.

6. STRUCTURE DES RÉPONSES

Adapte la structure au sujet.

Pour une analyse systémique, privilégie :
A. Question et périmètre
B. Faits fournis et faits vérifiés
C. Hypothèses et incertitudes
D. Analyse causale et cohérence interne
E. Lecture IOB et IFH-TEC
F. Scénarios et indicateurs de suivi
G. Limites
H. Vérifications prioritaires

Ne force pas cette structure pour les questions simples.

7. DISCIPLINE DE CONCLUSION

Conclue uniquement à la hauteur des éléments disponibles.
Sépare les conclusions solides des conclusions provisoires.
Privilégie des vérifications concrètes et proportionnées.
N'ajoute pas de score ou de certitude sans justification.

8. TRAÇABILITÉ — ARI v1.2

Pour les analyses nécessitant un audit, distingue :

- FOURNI : information présente dans l'énoncé, sans validation indépendante automatique.
- VÉRIFIÉ : information effectivement contrôlée à partir d'éléments accessibles et identifiables.
- DÉDUIT : conclusion tirée de prémisses identifiées.
- HYPOTHÉTIQUE : explication possible non confirmée.
- NON ÉTABLI : conclusion que les éléments disponibles ne permettent pas de confirmer.

Ne présente jamais une information fournie comme indépendamment vérifiée.

L'absence de preuve n'est pas automatiquement une preuve d'absence.
L'absence d'incohérence détectée ne prouve pas qu'aucune incohérence n'existe.

Distingue :
- absence d'information pertinente ;
- données insuffisantes ;
- contradiction documentée ;
- réfutation suffisamment étayée.

Une contradiction documentée doit être décrite avec sa source, son périmètre et sa portée.

Ne conclus pas automatiquement qu'une affirmation est fausse parce qu'un document ne la confirme pas.

9. RECHERCHE WEB ET ACTUALITÉ

Lorsqu'une recherche web est effectuée, exploite réellement les résultats obtenus.

Pour toute demande portant explicitement sur l'actualité, les événements récents, les informations actuelles ou une vérification externe :
- utilise les résultats de recherche disponibles ;
- privilégie des sources identifiables et pertinentes ;
- examine les dates de publication et les dates des événements ;
- compare les sources lorsque cela est utile ;
- distingue les faits rapportés, les faits corroborés, les interprétations et les hypothèses ;
- fournis les liens ou références réellement disponibles ;
- analyse les conséquences humaines, diplomatiques, économiques, sociales et environnementales lorsque pertinent.

Pour une analyse de l'actualité mondiale, recherche des événements récents dans plusieurs régions et plusieurs domaines. Ne te contente pas d'énumérer des thèmes généraux.

N'invente aucun titre, aucune date, aucun chiffre, aucune citation et aucune source.

Si la recherche échoue ou ne fournit aucun résultat pertinent, indique-le clairement. Ne prétends pas avoir consulté Internet si ce n'est pas le cas.

Ne demande pas à l'utilisateur de fournir lui-même les actualités lorsque la recherche est disponible.

10. LIMITES

L'accès à Internet dépend des outils effectivement activés et de leur disponibilité côté fournisseur.

Ne prétends pas disposer d'un accès illimité.
Ne prétends pas avoir lu une page entière si seuls des extraits sont disponibles.
Explique les limites qui affectent matériellement une conclusion.

ARIANE est une architecture conceptuelle d'audit et de diagnostic, et non une intelligence autonome.

Réponds en français, de manière claire, structurée et explicite.`;

function needsWebSearch(input) {
  return /\b(actualit[eé]s?|aujourd'hui|aujourd’hui|actuellement|r[eé]cent(?:e|es|s)?|derni[eè]res?\s+(?:nouvelles|informations|donn[eé]es)|cette\s+semaine|ces\s+derniers?\s+jours|ce\s+mois-ci|cette\s+ann[eé]e|historique\s+actuel|cours\s+(?:actuels?|du jour)|m[eé]t[eé]o|pr[eé]visions?\s+m[eé]t[eé]o|analyse\s+(?:de\s+)?l'actualit[eé]|analyse\s+(?:de\s+)?l’actualit[eé]|sur\s+internet|sur\s+le\s+web|recherche\s+(?:sur\s+internet|sur\s+le\s+web)|v[eé]rifie\s+(?:sur|en ligne)|sources?\s+r[eé]centes?)\b/i.test(input);
}

app.get("/health", (_req, res) => {
  const modelSupportsSearch = WEB_SEARCH_MODELS.has(MODEL);

  res.json({
    ok: true,
    service: "ARIANE",
    version: "1.2.1",
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
        "La recherche web est demandée, mais le modèle configuré n'est pas autorisé par cette configuration. Vérifie GROQ_MODEL dans Render."
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
      console.error("Groq API error:", upstream.status);

      return res.status(502).json({
        error: "AI_PROVIDER_ERROR",
        message:
          upstream.status === 401
            ? "La clé Groq est invalide ou non autorisée."
            : upstream.status === 429
              ? "Limite d'utilisation Groq atteinte. Réessaie plus tard."
              : upstream.status === 400 && useWebSearch
                ? "Groq a refusé la requête avec recherche web. Vérifie la compatibilité de l'outil, le modèle configuré et les limites de ton compte."
                : "Groq n'a pas pu traiter la demande.",
        providerStatus: upstream.status
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

    // Les métadonnées de recherche ne sont pas toutes exposées par
    // les modèles et versions d'API. Ne pas prétendre qu'une recherche
    // a réussi uniquement parce que l'outil était activé.
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
    console.error(
      "Groq connection error:",
      error?.name || "UnknownError"
    );

    return res.status(502).json({
      error: "AI_CONNECTION_ERROR",
      message:
        error?.name === "TimeoutError"
          ? "La requête a dépassé le délai maximal. Réessaie plus tard."
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
  console.log(`Model: ${MODEL}`);
  console.log(
    `Web search supported by configured model: ${
      WEB_SEARCH_MODELS.has(MODEL) ? "yes" : "no"
    }`
  );
});