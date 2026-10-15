"use strict";

import { createClient } from "@supabase/supabase-js";

/* ARIANE — ARI v1.2 · IOB v1.0 · IFH-TEC */

const SUPABASE_URL = "https://spnlejufigfwjetspthx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
"sb_publishable_RjUuJ6usQ__YGdzgwnF5wg_z8b81nEX";

const DAILY_MESSAGE_LIMIT = 5;
const STORAGE_KEY = "ariane_conversations_v1";
const REQUEST_TIMEOUT_MS = 60000;

const  ("#health");
const input = latex
("#input"); const analyzeButton = 

("#analyze");
const status = latex
("#status"); const messagesEl = 

("#messages");
const historyList = latex
("#history-list"); const welcome = 

("#welcome");
const chatForm = latex
("#chat-form"); const newChatButton = 

("#new-chat");
const toggleSidebar = latex
("#toggle-sidebar"); const sidebar = 

("#sidebar");
const loginButton = latex
("#google-login"); const logoutButton = 

("#google-logout");
const signedOutPanel = latex
("#auth-signed-out"); const signedInPanel = 

("#auth-signed-in");
const authStatus = latex
("#auth-status"); const userEmail = 

("#user-email");
const quotaDisplay = $`("#quota");

let conversations = loadConversations();
let activeId = null;
let busy = false;
let timerInterval = null;
let requestStartedAt = 0;
let supabase = null;
let session = null;
let authReady = false;
let remainingMessages = null;
let authSubscription = null;

const timerDisplay = document.createElement("div");
timerDisplay.id = "ariane-timer";
Object.assign(timerDisplay.style, {
display: "none",
padding: "9px 14px",
margin: "8px 12px",
borderRadius: "10px",
background: "#30343b",
color: "#fff",
fontSize: "14px",
textAlign: "center"
});

if (chatForm?.parentNode) {
chatForm.parentNode.insertBefore(timerDisplay, chatForm);
}

function makeId() {
return globalThis.crypto?.randomUUID?.() ||
``${Date.now()}-${Math.random().toString(36).slice(2)};
}

function setText(element, value) {
if (element) element.textContent = value;
}

function loadConversations() {
try {
const saved = JSON.parse(
localStorage.getItem(STORAGE_KEY) || "[]"
);

if (!Array.isArray(saved)) return [];

return saved.filter(item =>
item &&
typeof item.id === "string" &&
Array.isArray(item.messages)
);
} catch (error) {
console.warn("Historique local indisponible :", error);
return [];
}
}

function saveConversations() {
try {
localStorage.setItem(
STORAGE_KEY,
JSON.stringify(conversations)
);
} catch (error) {
console.error("Sauvegarde impossible :", error);
setText(
status,
"Impossible d’enregistrer l’historique sur cet appareil."
);
}
}

function currentConversation() {
return conversations.find(item => item.id === activeId) || null;
}

function updateQuota(data) {
if (!Number.isInteger(data?.remaining)) return;

remainingMessages = Math.max(
0,
Math.min(DAILY_MESSAGE_LIMIT, data.remaining)
);

updateAccountUI();
}

function updateAccountUI() {
const loggedIn = Boolean(session?.access_token);

if (signedOutPanel) signedOutPanel.hidden = loggedIn;
if (signedInPanel) signedInPanel.hidden = !loggedIn;

if (input) {
input.disabled = !loggedIn || busy || remainingMessages === 0;
}

if (analyzeButton) {
analyzeButton.disabled = !loggedIn || busy || remainingMessages === 0;
}

if (newChatButton) newChatButton.disabled = !loggedIn || busy;
if (loginButton) loginButton.disabled = busy && !loggedIn;

if (loggedIn) {
setText(userEmail, session.user?.email || "Compte connecté.");

setText(
quotaDisplay,
remainingMessages === null
? "Messages restants : vérification…"
: Messages restants :${remainingMessages}/${DAILY_MESSAGE_LIMIT}
);

if (remainingMessages === 0) {
setText(status, "Limite quotidienne atteinte. Reviens demain.");
}
} else if (authReady) {
setText(userEmail, "");
setText(
quotaDisplay,
Messages restants : —/${DAILY_MESSAGE_LIMIT}`
);
}

renderHistory();
}

/* AUTHENTIFICATION SUPABASE */

function createSupabaseClient() {
if (!SUPABASE_URL.startsWith("https://")) {
throw new Error("L'URL Supabase est invalide.");
}

if (!SUPABASE_PUBLISHABLE_KEY) {
throw new Error("La clé publique Supabase est absente.");
}

return createClient(
SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY,
{
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: false,
flowType: "pkce"
}
}
);
}

async function refreshSession() {
if (!supabase) {
throw new Error("Le client Supabase n'est pas initialisé.");
}

let timeoutId;

try {
const result = await Promise.race([
supabase.auth.getSession(),
new Promise((_, reject) => {
timeoutId = window.setTimeout(
() => reject(
new Error("Supabase ne répond pas après 10 secondes.")
),
10000
);
})
 ]);

if (result.error) throw result.error;

session = result.data?.session || null;
authReady = true;

updateAccountUI();

setText(
authStatus,
session
? "Compte Google connecté."
: "Connecte-toi avec Google pour commencer."
);
} finally {
window.clearTimeout(timeoutId);
}
}

async function initializeAuth() {
authReady = false;
setText(authStatus, "Initialisation de la connexion…");

try {
supabase = createSupabaseClient();

const url = new URL(window.location.href);
const code = url.searchParams.get("code");

if (code) {
setText(
authStatus,
"Finalisation de la connexion Google…"
);

const { data, error } =
await supabase.auth.exchangeCodeForSession(code);

if (error) throw error;

session = data?.session || null;

url.searchParams.delete("code");

window.history.replaceState(
{},
document.title,
${url.pathname}${url.search}${url.hash}`
);
} else if (url.searchParams.has("error")) {
const description =
url.searchParams.get("error_description") ||
url.searchParams.get("error");

throw new Error(
Google a refusé la connexion :${description}`
);
}

if (authSubscription?.unsubscribe) {
authSubscription.unsubscribe();
}

const result = supabase.auth.onAuthStateChange(
(event, newSession) => {
session = newSession || null;
authReady = true;

if (
event === "SIGNED_OUT" ||
(event === "INITIAL_SESSION" && !newSession)
) {
remainingMessages = null;
}

updateAccountUI();

if (event === "SIGNED_IN") {
setText(authStatus, "Compte Google connecté.");
} else if (event === "SIGNED_OUT") {
setText(authStatus, "Tu n'es pas connecté.");
renderMessages();
} else if (event === "TOKEN_REFRESHED") {
setText(authStatus, "Session actualisée.");
}
}
);

authSubscription = result.data.subscription;
await refreshSession();

} catch (error) {
console.error("Initialisation Supabase impossible :", error);

supabase = null;
session = null;
authReady = true;

updateAccountUI();

setText(
authStatus,
Connexion non finalisée : ${ error.message || "erreur inconnue" }. Relance une connexion Google.
);
}
}

/* CONNEXION ET DÉCONNEXION GOOGLE */

async function signInWithGoogle() {
if (!supabase) {
setText(
authStatus,
"Supabase n'est pas initialisé. Recharge la page."
);
return;
}

if (loginButton) loginButton.disabled = true;

setText(authStatus, "Ouverture de la connexion Google…");

try {
const { error } = await supabase.auth.signInWithOAuth({
provider: "google",
options: {
redirectTo: window.location.origin
}
});

if (error) throw error;

} catch (error) {
console.error("Connexion Google impossible :", error);

setText(
authStatus,
Connexion impossible : ${error.message || "erreur Supabase"}`
);

if (loginButton) loginButton.disabled = false;
}
}

async function signOut() {
if (!supabase) return;

if (logoutButton) logoutButton.disabled = true;

try {
const { error } = await supabase.auth.signOut();

if (error) throw error;

session = null;
remainingMessages = null;

setText(authStatus, "Déconnexion effectuée.");

updateAccountUI();
renderMessages();

} catch (error) {
console.error("Déconnexion impossible :", error);

setText(
authStatus,
Déconnexion impossible :${error.message || "erreur Supabase"}`
);

} finally {
if (logoutButton) logoutButton.disabled = false;
}
}

/* GESTION DES CONVERSATIONS */

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

setText(status, "Nouvelle conversation");

if (input) {
input.value = "";
input.focus();
}

sidebar?.classList.remove("mobile-open");
}

function updateTitle(conversation) {
const first = conversation.messages.find(
message => message.role === "user"
);

if (!first) return;

conversation.title =
first.content.replace(/\s+/g, " ").trim().slice(0, 48) ||
"Nouvelle conversation";
}

function renderHistory() {
if (!historyList) return;

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

item.className =
"history-item" +
(conversation.id === activeId ? " active" : "");

const open = document.createElement("button");
open.type = "button";
open.className = "history-open";
open.textContent =
conversation.title || "Nouvelle conversation";
open.title = open.textContent;
open.disabled = busy;

open.addEventListener("click", () => {
if (busy) return;

activeId = conversation.id;

renderHistory();
renderMessages();

setText(status, "");
sidebar?.classList.remove("mobile-open");
});

const remove = document.createElement("button");
remove.type = "button";
remove.className = "history-delete";
remove.textContent = "×";
remove.title = "Supprimer cette conversation";

remove.setAttribute(
"aria-label",
Supprimer ${open.textContent}`
);

remove.disabled = busy;

remove.addEventListener("click", () => {
if (busy) return;

const confirmed = window.confirm(
Supprimer la conversation «${conversation.title} » ?`
);

if (!confirmed) return;

conversations = conversations.filter(
item => item.id !== conversation.id
);

if (activeId === conversation.id) {
activeId = null;
}

saveConversations();
renderHistory();
renderMessages();

setText(status, "Conversation supprimée.");
});

item.append(open, remove);
historyList.append(item);
}
}

/* BOUTONS D'ACTION */

function makeActionButton(
label,
title,
onClick,
background = "#383d46"
) {
const element = document.createElement("button");

element.type = "button";
element.textContent = label;
element.title = title;

Object.assign(element.style, {
display: "inline-block",
padding: "8px 12px",
margin: "6px 8px 4px 0",
border: "1px solid #656b75",
borderRadius: "8px",
background,
color: "#fff",
fontSize: "14px",
cursor: "pointer"
});

element.addEventListener("click", onClick);

return element;
}

async function copyText(text, element) {
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

const copied = document.execCommand("copy");
area.remove();

if (!copied) {
throw new Error("Copie impossible.");
}
}

element.textContent = "Copié !";

window.setTimeout(() => {
element.textContent = "Copier";
}, 1400);

} catch (error) {
console.error("Copie impossible :", error);

element.textContent = "Copie impossible";

window.setTimeout(() => {
element.textContent = "Copier";
}, 1800);
}
}

/* CONSTRUCTION DU PROMPT */

function buildPrompt(conversation, userIndex) {
const userMessage = conversation.messages[userIndex];

const previousMessages = conversation.messages
.slice(0, userIndex)
.slice(-10);

const transcript = previousMessages.map(message => {
const speaker =
message.role === "user" ? "Utilisateur" : "ARIANE";

return ${speaker} :\n${message.content};
}).join("\n\n");

return [
"ARIANE — CONTEXTE DES ÉCHANGES PRÉCÉDENTS",
"Réponds au dernier message en tenant compte du contexte.",
transcript || "(Début de la conversation.)",
"NOUVEAU MESSAGE DE L'UTILISATEUR :",
userMessage.content
 ].join("\n\n");
}

function lastUserMessageIndex(conversation) {
for (let i = conversation.messages.length - 1; i >= 0; i--) {
if (conversation.messages[i].role === "user") {
return i;
}
}

return -1;
}

function previousUserIndex(conversation, answerIndex) {
for (let i = answerIndex - 1; i >= 0; i--) {
if (conversation.messages[i].role === "user") {
return i;
}
}

return -1;
}



/* AFFICHAGE DES MESSAGES */

function renderMessages() {
if (!messagesEl || !welcome) return;

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
row.className =
message ${message.role === "user" ? "user" : "assistant"}`;

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
"Demander une nouvelle réponse",
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
meta.textContent = Modèle :${message.model}`;
body.append(meta);
}

row.append(avatar, body);
messagesEl.append(row);
});

window.requestAnimationFrame(() => {
const panel = document.querySelector(".conversation");

panel?.scrollTo({
top: panel.scrollHeight,
behavior: "smooth"
});
});
}

/* MODIFIER LE DERNIER MESSAGE */

function editLastMessage(conversationId) {
if (busy || !session) return;

const conversation = conversations.find(
item => item.id === conversationId
);

if (!conversation) return;

const index = lastUserMessageIndex(conversation);
if (index < 0) return;

const rows = messagesEl?.querySelectorAll(".message.user") || [];
const row = rows[rows.length - 1];

if (!row) {
setText(status, "Impossible d’ouvrir l’éditeur.");
return;
}

const body = row.querySelector(".message-body");
if (!body) return;

body.replaceChildren();

const name = document.createElement("div");
name.className = "message-name";
name.textContent = "Modifier ton message";

const editor = document.createElement("textarea");
editor.value = conversation.messages[index].content;
editor.setAttribute("aria-label", "Modifier le dernier message");

Object.assign(editor.style, {
display: "block",
width: "100%",
minHeight: "120px",
boxSizing: "border-box",
padding: "12px",
borderRadius: "10px",
background: "#17191d",
color: "#fff",
border: "1px solid #7c91b8",
font: "inherit"
});

const controls = document.createElement("div");
controls.style.display = "flex";
controls.style.flexWrap = "wrap";

const save = makeActionButton(
"Enregistrer et relancer",
"Enregistrer et relancer l'analyse",
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

/* MINUTERIE */

function updateTimer() {
if (!busy || !requestStartedAt) return;

const seconds =
((Date.now() - requestStartedAt) / 1000).toFixed(1);

timerDisplay.style.display = "block";
timerDisplay.textContent = ⏱ ARIANE réfléchit… ${seconds} s`;
setText(status, timerDisplay.textContent);
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
if (!input) return;

input.style.height = "auto";
input.style.height =
``${Math.min(input.scrollHeight, 200)}px`;
}

/* APPEL DU BACKEND */

async function requestAnalysis(fullInput) {
if (!supabase || !session?.access_token) {
return {
error: new Error(
"Connecte-toi avec Google avant d’envoyer un message."
),
data: { error: "AUTH_REQUIRED" }
};
}

const controller = new AbortController();

const timeout = window.setTimeout(
() => controller.abort(),
REQUEST_TIMEOUT_MS
);

try {
const response = await fetch("/api/analyze", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: Bearer ${session.access_token}`
},
body: JSON.stringify({ input: fullInput }),
signal: controller.signal
});

const raw = await response.text();
let data = {};

try {
data = raw ? JSON.parse(raw) : {};
} catch {
data = {
message: "Le serveur a renvoyé une réponse illisible."
};
}

if (Number.isInteger(data.remaining)) {
updateQuota(data);
}

if (response.ok && data.analysis) {
return { data };
}

if (response.status === 401) {
session = null;
remainingMessages = null;
await refreshSession().catch(() => {});
}

return {
error: new Error(
data.message || Erreur du serveur (${response.status}).`
),
data,
status: response.status
};

} catch (error) {
console.error("Requête ARIANE impossible :", error);

return {
error: new Error(
error.name === "AbortError"
? "Délai dépassé : le serveur ARIANE met trop de temps à répondre."
: error.message || "Impossible de joindre le serveur ARIANE."
),
data: {}
};

} finally {
window.clearTimeout(timeout);
}
}

/* EXÉCUTION D'UN PROMPT */

async function runPrompt(
fullInput,
conversation,
answerToReplace = null
) {
if (busy || !session?.access_token) {
setText(status, "Connecte-toi avec Google pour utiliser ARIANE.");
return;
}

if (remainingMessages === 0) {
setText(status, "Tu as utilisé tes cinq messages pour aujourd’hui.");
updateAccountUI();
return;
}

setBusy(true);
startTimer();

try {
const result = await requestAnalysis(fullInput);

const elapsed =
((Date.now() - requestStartedAt) / 1000).toFixed(1);

if (result.error) {
setText(status, result.error.message);

if (result.data?.error === "DAILY_LIMIT_REACHED") {
remainingMessages = 0;
updateAccountUI();
}

timerDisplay.textContent = Échec après ${elapsed} s.`;
return;
}

const data = result.data;
const content =
data.analysis || "Aucune réponse n’a été renvoyée.";

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

setText(
status,
Réponse reçue en${elapsed} s · ${data.model || "ARIANE"}
);

timerDisplay.textContent = ✓ Réponse reçue en${elapsed} s`;

} finally {
stopTimer();
setBusy(false);
saveConversations();
renderHistory();
renderMessages();

if (session && remainingMessages !== 0 && input) {
input.focus();
}
}
}

/* RÉESSAYER UNE RÉPONSE */

async function retryAnswer(conversationId, answer, userIndex) {
if (busy || !session || remainingMessages === 0) return;

const conversation = conversations.find(
item => item.id === conversationId
);

if (!conversation) return;

const prompt =
answer.retryInput || buildPrompt(conversation, userIndex);

await runPrompt(prompt, conversation, answer);
}

/* ENVOI D'UN MESSAGE */

async function sendMessage(text) {
const content = text.trim();

if (busy || !session || !content) return;

if (remainingMessages === 0) {
setText(status, "Tu as utilisé tes cinq messages pour aujourd’hui.");
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
content,
id: makeId(),
createdAt: Date.now()
});

conversation.updatedAt = Date.now();
updateTitle(conversation);
saveConversations();
renderHistory();
renderMessages();

if (input) {
input.value = "";
resizeInput();
}

await runPrompt(
buildPrompt(conversation, conversation.messages.length - 1),
conversation
);
}

/* ÉVÉNEMENTS DE L'INTERFACE */

chatForm?.addEventListener("submit", event => {
event.preventDefault();
if (busy) return;

if (!session) {
setText(authStatus, "Connecte-toi avec Google pour commencer.");
return;
}

sendMessage(input?.value || "");
});

loginButton?.addEventListener("click", signInWithGoogle);
logoutButton?.addEventListener("click", signOut);
newChatButton?.addEventListener("click", createConversation);

toggleSidebar?.addEventListener("click", () => {
if (window.matchMedia("(max-width: 760px)").matches) {
sidebar?.classList.toggle("mobile-open");
} else {
sidebar?.classList.toggle("collapsed");
}
});

document.querySelectorAll(".suggestion").forEach(suggestion => {
suggestion.addEventListener("click", () => {
if (!session) {
setText(authStatus, "Connecte-toi avec Google pour commencer.");
return;
}

if (!input) return;

input.value = suggestion.dataset.prompt || "";
resizeInput();
input.focus();
});
});

input?.addEventListener("input", resizeInput);

input?.addEventListener("keydown", event => {
if (event.key === "Enter" && !event.shiftKey) {
event.preventDefault();
chatForm?.requestSubmit();
}
});

/* VÉRIFICATION DU BACKEND */

async function checkHealth() {
try {
const response = await fetch("/health", {
method: "GET",
cache: "no-store"
});

if (!response.ok) {
throw new Error(Backend indisponible (${response.status}).`);
}

const data = await response.json();

if (!health) return;

health.textContent = data.aiConfigured
? Backend en ligne · modèle${data.model}`
: "Backend en ligne · IA non configurée";

if (!data.authConfigured || !data.quotaConfigured) {
health.textContent =
"Backend en ligne · configuration à vérifier";
}

} catch (error) {
console.error("Vérification du backend impossible :", error);
setText(health, "Backend non joignable");
}
}

/* DÉMARRAGE */

renderHistory();
renderMessages();
resizeInput();
checkHealth();
initializeAuth();

