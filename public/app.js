
const SUPABASE_URL = "https://spnlejufigfwjetspthx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RjUuJ6usQ__YGdzgwnF5wg_z8b81nEX";

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

const loginButton = document.querySelector("#google-login");
const logoutButton = document.querySelector("#google-logout");
const signedOutPanel = document.querySelector("#auth-signed-out");
const signedInPanel = document.querySelector("#auth-signed-in");
const authStatus = document.querySelector("#auth-status");
const userEmail = document.querySelector("#user-email");
const quotaDisplay = document.querySelector("#quota");

const STORAGE_KEY = "ariane_conversations_v1";

let conversations = loadConversations();
let activeId = null;
let busy = false;
let timerInterval = null;
let requestStartedAt = 0;
let supabase = null;
let session = null;
let authReady = false;
let remainingMessages = null;

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
    status.textContent =
      "Impossible d’enregistrer l’historique sur cet appareil.";
  }
}

function currentConversation() {
  return conversations.find(c => c.id === activeId) || null;
}

function updateAccountUI() {
  const loggedIn = Boolean(session?.access_token);

  signedOutPanel.hidden = loggedIn;
  signedInPanel.hidden = !loggedIn;

  input.disabled = !loggedIn || busy || remainingMessages === 0;
  button.disabled = !loggedIn || busy || remainingMessages === 0;
  newChatButton.disabled = busy;

  if (loggedIn) {
    userEmail.textContent = session.user?.email || "Compte connecté";

    quotaDisplay.textContent =
      remainingMessages === null
        ? "Messages restants : vérification…"
        : `Messages restants : ${remainingMessages}/5`;

    if (remainingMessages === 0) {
      status.textContent = "Limite quotidienne atteinte. Reviens demain.";
    }
  } else if (authReady) {
    userEmail.textContent = "";
    quotaDisplay.textContent = "Messages restants : —/5";
    remainingMessages = null;
    status.textContent = "Connecte-toi pour commencer.";
  }

  renderHistory();
}

function updateQuota(data) {
  if (Number.isInteger(data?.remaining)) {
    remainingMessages = Math.max(0, Math.min(5, data.remaining));
    updateAccountUI();
  }
}

async function refreshSession() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    session = data.session;
    authReady = true;
    updateAccountUI();
  } catch (error) {
    console.error("Session Supabase indisponible:", error.message);
    session = null;
    authReady = true;
    updateAccountUI();
    authStatus.textContent =
      "Impossible de vérifier la session. Recharge la page ou reconnecte-toi.";
  }
}

async function signInWithGoogle() {
  if (!supabase) {
    authStatus.textContent = "La configuration Supabase est incomplète.";
    return;
  }

  loginButton.disabled = true;
  authStatus.textContent = "Ouverture de la connexion Google…";

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) throw error;
  } catch (error) {
    authStatus.textContent =
      `Connexion impossible : ${error.message || "erreur Supabase"}`;
    loginButton.disabled = false;
  }
}

async function signOut() {
  if (!supabase) return;

  logoutButton.disabled = true;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    session = null;
    remainingMessages = null;
    authStatus.textContent = "Déconnexion effectuée.";
    updateAccountUI();
  } catch (error) {
    authStatus.textContent =
      `Déconnexion impossible : ${error.message || "erreur Supabase"}`;
  } finally {
    logoutButton.disabled = false;
  }
}

async function initializeAuth() {
  if (
    !window.supabase ||
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_PUBLISHABLE_KEY.startsWith("COLLE_ICI_") ||
    !SUPABASE_PUBLISHABLE_KEY
  ) {
    authReady = true;
    session = null;
    updateAccountUI();
    authStatus.textContent =
      "Configuration Supabase manquante dans public/app.js.";
    return;
  }

  try {
    supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      authReady = true;
      updateAccountUI();

      authStatus.textContent = session
        ? "Compte Google connecté."
        : "Tu n’es pas connecté.";
    });

    await refreshSession();
  } catch (error) {
    authReady = true;
    session = null;
    updateAccountUI();
    authStatus.textContent =
      `Initialisation Supabase impossible : ${error.message}`;
  }
}

function createConversation() {
  if (busy || !session) return;

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
        retry.disabled = busy || !session || remainingMessages === 0;
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
  if (busy || !session) return;

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

      conversation.messages = conversation.messages.slice(0, index);
      conversation.messages.push({
        role: "user",
        content: corrected,
        id: makeId(),
        createdAt: Date.now()
      });

      conversation.updatedAt = Date.now();
      updateTitle(conversation);
      saveConversations();
      renderHistory();
      renderMessages();

      await runPrompt(
        buildPrompt(conversation, conversation.messages.length - 1),
        conversation
      );
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
  updateAccountUI();
  renderHistory();
  renderMessages();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
}

async function requestAnalysis(fullInput) {
  if (!supabase || !session?.access_token) {
    return {
      error: new Error("Connecte-toi avec Google avant d’envoyer un message."),
      data: { error: "AUTH_REQUIRED" }
    };
  }

  try {
    // Une seule requête par tentative explicite :
    // éviter de consommer plusieurs messages du quota sur un retry automatique.
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ input: fullInput })
    });

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: "Le serveur a renvoyé une réponse illisible." };
    }

    if (Number.isInteger(data.remaining)) {
      updateQuota(data);
    }

    if (response.ok && data.analysis) {
      return { data };
    }

    if (
      response.status === 401 &&
      supabase
    ) {
      session = null;
      remainingMessages = null;
      await refreshSession();
    }

    return {
      error: new Error(
        data.message || `Erreur du serveur (${response.status}).`
      ),
      data,
      status: response.status
    };
  } catch (error) {
    return {
      error: new Error(
        error.message || "Impossible de joindre le serveur ARIANE."
      ),
      data: {}
    };
  }
}

async function runPrompt(fullInput, conversation, answerToReplace = null) {
  if (busy || !session?.access_token) {
    status.textContent = "Connecte-toi avec Google pour utiliser ARIANE.";
    return;
  }

  if (remainingMessages === 0) {
    status.textContent = "Tu as utilisé tes cinq messages pour aujourd’hui.";
    updateAccountUI();
    return;
  }

  setBusy(true);
  startTimer();

  try {
    const result = await requestAnalysis(fullInput);
    const elapsed = ((Date.now() - requestStartedAt) / 1000).toFixed(1);

    if (result.error) {
      status.textContent = result.error.message;

      if (result.data?.error === "DAILY_LIMIT_REACHED") {
        remainingMessages = 0;
        updateAccountUI();
      }

      timerDisplay.textContent = `Échec après ${elapsed} s.`;
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

    status.textContent =
      `Réponse reçue en ${elapsed} s · ${data.model || "ARIANE"}`;

    timerDisplay.textContent = `✓ Réponse reçue en ${elapsed} s`;
  } finally {
    stopTimer();
    setBusy(false);
    saveConversations();
    renderHistory();
    renderMessages();

    if (session && remainingMessages !== 0) input.focus();
  }
}

async function retryAnswer(conversationId, answer, userIndex) {
  if (busy || !session || remainingMessages === 0) return;

  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const prompt = answer.retryInput || buildPrompt(conversation, userIndex);
  await runPrompt(prompt, conversation, answer);
}

async function sendMessage(text) {
  if (busy || !session || !text.trim()) return;

  if (remainingMessages === 0) {
    status.textContent = "Tu as utilisé tes cinq messages pour aujourd’hui.";
    return;
  }

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

  await runPrompt(
    buildPrompt(conversation, conversation.messages.length - 1),
    conversation
  );
}

chatForm.addEventListener("submit", event => {
  event.preventDefault();

  if (busy) return;

  if (!session) {
    authStatus.textContent = "Connecte-toi avec Google pour commencer.";
    return;
  }

  sendMessage(input.value);
});

loginButton?.addEventListener("click", signInWithGoogle);
logoutButton?.addEventListener("click", signOut);
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
    if (!session) {
      authStatus.textContent = "Connecte-toi avec Google pour commencer.";
      return;
    }

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

    if (!data.authConfigured || !data.quotaConfigured) {
      health.textContent = "Backend en ligne · configuration à vérifier";
    }
  } catch {
    health.textContent = "Backend non joignable";
  }
}

renderHistory();
renderMessages();
checkHealth();
initializeAuth();
