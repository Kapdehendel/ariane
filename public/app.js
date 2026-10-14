
const health = document.querySelector("#health");
const input = document.querySelector("#input");
const button = document.querySelector("#analyze");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

async function checkHealth() {
  try {
    const response = await fetch("/health");
    const data = await response.json();

    health.textContent = data.aiConfigured
      ? `Backend en ligne · modèle ${data.model}`
      : "Backend en ligne · IA non configurée";
  } catch {
    health.textContent = "Backend non joignable";
  }
}

button.addEventListener("click", async () => {
  const text = input.value.trim();

  if (!text) {
    status.textContent = "Écris une situation avant de lancer l’analyse.";
    return;
  }

  button.disabled = true;
  result.hidden = true;
  status.textContent = "Analyse en cours…";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: text })
    });

    const data = await response.json();

    if (!response.ok) {
      status.textContent = data.message || "L’analyse a échoué.";

      if (data.fallback) {
        result.textContent = JSON.stringify(data.fallback, null, 2);
        result.hidden = false;
      }

      return;
    }

    status.textContent = `Analyse terminée · ${data.model}`;
    result.textContent = data.analysis;
    result.hidden = false;
  } catch {
    status.textContent =
      "Impossible de joindre le backend. Vérifie son URL et son état.";
  } finally {
    button.disabled = false;
  }
});

checkHealth();
