
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
let editingMessageId = null;

// Indicateur visible au-dessus de la zone de saisie.
const timerDisplay = document.createElement("div");
timerDisplay.id = "ariane-timer";
timerDisplay.textContent = "ARIANE est prête.";
Object.assign(timerDisplay.style, {
  display: "none",
  padding: "8px 16px",
  margin: "0 20px 8px",
  borderRadius: "10px",
  background: "#30343b",
  color: "#ffffff",
  fontSize: "14px",
  textAlign: "center"
});

chatForm.parentNode.insertBefore(timerDisplay, chatForm);

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
    status.textContent = "Impossible d’enregistrer l’historique sur cet appareil.";
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
      editingMessageId = null;
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
      if (!window.confirm(`Supprimer la conversation « ${conversation.title} » ?`)) return;

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

function makeActionButton(label, title, onClick, background = "#383d46") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  Object.assign(button.style, {
    display: "inline-block",
    padding: "8px 12px",
    margin: "6px 8px 4px 0",
    border: "1px solid #656b75",
    borderRadius: "8px",
    background,
    color: "#ffffff",
    fontSize: "14px",
    cursor: "pointer"
  });
  button.addEventListener("click", onClick);
  return button;
}

async function copyText(text, copyButton) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      Object.assign(area.style, {
        position: "fixed",
        opacity: "0"
      });
      document.body.append(area);
      area.select();
      const success = document.execCommand("copy");
      area.remove();
      if (!success) throw new Error("Copie impossible");
    }

    copyButton.textContent = "Copié !";
    window.setTimeout(() => {
      copyButton.textContent = "Copier";
    }, 1400);
  } catch {
    copyButton.textContent = "Copie impossible";
    window.setTimeout(() => {
      copyButton.textContent = "Copier";
    }, 1800);
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
    "Les messages précédents servent de contexte. Réponds au dernier message de l'utilisateur.",
    transcript || "(Début de la conversation.)",
    "NOUVEAU MESSAGE DE L'UTILISATEUR :",
    userMessage.content
  ].join("\n\n");
}

function findPreviousUserIndex(conversation, answerIndex) {
  for (let i = answerIndex - 1; i >= 0; i--) {
    if (conversation.messages[i].role === "user") return i;
  }
  return -1;
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
    row.className = `message ${message.role === "user" ? "user" : "assistant"}`;

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

    if (message.role === "user") {
      const lastUserIndex = conversation.messages.reduce(
        (last, item, i) => item.role === "user" ? i : last, -1
      );

      // Modifier le dernier message utilisateur.
      if (index === lastUserIndex) {
        const editButton = makeActionButton(
          "✎ Modifier",
          "Modifier ce message et relancer ARIANE",
          () => startEditing(conversation.id, message.id || index)
        );
        editButton.disabled = busy;
        body.append(editButton);
      }
    }

    if (message.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const copyButton = makeActionButton(
        "Copier",
        "Copier la réponse d’ARIANE",
        () => copyText(message.content, copyButton)
      );
      copyButton.className = "copy-response";
      actions.append(copyButton);

      const previousUserIndex = findPreviousUserIndex(conversation, index);

      if (previousUserIndex >= 0) {
        const retryButton = makeActionButton(
          "↻ Réessayer",
          "Relancer cette demande sans ajouter de message",
          () => retryAnswer(conversation.id, message, previousUserIndex),
          "#244a39"
        );
        retryButton.className = "retry-response";
        retryButton.disabled = busy;
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

function startEditing(conversationId, messageIdentifier) {
  if (busy) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  let index = typeof messageIdentifier === "number"
    ? messageIdentifier
    : conversation.messages.findIndex(m => m.id === messageIdentifier);

  if (index < 0 || conversation.messages[index]?.role !== "user") return;

  editingMessageId = conversation.messages[index].id || index;
  renderMessages();

  const message = conversation.messages[index];
  const userRows = [...messagesEl.querySelectorAll(".message.user")];
  const userMessageIndices = conversation.messages
    .map((m, i) => m.role === "user" ? i : -1)
    .filter(i => i >= 0);
  const position = userMessageIndices.indexOf(index);
  const row = userRows[position];
  if (!row) return;

  const body = row.querySelector(".message-body");
  const content = body.querySelector(".message-content");
  content.replaceChildren();

  const editor = document.createElement("textarea");
  editor.value = message.content;
  editor.setAttribute("aria-label", "Modifier le message utilisateur");
  Object.assign(editor.style, {
    display: "block",
    width: "100%",
    minHeight: "120px",
    boxSizing: "border-box",
    padding: "12px",
    borderRadius: "10px",
    background: "#17191d",
    color: "#ffffff",
    border: "1px solid #7c91b8",
    font: "inherit"
  });

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";

  const saveButton = makeActionButton(
    "Enregistrer et relancer",
    "Remplacer ce message et demander une nouvelle réponse",
    async () => {
      const corrected = editor.value.trim();
      if (!corrected || busy) return;

      // On conserve uniquement l'historique précédant le message modifié.
      const priorMessages = conversation.messages.slice(0, index);
      conversation.messages = priorMessages;

      const editedMessage = {
        role: "user",
        content: corrected,
        id: makeId(),
        createdAt: Date.now()
      };

      conversation.messages.push(editedMessage);
      conversation.updatedAt = Date.now();
      updateTitle(conversation);
      editingMessageId = null;

      saveConversations();
      renderHistory();
      renderMessages();

      const prompt = buildPrompt(
        conversation,
        conversation.messages.length - 1
      );
      await runPrompt(prompt, conversation);
    },
    "#244a39"
  );

  const cancelButton = makeActionButton(
    "Annuler",
    "Annuler la modification",
    () => {
      editingMessageId = null;
      renderMessages();
    }
  );

  controls.append(saveButton, cancelButton);
  content.append(editor, controls);
  editor.focus();
}

function updateTimer() {
  if (!busy || !requestStartedAt) return;

  const seconds = ((Date.now() - requestStartedAt) / 1000).toFixed(1);
  timerDisplay.style.display = "block";
  timerDisplay.textContent = `⏱ ARIANE réfléchit… ${seconds} s`;
  status.textContent = `⏱ ARIANE réfléchit… ${seconds} s`;
}

function startTimer() {
  stopTimer();
  requestStartedAt = Date.now();
  timerDisplay.style.display = "block";
  timerDisplay.textContent = "⏱ ARIANE démarre… 0,0 s";
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
        timerDisplay.textContent = "Nouvel essai automatique…";
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

      if (response.ok && data.analysis) return { data };

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
        !response.ok &&
        (response.status === 429 || response.status >= 500)
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
      status.textContent = `Échec après ${elapsed} s : ${result.error.message}`;
      timerDisplay.textContent = `Échec après ${elapsed} s. Tu peux réessayer.`;
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

    status.textContent = `Réponse reçue en ${elapsed} s · ${data.model || "ARIANE"}`;
    timerDisplay.textContent = `✓ Réponse reçue en ${elapsed} s`;
  } finally {
    stopTimer();
    setBusy(false);
    saveConversations();
    renderHistory();
    renderMessages();
    input.focus();
  }
}

async function retryAnswer(conversationId, answer, previousUserIndex) {
  if (busy) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const prompt = answer.retryInput || buildPrompt(conversation, previousUserIndex);
  await runPrompt(prompt, conversation, answer);
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
    id: makeId(),
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

  const prompt = buildPrompt(conversation, conversation.messages.length - 1);
  await runPrompt(prompt, conversation);
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
