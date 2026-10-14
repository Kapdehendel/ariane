
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

let conversations = loadConversations();
let activeId = null;
let busy = false;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(c =>
      c && typeof c.id === "string" &&
      Array.isArray(c.messages)
    ) : [];
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

      const confirmed = window.confirm(
        `Supprimer la conversation « ${conversation.title} » ?`
      );

      if (!confirmed) return;

      conversations = conversations.filter(c => c.id !== conversation.id);

      if (activeId === conversation.id) {
        activeId = null;
      }

      saveConversations();
      renderHistory();
      renderMessages();
      status.textContent = "Conversation supprimée.";
    });

    item.append(open, remove);
    historyList.append(item);
  }
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

  for (const message of conversation.messages) {
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
    // Affichage en texte brut : le contenu du modèle n'est pas interprété comme HTML.
    content.textContent = message.content;

    body.append(name, content);

    if (message.model && message.role === "assistant") {
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `Modèle : ${message.model}`;
      body.append(meta);
    }

    row.append(avatar, body);
    messagesEl.append(row);
  }

  requestAnimationFrame(() => {
    document.querySelector(".conversation")?.scrollTo({
      top: document.querySelector(".conversation").scrollHeight,
      behavior: "smooth"
    });
  });
}

function setBusy(value) {
  busy = value;
  button.disabled = value;
  input.disabled = value;
  newChatButton.disabled = value;

  renderHistory();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
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
  const userMessage = { role: "user", content: text.trim() };

  conversation.messages.push(userMessage);
  conversation.updatedAt = Date.now();
  updateTitle(conversation);

  saveConversations();
  renderHistory();
  renderMessages();

  input.value = "";
  resizeInput();
  status.textContent = "ARIANE réfléchit…";
  setBusy(true);

  try {
    // Transmet les derniers messages pour maintenir le contexte de la discussion.
    const previousMessages = conversation.messages.slice(0, -1).slice(-10);

    const transcript = previousMessages.map(message => {
      const speaker = message.role === "user" ? "Utilisateur" : "ARIANE";
      return `${speaker} :\n${message.content}`;
    }).join("\n\n");

    const fullInput = [
      "CONVERSATION ARIANE — CONTEXTE DES ÉCHANGES PRÉCÉDENTS",
      "Les messages ci-dessous servent de contexte. Réponds au dernier message de l'utilisateur.",
      transcript || "(Début de la conversation.)",
      "NOUVEAU MESSAGE DE L'UTILISATEUR :",
      userMessage.content
    ].join("\n\n");

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: fullInput })
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data.message || "L’analyse a échoué.";
      status.textContent = message;

      if (data.fallback) {
        conversation.messages.push({
          role: "assistant",
          content: typeof data.fallback === "string"
            ? data.fallback
            : JSON.stringify(data.fallback, null, 2)
        });
      }

      return;
    }

    conversation.messages.push({
      role: "assistant",
      content: data.analysis || "Aucune réponse n’a été renvoyée.",
      model: data.model || ""
    });

    conversation.updatedAt = Date.now();
    saveConversations();
    renderMessages();

    status.textContent = `Réponse reçue · ${data.model || "ARIANE"}`;
  } catch {
    status.textContent =
      "Impossible de joindre le backend. Vérifie que Render est en ligne.";
  } finally {
    setBusy(false);
    saveConversations();
    renderHistory();
    renderMessages();
    input.focus();
  }
}

chatForm.addEventListener("submit", event => {
  event.preventDefault();
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
