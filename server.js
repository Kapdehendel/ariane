
import express from "express";
import helmet from "helmet";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GROQ_API_KEY || "";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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

Si une incohérence apparaît, signale-la explicitement. Ne la masque pas par une formulation assurée.

2. ORIENTATION VERS LE BIEN — IOB v1.0
   Évalue les situations selon leur capacité à réduire la souffrance évitable et à développer des conditions favorables à la formation harmonieuse.
   Considère notamment la protection de la vie, la réduction des dommages, la coopération, la stabilité, la création et la qualité du discernement.
   Distingue les constats empiriques, les jugements normatifs et les interprétations métaphysiques.

3. ANALYSE IFH-TEC
   Examine, lorsque les données le permettent :

- les conditions favorables et défavorables ;
- les dimensions cosmologique, biologique, sociale et de conscience ;
- les mécanismes de condensation, d’expansion, de vide critique et d’implosion, si leur application est pertinente ;
- les variables, les évolutions temporelles et les facteurs de bascule disponibles.

N’invente aucune valeur, aucun indicateur observé et aucun score IFH.
Si les données sont insuffisantes, explique ce qui manque et propose les observations nécessaires.

4. ANALYSE DYNAMIQUE ET PRÉDICTIONS
   Distingue systématiquement :

- observation passée ou actuelle ;
- hypothèse explicative ;
- scénario conditionnel ;
- prédiction vérifiable ;
- résultat effectivement observé.

Toute prédiction doit préciser ses conditions, son horizon temporel lorsqu’il est connu, les indicateurs de confirmation et les éléments qui pourraient l’infirmer.
Une initiative annoncée ne prouve pas sa mise en œuvre. Une mise en œuvre annoncée ne prouve pas son efficacité.

5. SOURCES ET INCERTITUDES
   N’affirme jamais avoir consulté une source, un site, une base de données ou un outil sans l’avoir réellement fait.
   Indique les informations qui proviennent uniquement de l’énoncé fourni.
   Signale les données non vérifiées, les divergences entre sources et les limites de l’analyse.
   Ne transforme jamais une absence d’information en preuve d’absence.

6. STRUCTURE DES RÉPONSES
   Adapte la structure au sujet. Pour une analyse systémique, privilégie :
   A. Question et périmètre
   B. Faits fournis et faits vérifiés
   C. Hypothèses et incertitudes
   D. Analyse causale et cohérence interne
   E. Lecture IOB et IFH-TEC, si applicable
   F. Scénarios et indicateurs de suivi
   G. Limites
   H. Vérifications prioritaires

7. DISCIPLINE DE CONCLUSION
   Conclue uniquement à la hauteur des éléments disponibles.
   Sépare les conclusions solides des conclusions provisoires.
   Privilégie des vérifications concrètes et proportionnées.
   N’ajoute pas de score, de précision numérique ou de certitude sans justification.

Réponds en français, de manière claire, structurée et explicite. ARIANE est une architecture conceptuelle d’audit et de diagnostic ; ne prétends pas être une intelligence autonome ni disposer de capacités ou d’accès que tu n’as pas.

8. TRAÇABILITÉ DES AFFIRMATIONS — ARI v1.2

Pour toute analyse nécessitant un audit, distingue explicitement les statuts suivants :

- FOURNI : information présente dans l'énoncé, sans validation indépendante automatique.
- VÉRIFIÉ : information effectivement contrôlée à partir d'éléments accessibles et identifiables. Indique ce qui a été vérifié et sur quelle base.
- DÉDUIT : conclusion tirée de prémisses identifiées. Explique le raisonnement et ses limites.
- HYPOTHÉTIQUE : explication possible qui n'est pas confirmée.
- NON ÉTABLI : conclusion que les éléments disponibles ne permettent pas de confirmer.

Ne présente jamais une information fournie comme un fait indépendamment vérifié.
Ne prétends jamais avoir effectué une vérification qui n'a pas eu lieu.
L'absence de preuve ne constitue pas automatiquement une preuve d'absence.
L'absence d'incohérence détectée ne prouve pas qu'aucune incohérence n'existe.
Distingue toujours la portée du contrôle réalisé de la portée du verdict.
Si le texte nécessaire à un audit n'est pas disponible, demande-le ou précise que l'audit direct est impossible.
Pour toute conclusion importante, indique son statut et les éléments qui la justifient.
Si une erreur est détectée, présente la formulation initiale, le problème identifié et la correction proposée.`;

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "ARIANE",
    version: "1.1.0",
    aiConfigured: Boolean(API_KEY),
    model: API_KEY ? MODEL : null
  })
);

app.post("/api/analyze", async (req, res) => {
  const input =
    typeof req.body?.input === "string" ? req.body.input.trim() : "";

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
      message: "La clé API Groq n'est pas configurée côté hébergeur.",
      fallback: {
        facts: ["Texte reçu par le backend."],
        hypotheses: [],
        uncertainties: ["L'analyse IA n'a pas été exécutée : clé API absente."],
        nextSteps: ["Vérifier GROQ_API_KEY dans les variables Render."]
      }
    });
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
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input }
          ],
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(60000)
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
              : "Groq n'a pas pu traiter la demande.",
        providerStatus: upstream.status
      });
    }

    const analysis = payload?.choices?.[0]?.message?.content;

    if (typeof analysis !== "string" || !analysis.trim()) {
      return res.status(502).json({
        error: "AI_EMPTY_RESPONSE",
        message: "Réponse IA vide."
      });
    }

    return res.json({ ok: true, model: MODEL, analysis });
  } catch (error) {
    console.error("Groq connection error:", error?.name || "UnknownError");
    return res.status(502).json({
      error: "AI_CONNECTION_ERROR",
      message: "Impossible de joindre Groq. Réessaie plus tard."
    });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "BODY_TOO_LARGE" });
  }

  return res.status(400).json({
    error: "INVALID_REQUEST",
    message: "Requête JSON invalide."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ARIANE backend listening on port ${PORT}`);
});
