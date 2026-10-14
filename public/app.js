
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

const timerDisplay = document.createElement("div");
timerDisplay.id = "ariane-timer";
Object.assign(timerDisplay.style, {
  display: "none",
  padding: "9px 14px",
  margin: "8px 12px",
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
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  Object.assign(b.style, {
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
  b.addEventListener("click", onClick);
  return b;
}

async function copyText(text, b) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      Object.assign(area.style, { position: "fixed", opacity: "0" });
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("Copie impossible");
    }

    b.textContent = "Copié !";
    window.setTimeout(() => b.textContent = "Copier", 1400);
  } catch {
    b.textContent = "Copie impossible";
    window.setTimeout(() => b.textContent = "Copier", 1800);
  }
}

function buildPrompt(conversation, userIndex) {
  const userMessage = conversation.messages[userIndex];
  const previousMessages = conversation.messages.slice(0, userIndex).slice(-10);

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

function lastUserMessageIndex(conversation) {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    if (conversation.messages[i].role === "user") return i;
  }
  return -1;
}

function previousUserIndex(conversation, answerIndex) {
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

  const lastUserIndex = lastUserMessageIndex(conversation);

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

    // Bouton Modifier : ajouté directement sous le dernier message utilisateur.
    if (message.role === "user" && index === lastUserIndex) {
      const edit = makeActionButton(
        "✎ Modifier",
        "Modifier ton dernier message",
        () => editLastMessage(conversation.id),
        "#244a39"
      );
      edit.disabled = busy;
      body.append(edit);
    }

    if (message.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const copy = makeActionButton(
        "Copier",
        "Copier la réponse d’ARIANE",
        () => copyText(message.content, copy)
      );
      copy.className = "copy-response";
      actions.append(copy);

      const userIndex = previousUserIndex(conversation, index);
      if (userIndex >= 0) {
        const retry = makeActionButton(
          "↻ Réessayer",
          "Demander une nouvelle réponse au même prompt",
          () => retryAnswer(conversation.id, message, userIndex),
          "#244a39"
        );
        retry.className = "retry-response";
        retry.disabled = busy;
        actions.append(retry);
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

function editLastMessage(conversationId) {
  if (busy) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const index = lastUserMessageIndex(conversation);
  if (index < 0) return;

  const message = conversation.messages[index];
  const row = [...messagesEl.querySelectorAll(".message.user")].at(-1);
  if (!row) {
    status.textContent = "Impossible d’ouvrir l’éditeur de ce message.";
    return;
  }

  const body = row.querySelector(".message-body");
  body.replaceChildren();

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = "Modifier ton message";

  const editor = document.createElement("textarea");
  editor.value = message.content;
  editor.setAttribute("aria-label", "Modifier le dernier message");
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

  const save = makeActionButton(
    "Enregistrer et relancer",
    "Enregistrer le texte corrigé et demander une nouvelle réponse",
    async () => {
      const corrected = editor.value.trim();
      if (!corrected || busy) return;

      // Supprime l'ancien message et les réponses qui en dépendent.
      conversation.messages = conversation.messages.slice(0, index);
      const editedMessage = {
        role: "user",
        content: corrected,
        id: makeId(),
        createdAt: Date.now()
      };
      conversation.messages.push(editedMessage);

      conversation.updatedAt = Date.now();
      updateTitle(conversation);
      saveConversations();
      renderHistory();
      renderMessages();

      const prompt = buildPrompt(conversation, conversation.messages.length - 1);
      await runPrompt(prompt, conversation);
    },
    "#244a39"
  );

  const cancel = makeActionButton(
    "Annuler",
    "Annuler la modification",
    () => renderMessages()
  );

  controls.append(save, cancel);
  body.append(name, editor, controls);
  editor.focus();
}

function updateTimer() {
  if (!busy || !requestStartedAt) return;

  const seconds = ((Date.now() - requestStartedAt) / 1000).toFixed(1);
  timerDisplay.style.display = "block";
  timerDisplay.textContent = `⏱ ARIANE réfléchit… ${seconds} s`;
  status.textContent = timerDisplay.textContent;
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
    const content = data.analysis || "Aucune réponse n’a été renvoyée.";

    if (answerToReplace) {
      answerToReplace.content = content;
      answerToReplace.model = data.model || "";
      answerToReplace.retryInput = fullInput;
      answerToReplace.updatedAt = Date.now();
    } else {
      conversation.messages.push({
        role: "assistant",
        content,
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

async function retryAnswer(conversationId, answer, userIndex) {
  if (busy) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const prompt = answer.retryInput || buildPrompt(conversation, userIndex);
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
  conversation.messages.push({
    role: "user",
    content: text.trim(),
    id: makeId(),
    createdAt: Date.now()
  });

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
