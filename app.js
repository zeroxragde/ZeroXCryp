const DB_NAME = "umbral-local";
const STORE_NAME = "records";
const ACCOUNT_KEY = "account-v1";
const DRIVE_CLIENT_KEY = "umbral-drive-client-id";
const ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const app = document.querySelector("#app");
const topbarRight = document.querySelector("#topbar-right");
const toastRegion = document.querySelector("#toast-region");
let state = { account: null, vault: null, view: "loading", search: "", revealed: new Map(), busy: false };
let modalCleanup = null;
let lockTimer = null;

const icons = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg class="icon" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 10.6A2 2 0 0 0 13.4 13.4"/><path d="M9.9 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.4 8 2 12 2 12s3.5 7 10 7c1.1 0 2.1-.2 3-.5"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>',
  key: '<svg class="icon" viewBox="0 0 24 24"><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9M17 6l3 3m-6 0 3 3"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  download: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></svg>',
  cloud: '<svg class="icon" viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.2 4.5 4.5 0 0 0 7 18Z"/><path d="M12 11v8m-3-3 3 3 3-3"/></svg>',
  external: '<svg class="icon" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/></svg>'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

function randomBytes(size = 16) { return crypto.getRandomValues(new Uint8Array(size)); }
function toB64(bytes) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
function fromB64(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function randomId() { return crypto.randomUUID(); }
async function deriveKey(password, salt, usage = ["encrypt", "decrypt"]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, usage);
}
async function seal(key, value) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(ciphertext)) };
}
async function unseal(key, box) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ciphertext));
  return decoder.decode(plain);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function makeBackup() { return { format: "umbral-vault", version: 1, createdAt: new Date().toISOString(), account: clone(state.account) }; }
async function persistVault() {
  const key = await deriveKey(state.masterPassword, fromB64(state.account.salt));
  const box = await seal(key, JSON.stringify(state.vault));
  state.account.box = box;
  state.account.updatedAt = new Date().toISOString();
  await dbSet(ACCOUNT_KEY, state.account);
}
async function registerAccount({ name, email, master, extra }) {
  const salt = randomBytes(16), extraSalt = randomBytes(16);
  const account = { version: 1, salt: toB64(salt), extraSalt: toB64(extraSalt), createdAt: new Date().toISOString() };
  const masterKey = await deriveKey(master, salt);
  const extraKey = await deriveKey(extra, extraSalt);
  account.extraCheck = await seal(extraKey, "umbral-extra-key-check-v1");
  const vault = { version: 1, profile: { name: name.trim(), email: email.trim().toLowerCase() }, entries: [] };
  account.box = await seal(masterKey, JSON.stringify(vault));
  await dbSet(ACCOUNT_KEY, account);
  state = { ...state, account, vault, view: "vault", masterPassword: master, revealed: new Map() };
  render();
}
async function unlock(master) {
  const account = await dbGet(ACCOUNT_KEY);
  if (!account) throw new Error("No encontramos una bóveda en este dispositivo.");
  const key = await deriveKey(master, fromB64(account.salt));
  let vault;
  try { vault = JSON.parse(await unseal(key, account.box)); }
  catch { throw new Error("La contraseña principal no coincide."); }
  state = { ...state, account, vault, view: "vault", masterPassword: master, revealed: new Map(), search: "" };
  render();
}
async function verifyExtra(extra) {
  const key = await deriveKey(extra, fromB64(state.account.extraSalt));
  try { return (await unseal(key, state.account.extraCheck)) === "umbral-extra-key-check-v1"; }
  catch { return false; }
}
function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function initials(value = "?") { return value.trim().slice(0, 1).toUpperCase() || "?"; }
function safeUrl(value) {
  if (!value) return "";
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try { const parsed = new URL(candidate); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; }
}
function showToast(message, type = "") {
  const toast = document.createElement("div"); toast.className = `toast ${type}`; toast.textContent = message;
  toastRegion.append(toast); setTimeout(() => toast.remove(), 3600);
}
function setBusy(value) { state.busy = value; const button = document.querySelector("#submit-button"); if (button) button.disabled = value; }
function updateTopbar() {
  if (state.view !== "vault" || !state.vault) { topbarRight.innerHTML = ""; return; }
  const name = state.vault.profile.name;
  topbarRight.innerHTML = `<span class="topbar-user">${escapeHtml(name)}</span><span class="avatar">${escapeHtml(initials(name))}</span>`;
}
function render() {
  updateTopbar();
  if (state.view === "loading") { app.innerHTML = '<div class="loading"><span class="loading-dot"></span>Preparando tu bóveda…</div>'; return; }
  if (state.view === "vault") { renderVault(); return; }
  renderAuth(state.view);
}
function renderAuth(mode) {
  const hasAccount = Boolean(state.account);
  const register = mode === "register" || (!hasAccount && mode !== "login");
  const title = register ? "Crea tu bóveda" : "Desbloquea tu bóveda";
  app.innerHTML = `<section class="hero">
    <span class="eyebrow">Una bóveda, solo tuya</span>
    <h1>Privacidad en<br /><em>tus manos.</em></h1>
    <p>Guarda tus claves en una bóveda local, cifrada y bajo tu control. Sin servidores. Sin sorpresas.</p>
    <div class="trust-row"><span>${icons.lock}<span>CIFRADO AES-256</span></span><span>${icons.shield}<span>SOLO EN ESTE DISPOSITIVO</span></span></div>
    <form id="auth-form" class="auth-card">
      <div class="auth-head"><h2>${title}</h2><span class="step-label">${register ? "CONFIGURACIÓN INICIAL" : "ACCESO LOCAL"}</span></div>
      ${register ? `<div class="field"><span class="field-label">Nombre</span><input name="name" autocomplete="name" placeholder="Cómo te llamas" required maxlength="80" /></div>
      <div class="field"><span class="field-label">Correo electrónico</span><input name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required maxlength="160" /></div>` : `<div class="notice">${icons.shield}<span>Tu correo solo identifica la bóveda en este dispositivo. No creamos una cuenta en línea.</span></div>`}
      <div class="field"><span class="field-label">${register ? "Contraseña principal" : "Contraseña principal"}<span class="field-hint">${register ? "12 caracteres o más" : ""}</span></span><div class="input-wrap"><input name="master" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="${register ? "Crea una contraseña segura" : "Escribe tu contraseña"}" required minlength="${register ? "12" : "1"}" /><button class="mini-button" type="button" data-toggle="master">VER</button></div>${register ? '<div id="master-strength" class="strength" data-level="0"><i></i><i></i><i></i><i></i></div><div id="strength-caption" class="strength-caption">Usa una frase larga que no hayas usado antes.</div>' : ""}</div>
      ${register ? `<div class="field"><span class="field-label">Clave extra para tus contraseñas<span class="field-hint">12+ caracteres</span></span><div class="input-wrap"><input name="extra" type="password" autocomplete="new-password" placeholder="Una segunda frase secreta" required minlength="12" /><button class="mini-button" type="button" data-toggle="extra">VER</button></div></div>
      <div class="notice">${icons.key}<span>Esta clave extra se pide cada vez que guardas o revelas una contraseña. Si la olvidas, esas contraseñas no se pueden recuperar.</span></div>` : ""}
      <button id="submit-button" class="button button-primary" type="submit">${register ? "Crear mi bóveda" : "Desbloquear"}</button>
      <p class="switch-auth">${register && hasAccount ? '¿Ya tienes una bóveda? <button class="text-button" type="button" data-mode="login">Desbloquear</button>' : !register && !hasAccount ? '¿Primera vez aquí? <button class="text-button" type="button" data-mode="register">Crear bóveda</button>' : ""}</p>
      <p class="auth-note">TU IDENTIDAD NO SE VERIFICA EN INTERNET.<br />SI PIERDES TUS CLAVES, NADIE PUEDE RESTABLECERLAS.</p>
    </form>
  </section>`;
  document.querySelector("#auth-form").addEventListener("submit", onAuthSubmit);
  app.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    const input = app.querySelector(`[name="${button.dataset.toggle}"]`); input.type = input.type === "password" ? "text" : "password"; button.textContent = input.type === "password" ? "VER" : "OCULTAR";
  }));
  app.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.mode; render(); }));
  app.querySelector('[name="master"]')?.addEventListener("input", updateStrength);
}
function strengthFor(value) {
  let level = 0;
  if (value.length >= 12) level++;
  if (value.length >= 16) level++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) level++;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 16) level++;
  return level;
}
function updateStrength(event) {
  const level = strengthFor(event.target.value);
  const bar = document.querySelector("#master-strength"); if (!bar) return;
  bar.dataset.level = String(level);
  document.querySelector("#strength-caption").textContent = ["Usa una frase larga que no hayas usado antes.", "Aceptable; añade longitud.", "Mejorando; combina palabras y variedad.", "Buena contraseña principal.", "Muy buena contraseña principal."][level];
}
async function onAuthSubmit(event) {
  event.preventDefault(); if (state.busy) return;
  const form = new FormData(event.currentTarget); setBusy(true);
  try {
    if (event.currentTarget.querySelector('[name="name"]')) {
      const master = String(form.get("master")); const extra = String(form.get("extra"));
      if (master === extra) throw new Error("La contraseña principal y la clave extra deben ser diferentes.");
      await registerAccount({ name: String(form.get("name")), email: String(form.get("email")), master, extra });
      showToast("Bóveda creada y cifrada en este dispositivo.");
    } else await unlock(String(form.get("master")));
  } catch (error) { showToast(error.message || "No se pudo abrir la bóveda.", "error"); }
  finally { setBusy(false); }
}

function renderVault() {
  resetIdleLock();
  const entries = state.vault.entries.filter((entry) => `${entry.name} ${entry.url} ${entry.username}`.toLowerCase().includes(state.search.toLowerCase()));
  const newButton = `<button class="button button-primary" id="add-entry">${icons.plus}<span style="margin-left:7px">Nueva clave</span></button>`;
  const cards = entries.length ? entries.map(renderCard).join("") : `<div class="empty-state"><div class="empty-icon">${icons.key}</div><h3>${state.vault.entries.length ? "No encontramos resultados" : "Tu bóveda está lista"}</h3><p>${state.vault.entries.length ? "Prueba otra búsqueda." : "Añade tu primera cuenta para empezar a organizar tus claves."}</p>${state.vault.entries.length ? "" : newButton}</div>`;
  app.innerHTML = `<section class="vault-page">
    <div class="vault-heading"><div><span class="eyebrow">ESPACIO PRIVADO</span><h1>Tu bóveda</h1><p>Hola, ${escapeHtml(state.vault.profile.name.split(" ")[0])}. Aquí están tus accesos, solo para ti.</p></div><div class="vault-actions"><button class="button button-ghost" id="settings-button">${icons.cloud}<span style="margin-left:7px">Copia y sincronización</span></button>${newButton}</div></div>
    <div class="search-toolbar"><label class="search-box">${icons.search}<input id="search-input" type="search" placeholder="Buscar en tu bóveda…" value="${escapeHtml(state.search)}" aria-label="Buscar contraseñas" /></label><span class="entry-count">${state.vault.entries.length} ${state.vault.entries.length === 1 ? "ACCESO GUARDADO" : "ACCESOS GUARDADOS"}</span></div>
    <div class="cards-grid">${cards}</div>
  </section>`;
  document.querySelector("#search-input").addEventListener("input", (event) => { state.search = event.target.value; renderVault(); const input = document.querySelector("#search-input"); input.focus(); input.setSelectionRange(state.search.length, state.search.length); });
  document.querySelectorAll("#add-entry").forEach((button) => button.addEventListener("click", () => openEntryModal()));
  document.querySelector("#settings-button").addEventListener("click", openSettings);
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleCardAction));
  app.querySelectorAll("[data-menu]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const menu = button.nextElementSibling; menu.classList.toggle("hidden"); document.addEventListener("click", () => menu.classList.add("hidden"), { once: true }); }));
}
function renderCard(entry) {
  const url = safeUrl(entry.url);
  const shown = state.revealed.has(entry.id);
  const passwordText = shown ? state.revealed.get(entry.id) : "••••••••••••";
  const title = escapeHtml(entry.name), username = escapeHtml(entry.username || "Sin usuario"), host = escapeHtml(entry.url || "Sin URL");
  return `<article class="entry-card" data-entry="${escapeHtml(entry.id)}"><div class="card-head"><div class="site-identity"><div class="site-icon">${escapeHtml(initials(entry.name))}</div><div class="site-meta"><h3>${title}</h3>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${host} ${icons.external}</a>` : `<span>${host}</span>`}</div></div><div class="card-menu"><button type="button" data-menu aria-label="Opciones de ${title}">···</button><div class="menu-pop hidden"><button data-action="edit" data-id="${escapeHtml(entry.id)}">Editar</button><button class="danger" data-action="delete" data-id="${escapeHtml(entry.id)}">Eliminar</button></div></div></div><div class="card-divider"></div><div class="card-details"><div class="detail-row"><span class="detail-label">Usuario</span><span class="detail-value" title="${username}">${username}</span></div><div class="detail-row"><span class="detail-label">Contraseña</span><div class="credential"><span class="detail-value" id="password-${escapeHtml(entry.id)}">${escapeHtml(passwordText)}</span><span class="card-tools"><button class="icon-button" data-action="${shown ? "hide" : "reveal"}" data-id="${escapeHtml(entry.id)}" aria-label="${shown ? "Ocultar" : "Mostrar"} contraseña">${shown ? icons.eyeOff : icons.eye}</button><button class="icon-button" data-action="copy" data-id="${escapeHtml(entry.id)}" aria-label="Copiar contraseña">${icons.copy}</button></span></div></div></div></article>`;
}

function openModal(title, subtitle, body, onMount) {
  closeModal();
  const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="close-button" type="button" aria-label="Cerrar">${icons.close}</button></div>${body}</section>`;
  document.body.append(backdrop);
  const close = () => closeModal();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector(".close-button").addEventListener("click", close);
  const keyHandler = (event) => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", keyHandler);
  modalCleanup = () => { document.removeEventListener("keydown", keyHandler); backdrop.remove(); modalCleanup = null; };
  onMount?.(backdrop.querySelector(".modal"));
  backdrop.querySelector("input,button")?.focus();
}
function closeModal() { modalCleanup?.(); }
function openEntryModal(existing = null) {
  const editing = Boolean(existing);
  const body = `<form id="entry-form"><div class="field"><span class="field-label">Nombre del acceso</span><input name="name" required maxlength="100" placeholder="Ej. Correo personal" value="${escapeHtml(existing?.name || "")}" /></div><div class="form-row"><div class="field"><span class="field-label">Usuario o correo</span><input name="username" autocomplete="off" maxlength="180" placeholder="nombre@correo.com" value="${escapeHtml(existing?.username || "")}" /></div><div class="field"><span class="field-label">Sitio web</span><input name="url" type="text" inputmode="url" maxlength="300" placeholder="ejemplo.com" value="${escapeHtml(existing?.url || "")}" /></div></div><div class="field"><span class="field-label">${editing ? "Nueva contraseña (opcional)" : "Contraseña"}</span><div class="input-wrap"><input name="password" type="password" autocomplete="new-password" ${editing ? "" : "required"} placeholder="${editing ? "Deja vacío para conservarla" : "Escribe la contraseña"}" /><button class="mini-button" type="button" data-reveal-pass>VER</button></div></div><div class="field"><span class="field-label">Tu clave extra</span><div class="input-wrap"><input name="extra" type="password" autocomplete="off" required minlength="12" placeholder="Confirma la clave extra" /><button class="mini-button" type="button" data-toggle-extra>VER</button></div></div><div class="modal-actions"><button class="button button-ghost" type="button" data-cancel>Cancelar</button><button id="save-entry" class="button button-primary" type="submit">${editing ? "Guardar cambios" : "Guardar acceso"}</button></div></form>`;
  openModal(editing ? "Editar acceso" : "Añadir un acceso", "Los datos se guardan en esta bóveda cifrada.", body, (modal) => {
    modal.querySelector("[data-cancel]").addEventListener("click", closeModal);
    modal.querySelector("[data-reveal-pass]").addEventListener("click", (event) => { const input = modal.querySelector('[name="password"]'); input.type = input.type === "password" ? "text" : "password"; event.currentTarget.textContent = input.type === "password" ? "VER" : "OCULTAR"; });
    modal.querySelector("[data-toggle-extra]").addEventListener("click", (event) => { const input = modal.querySelector('[name="extra"]'); input.type = input.type === "password" ? "text" : "password"; event.currentTarget.textContent = input.type === "password" ? "VER" : "OCULTAR"; });
    modal.querySelector("#entry-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const extra = String(form.get("extra")); const pass = String(form.get("password"));
      const button = modal.querySelector("#save-entry"); button.disabled = true;
      try {
        if (!await verifyExtra(extra)) throw new Error("La clave extra no coincide.");
        const name = String(form.get("name")).trim(), url = String(form.get("url")).trim();
        if (url && !safeUrl(url)) throw new Error("Escribe una dirección web válida.");
        if (editing) {
          existing.name = name; existing.username = String(form.get("username")).trim(); existing.url = url;
          if (pass) existing.passwordBox = await encryptEntryPassword(pass, extra);
        } else {
          state.vault.entries.unshift({ id: randomId(), name, username: String(form.get("username")).trim(), url, createdAt: new Date().toISOString(), passwordBox: await encryptEntryPassword(pass, extra) });
        }
        await persistVault(); closeModal(); renderVault(); showToast(editing ? "Acceso actualizado." : "Acceso guardado en la bóveda.");
      } catch (error) { showToast(error.message || "No se pudo guardar el acceso.", "error"); button.disabled = false; }
    });
  });
}
async function encryptEntryPassword(password, extra) {
  const salt = randomBytes(16); const key = await deriveKey(extra, salt); const box = await seal(key, password);
  return { salt: toB64(salt), ...box };
}
async function decryptEntryPassword(entry, extra) {
  const key = await deriveKey(extra, fromB64(entry.passwordBox.salt));
  return unseal(key, entry.passwordBox);
}

function askExtraKey(action) {
  return new Promise((resolve) => {
    const body = `<form id="extra-form"><div class="field"><span class="field-label">Clave extra</span><div class="input-wrap"><input name="extra" type="password" autocomplete="off" required placeholder="Escribe tu segunda clave" /><button class="mini-button" type="button" data-toggle-extra>VER</button></div></div><div class="modal-actions"><button class="button button-ghost" type="button" data-cancel>Cancelar</button><button class="button button-primary" type="submit">${escapeHtml(action)}</button></div></form>`;
    openModal("Confirma tu clave extra", "Protege el acceso a esta contraseña.", body, (modal) => {
      modal.querySelector("[data-cancel]").addEventListener("click", () => { closeModal(); resolve(null); });
      modal.querySelector("[data-toggle-extra]").addEventListener("click", (event) => { const input = modal.querySelector('[name="extra"]'); input.type = input.type === "password" ? "text" : "password"; event.currentTarget.textContent = input.type === "password" ? "VER" : "OCULTAR"; });
      modal.querySelector("#extra-form").addEventListener("submit", async (event) => {
        event.preventDefault(); const extra = String(new FormData(event.currentTarget).get("extra")); const button = modal.querySelector('button[type="submit"]'); button.disabled = true;
        if (!await verifyExtra(extra)) { showToast("La clave extra no coincide.", "error"); button.disabled = false; return; }
        closeModal(); resolve(extra);
      });
    });
  });
}
async function handleCardAction(event) {
  const button = event.currentTarget, action = button.dataset.action, id = button.dataset.id;
  const entry = state.vault.entries.find((item) => item.id === id); if (!entry) return;
  if (action === "edit") { openEntryModal(entry); return; }
  if (action === "delete") { confirmDelete(entry); return; }
  if (action === "hide") { state.revealed.delete(id); renderVault(); return; }
  if (action === "reveal" || action === "copy") {
    const extra = await askExtraKey(action === "copy" ? "Verificar y copiar" : "Mostrar contraseña"); if (!extra) return;
    try {
      const password = await decryptEntryPassword(entry, extra);
      if (action === "copy") { await navigator.clipboard.writeText(password); showToast("Contraseña copiada al portapapeles."); }
      else { state.revealed.set(id, password); renderVault(); setTimeout(() => { if (state.revealed.has(id)) { state.revealed.delete(id); renderVault(); } }, 30000); }
    } catch { showToast("No se pudo descifrar esta contraseña.", "error"); }
  }
}
function confirmDelete(entry) {
  const body = `<p class="confirm-text">Se eliminará <strong>${escapeHtml(entry.name)}</strong> de esta bóveda. Esta acción no se puede deshacer.</p><div class="modal-actions"><button class="button button-ghost" data-cancel>Cancelar</button><button class="button button-primary" data-confirm style="background:#f18171;color:#251613">Eliminar acceso</button></div>`;
  openModal("Eliminar este acceso", "Confirma que quieres continuar.", body, (modal) => {
    modal.querySelector("[data-cancel]").addEventListener("click", closeModal);
    modal.querySelector("[data-confirm]").addEventListener("click", async () => {
      state.vault.entries = state.vault.entries.filter((item) => item.id !== entry.id); state.revealed.delete(entry.id);
      try { await persistVault(); closeModal(); renderVault(); showToast("Acceso eliminado."); } catch { showToast("No se pudo actualizar la bóveda.", "error"); }
    });
  });
}

function openSettings() {
  loadGoogleIdentity().catch(() => {});
  const configured = localStorage.getItem(DRIVE_CLIENT_KEY) || "";
  const body = `<div class="settings-section"><h3>Respaldo cifrado</h3><p>Exporta una copia cifrada para guardarla donde quieras. El archivo no incluye tus claves en texto legible.</p><div class="settings-row"><button class="button button-ghost" id="export-backup">${icons.download}<span style="margin-left:6px">Descargar copia</span></button><button class="button button-ghost" id="import-backup">${icons.external}<span style="margin-left:6px">Restaurar archivo</span></button><input id="backup-file" class="hidden" type="file" accept="application/json,.json" /></div></div><div class="settings-section"><h3>Google Drive</h3><p>La app puede sincronizar este archivo cifrado con tu carpeta privada de datos de Google Drive. Necesitas un ID de cliente OAuth web propio.</p><div class="settings-row"><label class="field"><span class="field-label">ID de cliente OAuth</span><input id="drive-client-id" type="text" autocomplete="off" placeholder="123…apps.googleusercontent.com" value="${escapeHtml(configured)}" /></label><button class="button button-ghost" id="save-client">Guardar ID</button></div><p class="config-hint">Google Cloud Console → API y servicios → habilita Google Drive API → crea un cliente OAuth para aplicación web. Añade el dominio de esta app a “Orígenes autorizados”.</p><div class="settings-row"><button class="button button-ghost" id="drive-upload">${icons.cloud}<span style="margin-left:6px">Subir / actualizar</span></button><button class="button button-ghost" id="drive-download">${icons.download}<span style="margin-left:6px">Restaurar desde Drive</span></button></div></div><div class="settings-section"><h3>Cuenta local</h3><p><span class="settings-email">${escapeHtml(state.vault.profile.email)}</span><br />La bóveda se guarda solo en este dispositivo mientras no uses Drive o exportes una copia.</p><div class="settings-row"><button class="button button-ghost" id="lock-vault">${icons.lock}<span style="margin-left:6px">Bloquear bóveda</span></button></div></div>`;
  openModal("Copia y sincronización", "Administra tus copias cifradas y el acceso local.", body, (modal) => {
    modal.querySelector("#export-backup").addEventListener("click", exportBackup);
    modal.querySelector("#import-backup").addEventListener("click", () => modal.querySelector("#backup-file").click());
    modal.querySelector("#backup-file").addEventListener("change", (event) => importBackupFile(event.target.files?.[0]));
    modal.querySelector("#save-client").addEventListener("click", () => { const id = modal.querySelector("#drive-client-id").value.trim(); if (id && !id.endsWith(".apps.googleusercontent.com")) { showToast("Ese ID no parece ser un cliente OAuth de Google.", "error"); return; } localStorage.setItem(DRIVE_CLIENT_KEY, id); showToast(id ? "ID de Google guardado en este dispositivo." : "ID eliminado."); });
    modal.querySelector("#drive-upload").addEventListener("click", driveUpload);
    modal.querySelector("#drive-download").addEventListener("click", driveDownload);
    modal.querySelector("#lock-vault").addEventListener("click", () => { closeModal(); lockVault(); });
  });
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `ZeroXCryp-copia-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); showToast("Copia cifrada descargada.");
}
async function importBackupFile(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.format !== "umbral-vault" || backup.version !== 1 || !backup.account?.box) throw new Error("El archivo no es una copia compatible de ZeroXCryp.");
    if (!confirm("¿Reemplazar la bóveda de este dispositivo con la copia seleccionada? Primero se verificará la contraseña principal.")) return;
    const master = prompt("Escribe la contraseña principal de la copia para verificarla:"); if (master === null) return;
    const account = backup.account, key = await deriveKey(master, fromB64(account.salt));
    await unseal(key, account.box);
    await dbSet(ACCOUNT_KEY, account); state.account = account; state.masterPassword = master;
    await unlock(master); closeModal(); showToast("Copia restaurada correctamente.");
  } catch (error) { showToast(error.message || "No se pudo leer la copia.", "error"); }
}
function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("#google-identity-script");
    if (existing) { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", reject, { once: true }); return; }
    const script = document.createElement("script"); script.id = "google-identity-script"; script.src = "https://accounts.google.com/gsi/client"; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error("No se pudo cargar el acceso a Google.")); document.head.append(script);
  });
}
async function getGoogleToken() {
  const clientId = localStorage.getItem(DRIVE_CLIENT_KEY);
  if (!clientId) throw new Error("Primero guarda tu ID de cliente OAuth en esta ventana.");
  await loadGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/drive.appdata", callback: (response) => response.error ? reject(new Error(response.error_description || response.error)) : resolve(response.access_token), error_callback: (error) => reject(new Error(error.message || "No se pudo autorizar Google Drive.")) });
    client.requestAccessToken({ prompt: "consent" });
  });
}
async function driveRequest(token, path, options = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) { const details = await response.json().catch(() => ({})); throw new Error(details.error?.message || `Google Drive respondió ${response.status}.`); }
  return response.status === 204 ? null : response.json();
}
async function findDriveBackup(token) {
  const query = encodeURIComponent("name='ZeroXCryp-vault.json' and trashed=false");
  const result = await driveRequest(token, `files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&pageSize=10`);
  return result.files?.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0] || null;
}
async function driveUpload() {
  try {
    const token = await getGoogleToken(); const existing = await findDriveBackup(token);
    const boundary = "umbral_sync_boundary_57823";
    const metadata = existing ? {} : { name: "ZeroXCryp-vault.json", parents: ["appDataFolder"] };
    const payload = JSON.stringify(makeBackup());
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;
    const path = existing ? `files/${existing.id}?uploadType=multipart` : "files?uploadType=multipart";
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/${path}`, { method: existing ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error?.message || `Google Drive respondió ${response.status}.`); }
    showToast("Copia cifrada sincronizada con tu Google Drive.");
  } catch (error) { showToast(error.message || "No se pudo sincronizar con Google Drive.", "error"); }
}
async function driveDownload() {
  try {
    const token = await getGoogleToken(); const file = await findDriveBackup(token);
    if (!file) throw new Error("No hay una copia de ZeroXCryp en la carpeta de datos de Drive.");
    const backup = await driveRequest(token, `files/${file.id}?alt=media`);
    if (backup.format !== "umbral-vault" || backup.version !== 1) throw new Error("El archivo de Drive no es una copia compatible.");
    if (!confirm("¿Reemplazar la bóveda actual con la copia de Google Drive? Primero se verificará la contraseña principal de esa copia.")) return;
    const master = prompt("Escribe la contraseña principal que usaste al crear la copia:"); if (master === null) return;
    const key = await deriveKey(master, fromB64(backup.account.salt)); await unseal(key, backup.account.box);
    await dbSet(ACCOUNT_KEY, backup.account); state.account = backup.account;
    await unlock(master); closeModal(); showToast("Bóveda restaurada desde Google Drive.");
  } catch (error) { showToast(error.message || "No se pudo restaurar la copia de Drive.", "error"); }
}

async function init() {
  if (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  try {
    if (!crypto?.subtle || !indexedDB) throw new Error("Este navegador no ofrece cifrado local compatible. Abre ZeroXCryp en un navegador actualizado y seguro (HTTPS).");
    state.account = await dbGet(ACCOUNT_KEY);
    state.view = state.account ? "login" : "register";
  } catch (error) { state.view = "register"; setTimeout(() => showToast(error.message, "error"), 50); }
  render();
}
function lockVault() {
  clearTimeout(lockTimer);
  state = { account: state.account, vault: null, view: "login", search: "", revealed: new Map() };
  closeModal(); render();
}
function resetIdleLock() {
  clearTimeout(lockTimer);
  if (state.view === "vault") lockTimer = setTimeout(lockVault, 5 * 60 * 1000);
}
for (const eventName of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(eventName, () => { if (state.view === "vault") resetIdleLock(); }, { passive: true });
init();
