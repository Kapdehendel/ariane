
const health = document.querySelector("#health");
const input = document.querySelector("#input");
const button = document.querySelector("#analyze");
const status = document.querySelector("#status");
const messagesEl = document.querySelector("#messages");
const historyList = document.querySelector("#history-list");
const welcome = document.querySelector("#welcome");
const chatForm = document.querySelector("#chat-form");
const newChatButton = document.querySelector("#new-chat");
const toggleSidebar = document.querySelector("#toggle-sidebar");
const sidebar = document.querySelector("#sidebar");

const STORAGE_KEY = "ariane_conversations_v1";
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1200;

let conversations = loadConversations();
let activeId = null;
let busy = false;
let timerInterval = null;
let requestStartedAt = 0;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter(c =>
          c && typeof c.id === "string" && Array.isArray(c.messages)
        )
      : [];
  } catch {
    return [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    status.textContent =
      "Impossible d’enregistrer l’historique sur cet appareil.";
  }
}

function currentConversation() {
  return conversations.find(c => c.id === activeId) || null;
}

function createConversation() {
  if (busy) return;

  const conversation = {
    id: makeId(),
    title: "Nouvelle conversation",
    messages: [],
    updatedAt: Date.now()
  };

  conversations.unshift(conversation);
  activeId = conversation.id;

  saveConversations();
  renderHistory();
  renderMessages();

  status.textContent = "Nouvelle conversation";
  input.value = "";
  input.focus();
  sidebar.classList.remove("mobile-open");
}

function updateTitle(conversation) {
  const firstUserMessage = conversation.messages.find(
    message => message.role === "user"
  );

  if (firstUserMessage) {
    conversation.title =
      firstUserMessage.content.replace(/\s+/g, " ").trim().slice(0, 48) ||
      "Nouvelle conversation";
  }
}

function renderHistory() {
  historyList.replaceChildren();

  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Tes conversations apparaîtront ici.";
    historyList.append(empty);
    return;
  }

  for (const conversation of conversations) {
    const item = document.createElement("div");
    item.className = "history-item" +
      (conversation.id === activeId ? " active" : "");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-open";
    open.textContent = conversation.title || "Nouvelle conversation";
    open.title = open.textContent;
    open.disabled = busy;

    open.addEventListener("click", () => {
      if (busy) return;

      activeId = conversation.id;
      renderHistory();
      renderMessages();
      status.textContent = "";
      sidebar.classList.remove("mobile-open");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-delete";
    remove.textContent = "×";
    remove.title = "Supprimer cette conversation";
    remove.setAttribute("aria-label", `Supprimer ${open.textContent}`);
    remove.disabled = busy;

    remove.addEventListener("click", () => {
      if (busy) return;

      if (!window.confirm(
        `Supprimer la conversation « ${conversation.title} » ?`
      )) return;

      conversations = conversations.filter(c => c.id !== conversation.id);

      if (activeId === conversation.id) activeId = null;

      saveConversations();
      renderHistory();
      renderMessages();
      status.textContent = "Conversation supprimée.";
    });

    item.append(open, remove);
    historyList.append(item);
  }
}

function copyText(text, copyButton) {
  const originalLabel = "Copier";

  function showCopied() {
    copyButton.textContent = "Copié !";
    window.setTimeout(() => {
      copyButton.textContent = originalLabel;
    }, 1400);
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(showCopied)
      .catch(() => fallbackCopy(text, copyButton, showCopied));
  } else {
    fallbackCopy(text, copyButton, showCopied);
  }
}

function fallbackCopy(text, copyButton, onSuccess) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.setAttribute("readonly", "");
  document.body.append(area);
  area.select();

  try {
    if (document.execCommand("copy")) {
      onSuccess();
    } else {
      copyButton.textContent = "Copie impossible";
      window.setTimeout(() => {
        copyButton.textContent = "Copier";
      }, 1800);
    }
  } catch {
    copyButton.textContent = "Copie impossible";
    window.setTimeout(() => {
      copyButton.textContent = "Copier";
    }, 1800);
  } finally {
    area.remove();
  }
}

function buildPrompt(conversation, userIndex) {
  const userMessage = conversation.messages[userIndex];
  const previousMessages = conversation.messages
    .slice(0, userIndex)
    .slice(-10);

  const transcript = previousMessages.map(message => {
    const speaker = message.role === "user" ? "Utilisateur" : "ARIANE";
    return `${speaker} :\n${message.content}`;
  }).join("\n\n");

  return [
    "CONVERSATION ARIANE — CONTEXTE DES ÉCHANGES PRÉCÉDENTS",
    "Les messages ci-dessous servent de contexte. Réponds au dernier message de l'utilisateur.",
    transcript || "(Début de la conversation.)",
    "NOUVEAU MESSAGE DE L'UTILISATEUR :",
    userMessage.content
  ].join("\n\n");
}

function findPromptForAnswer(conversation, answerIndex, answer) {
  if (answer.retryInput) return answer.retryInput;

  for (let i = answerIndex - 1; i >= 0; i--) {
    if (conversation.messages[i].role === "user") {
      return buildPrompt(conversation, i);
    }
  }

  return null;
}

function renderMessages() {
  messagesEl.replaceChildren();

  const conversation = currentConversation();
  const hasMessages = Boolean(conversation?.messages.length);

  welcome.classList.toggle("hidden", hasMessages);

  if (!conversation) {
    welcome.classList.remove("hidden");
    return;
  }

  conversation.messages.forEach((message, index) => {
    const row = document.createElement("article");
    row.className =
      `message ${message.role === "user" ? "user" : "assistant"}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = message.role === "user" ? "T" : "A";
    avatar.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "message-body";

    const name = document.createElement("div");
    name.className = "message-name";
    name.textContent = message.role === "user" ? "Toi" : "ARIANE";

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content;

    body.append(name, content);

    if (message.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-response";
      copyButton.textContent = "Copier";
      copyButton.title = "Copier la réponse d’ARIANE";
      copyButton.addEventListener("click", () => {
        copyText(message.content, copyButton);
      });
      actions.append(copyButton);

      const retryPrompt = findPromptForAnswer(
        conversation, index, message
      );

      if (retryPrompt) {
        const retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.className = "retry-response";
        retryButton.textContent = "↻ Réessayer";
        retryButton.title = "Demander une nouvelle réponse au même prompt";
        retryButton.disabled = busy;

        retryButton.addEventListener("click", () => {
          retryAnswer(conversation.id, message, retryPrompt);
        });

        actions.append(retryButton);
      }

      body.append(actions);
    }

    if (message.model && message.role === "assistant") {
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `Modèle : ${message.model}`;
      body.append(meta);
    }

    row.append(avatar, body);
    messagesEl.append(row);
  });

  requestAnimationFrame(() => {
    const panel = document.querySelector(".conversation");
    if (panel) {
      panel.scrollTo({
        top: panel.scrollHeight,
        behavior: "smooth"
      });
    }
  });
}

function updateTimer() {
  if (!busy || !requestStartedAt) return;

  const seconds = ((Date.now() - requestStartedAt) / 1000).toFixed(1);
  status.textContent = `⏱ ARIANE réfléchit… ${seconds} s`;
}

function startTimer() {
  stopTimer();
  requestStartedAt = Date.now();
  updateTimer();
  timerInterval = window.setInterval(updateTimer, 100);
}

function stopTimer() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setBusy(value) {
  busy = value;
  button.disabled = value;
  input.disabled = value;
  newChatButton.disabled = value;
  renderHistory();
  renderMessages();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function requestAnalysis(fullInput) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        status.textContent = "Nouvel essai automatique…";
        await delay(RETRY_DELAY_MS);
        updateTimer();
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: fullInput })
      });

      const raw = await response.text();
      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { message: "Le serveur a renvoyé une réponse illisible." };
      }

      if (response.ok && data.analysis) {
        return { data };
      }

      const error = new Error(
        data.message ||
        (response.ok
          ? "Le serveur n’a renvoyé aucune analyse."
          : `Erreur du serveur (${response.status}).`)
      );

      error.status = response.status;
      error.data = data;

      if (
        attempt < MAX_RETRIES &&
        (!response.ok &&
          (response.status === 429 || response.status >= 500))
      ) {
        lastError = error;
        continue;
      }

      return { error, data };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) continue;
    }
  }

  return {
    error: lastError || new Error("La requête a échoué."),
    data: lastError?.data || {}
  };
}

async function runPrompt(fullInput, conversation, answerToReplace = null) {
  if (busy) return;

  setBusy(true);
  startTimer();

  try {
    const result = await requestAnalysis(fullInput);
    const elapsed = ((Date.now() - requestStartedAt) / 1000).toFixed(1);

    if (result.error) {
      const errorMessage = result.error.message ||
        "La requête a échoué après la nouvelle tentative.";

      status.textContent =
        `Échec après ${elapsed} s : ${errorMessage}`;
      return;
    }

    const data = result.data;
    const newContent = data.analysis || "Aucune réponse n’a été renvoyée.";

    if (answerToReplace) {
      answerToReplace.content = newContent;
      answerToReplace.model = data.model || "";
      answerToReplace.retryInput = fullInput;
      answerToReplace.updatedAt = Date.now();
    } else {
      conversation.messages.push({
        role: "assistant",
        content: newContent,
        model: data.model || "",
        retryInput: fullInput,
        updatedAt: Date.now()
      });
    }

    conversation.updatedAt = Date.now();
    saveConversations();
    renderMessages();

    status.textContent =
      `Réponse reçue en ${elapsed} s · ${data.model || "ARIANE"}`;
  } finally {
    stopTimer();
    setBusy(false);
    saveConversations();
    renderHistory();
    renderMessages();
    input.focus();
  }
}

async function retryAnswer(conversationId, answer, fullInput) {
  if (busy) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  status.textContent = "Relance de la même demande…";
  await runPrompt(fullInput, conversation, answer);
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;

  if (!currentConversation()) {
    const conversation = {
      id: makeId(),
      title: "Nouvelle conversation",
      messages: [],
      updatedAt: Date.now()
    };

    conversations.unshift(conversation);
    activeId = conversation.id;
  }

  const conversation = currentConversation();
  const userMessage = {
    role: "user",
    content: text.trim(),
    createdAt: Date.now()
  };

  conversation.messages.push(userMessage);
  conversation.updatedAt = Date.now();
  updateTitle(conversation);

  saveConversations();
  renderHistory();
  renderMessages();

  input.value = "";
  resizeInput();

  const userIndex = conversation.messages.length - 1;
  const fullInput = buildPrompt(conversation, userIndex);

  await runPrompt(fullInput, conversation);
}

chatForm.addEventListener("submit", event => {
  event.preventDefault();
  if (busy) return;
  sendMessage(input.value);
});

newChatButton.addEventListener("click", createConversation);

toggleSidebar.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 760px)").matches) {
    sidebar.classList.toggle("mobile-open");
  } else {
    sidebar.classList.toggle("collapsed");
  }
});

document.querySelectorAll(".suggestion").forEach(suggestion => {
  suggestion.addEventListener("click", () => {
    input.value = suggestion.dataset.prompt || "";
    resizeInput();
    input.focus();
  });
});

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

async function checkHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new Error("Backend indisponible");

    const data = await response.json();
    health.textContent = data.aiConfigured
      ? `Backend en ligne · modèle ${data.model}`
      : "Backend en ligne · IA non configurée";
  } catch {
    health.textContent = "Backend non joignable";
  }
}

renderHistory();
renderMessages();
checkHealth();
