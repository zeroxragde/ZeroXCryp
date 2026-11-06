(() => {
  'use strict';
  const ITERATIONS = 310000;
  const EXTRA_CHECK = 'zeroxcryp-extra-check-v1';
  const DB_NAME = 'zeroxcryp-web-v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const auth = $('#auth'), vaultView = $('#vault'), entryDialog = $('#entryDialog'), entryForm = $('#entryForm');
  const installButton = $('#installButton'), installMain = $('#installMain'), installPanel = $('#installPanel');
  let account = null, vault = null, masterPassword = null, revealed = new Map(), deferredInstall = null, idleTimer = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('local', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function getAccount() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction('local').objectStore('local').get('account');
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveAccount(value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('local', 'readwrite');
      tx.objectStore('local').put({ id: 'account', value });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
  const b64 = bytes => { let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); };
  const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const bytes = text => new TextEncoder().encode(text);
  async function derive(password, salt) {
    const material = await crypto.subtle.importKey('raw', bytes(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, plain) {
    const iv = randomBytes(12);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, bytes(plain)));
    return { iv: b64(iv), cipher: b64(cipher) };
  }
  async function unseal(key, box) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), tagLength: 128 }, key, unb64(box.cipher));
    return new TextDecoder().decode(plain);
  }
  async function encryptEntry(password, extra) {
    const salt = randomBytes(16), box = await seal(await derive(extra, salt), password);
    box.salt = b64(salt); return box;
  }
  async function decryptEntry(entry, extra) {
    const box = entry.passwordBox;
    return unseal(await derive(extra, unb64(box.salt)), box);
  }
  async function verifyExtra(extra) {
    return await unseal(await derive(extra, unb64(account.extraSalt)), account.extraCheck) === EXTRA_CHECK;
  }
  async function persistVault() {
    account.box = await seal(await derive(masterPassword, unb64(account.salt)), JSON.stringify(vault));
    account.updatedAt = Date.now(); await saveAccount(account);
  }
  function message(text, error = false) {
    $('.toast')?.remove(); const node = document.createElement('div'); node.className = `toast${error ? ' error-toast' : ''}`; node.textContent = text; document.body.append(node); setTimeout(() => node.remove(), 2600);
  }
  function field(label, name, type, placeholder, required = true) {
    const wrap = document.createElement('label'); wrap.className = 'field'; wrap.append(document.createTextNode(label));
    const input = document.createElement('input'); input.name = name; input.type = type; input.placeholder = placeholder; input.required = required;
    if (type === 'password') input.autocomplete = 'new-password'; wrap.append(input); return wrap;
  }
  function setError(text) {
    $('.error', auth)?.remove(); if (!text) return;
    const error = document.createElement('p'); error.className = 'error'; error.textContent = text; auth.append(error);
  }
  function renderRegister() {
    vaultView.hidden = true; auth.hidden = false; auth.replaceChildren(); auth.className = 'panel';
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'CREA TU BÓVEDA'; auth.append(eyebrow);
    const title = document.createElement('h2'); title.textContent = 'Empieza en privado.'; auth.append(title);
    const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = 'Tu nombre y correo solo identifican tu perfil local. No se crea una cuenta en línea.'; auth.append(sub);
    const form = document.createElement('form'); form.id = 'registerForm'; form.append(field('Nombre', 'name', 'text', 'Cómo te llamas'), field('Correo electrónico', 'email', 'email', 'tu@correo.com'), field('Contraseña principal', 'master', 'password', '12 caracteres o más'), field('Clave extra', 'extra', 'password', 'Una segunda frase secreta'));
    const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Usa dos claves distintas, de al menos 12 caracteres. La clave extra se pide para guardar, revelar o copiar contraseñas.'; form.append(note);
    const actions = document.createElement('div'); actions.className = 'auth-actions'; const submit = document.createElement('button'); submit.className = 'button primary'; submit.textContent = 'Crear mi bóveda'; actions.append(submit); form.append(actions); auth.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); setError(''); const data = new FormData(form), name = String(data.get('name')).trim(), email = String(data.get('email')).trim(), master = String(data.get('master')), extra = String(data.get('extra'));
      if (master.length < 12 || extra.length < 12) return setError('Ambas claves deben tener al menos 12 caracteres.');
      if (master === extra) return setError('La contraseña principal y la clave extra deben ser diferentes.');
      try {
        const masterSalt = randomBytes(16), extraSalt = randomBytes(16);
        const profile = { name, email: email.toLowerCase() };
        account = { version: 1, salt: b64(masterSalt), extraSalt: b64(extraSalt), extraCheck: await seal(await derive(extra, extraSalt), EXTRA_CHECK) };
        vault = { version: 1, profile, entries: [] }; masterPassword = master; await persistVault(); renderVault(); message('Bóveda creada y cifrada en este dispositivo.');
      } catch (error) { console.error('No se pudo inicializar la bóveda'); setError('No se pudo crear la bóveda en este navegador. Comprueba el almacenamiento disponible.'); }
    });
  }
  function renderLogin() {
    vaultView.hidden = true; auth.hidden = false; auth.replaceChildren(); auth.className = 'panel';
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'ACCESO LOCAL'; auth.append(eyebrow);
    const title = document.createElement('h2'); title.textContent = 'Desbloquea tu bóveda.'; auth.append(title);
    const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = 'Los datos cifrados permanecen en este navegador.'; auth.append(sub);
    const form = document.createElement('form'); form.append(field('Contraseña principal', 'master', 'password', 'Tu contraseña principal'));
    const actions = document.createElement('div'); actions.className = 'auth-actions'; const open = document.createElement('button'); open.className = 'button primary'; open.textContent = 'Desbloquear'; actions.append(open);
    const restore = document.createElement('button'); restore.className = 'button secondary'; restore.type = 'button'; restore.textContent = 'Restaurar copia'; actions.append(restore); form.append(actions); auth.append(form);
    const help = document.createElement('p'); help.className = 'hint'; help.textContent = 'La contraseña principal no se puede recuperar. Conserva una copia cifrada en un lugar seguro.'; auth.append(help);
    restore.addEventListener('click', importBackup);
    form.addEventListener('submit', async event => {
      event.preventDefault(); setError(''); const password = String(new FormData(form).get('master'));
      try { vault = JSON.parse(await unseal(await derive(password, unb64(account.salt)), account.box)); masterPassword = password; revealed.clear(); renderVault(); }
      catch { setError('La contraseña principal no coincide o la bóveda está dañada.'); }
    });
  }
  function addButton(label, className, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `button ${className}`; button.textContent = label; button.addEventListener('click', handler); return button;
  }
  function chooseAction(title, description, options) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'dialog small-dialog'; const form = document.createElement('form'); form.method = 'dialog'; form.className = 'dialog-form';
      const heading = document.createElement('div'); heading.className = 'dialog-heading'; const info = document.createElement('div'); const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'ZEROXCRYP'; const h = document.createElement('h2'); h.textContent = title; info.append(eyebrow, h); const close = document.createElement('button'); close.className = 'icon-button'; close.value = 'cancel'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar'); heading.append(info, close); form.append(heading);
      if (description) { const p = document.createElement('p'); p.className = 'instructions'; p.textContent = description; form.append(p); }
      const actions = document.createElement('div'); actions.className = 'form-actions'; const cancel = document.createElement('button'); cancel.className = 'button secondary'; cancel.value = 'cancel'; cancel.textContent = 'Cancelar'; actions.append(cancel);
      for (const option of options) { const button = document.createElement('button'); button.className = `button ${option.primary ? 'primary' : 'secondary'}`; button.value = option.value; button.textContent = option.label; actions.append(button); }
      form.append(actions); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => { const result = dialog.returnValue; dialog.remove(); resolve(result); }, { once: true }); dialog.showModal();
    });
  }
  function renderVault() {
    auth.hidden = true; vaultView.hidden = false; vaultView.replaceChildren(); vaultView.className = 'panel';
    const top = document.createElement('div'); top.className = 'vault-head'; const text = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'ESPACIO PRIVADO';
    const title = document.createElement('h2'); title.textContent = 'Tu bóveda'; const sub = document.createElement('p'); sub.textContent = `Hola, ${(vault.profile?.name || '').split(' ')[0]}. Tus accesos están cifrados aquí.`;
    text.append(eyebrow, title, sub); top.append(text, addButton('⋯', 'secondary', settings)); vaultView.append(top);
    const actions = document.createElement('div'); actions.className = 'actions'; actions.append(addButton('＋ Nueva clave', 'primary', () => openEntry()), addButton('Copia cifrada', 'secondary', backupOptions)); vaultView.append(actions);
    const entries = vault.entries || [];
    if (!entries.length) {
      const empty = document.createElement('div'); empty.className = 'empty'; const strong = document.createElement('strong'); strong.textContent = 'Tu bóveda está lista'; const p = document.createElement('p'); p.textContent = 'Añade tu primera cuenta para empezar a guardar tus claves.'; empty.append(strong, p); vaultView.append(empty);
    } else entries.forEach(entry => vaultView.append(makeCard(entry)));
    const bottom = document.createElement('div'); bottom.className = 'vault-bottom'; bottom.append(addButton('Bloquear bóveda', 'secondary', lockVault)); vaultView.append(bottom); resetTimer();
  }
  function makeCard(entry) {
    const card = document.createElement('article'); card.className = 'entry-card';
    const head = document.createElement('div'); head.className = 'entry-head'; const icon = document.createElement('div'); icon.className = 'site-icon'; icon.textContent = (entry.name || '?').slice(0, 1).toUpperCase();
    const meta = document.createElement('div'); meta.className = 'entry-meta'; const name = document.createElement('strong'); name.textContent = entry.name || 'Sin nombre';
    const url = document.createElement('span'); url.textContent = entry.url || 'Sin URL'; meta.append(name, url); const menu = addButton('⋯', 'secondary mini', () => entryMenu(entry)); head.append(icon, meta, menu); card.append(head);
    const divider = document.createElement('div'); divider.className = 'divider'; card.append(divider);
    const userLabel = document.createElement('div'); userLabel.className = 'label-small'; userLabel.textContent = 'USUARIO'; const user = document.createElement('div'); user.className = 'username'; user.textContent = entry.username || 'Sin usuario'; card.append(userLabel, user);
    const row = document.createElement('div'); row.className = 'password-row'; const label = document.createElement('span'); label.className = 'label-small'; label.textContent = 'CONTRASEÑA'; const pass = document.createElement('span'); pass.className = 'masked'; pass.textContent = revealed.has(entry.id) ? revealed.get(entry.id) : '••••••••••••';
    const show = addButton(revealed.has(entry.id) ? 'Ocultar' : 'Ver', 'secondary mini', () => {
      if (revealed.has(entry.id)) { revealed.delete(entry.id); renderVault(); return; }
      requestExtra('Mostrar contraseña').then(async extra => { if (!extra) return; if (!await verifyExtra(extra)) return message('La clave extra no coincide.', true); revealed.set(entry.id, await decryptEntry(entry, extra)); renderVault(); setTimeout(() => { if (revealed.delete(entry.id) && vault) renderVault(); }, 30000); }).catch(() => message('No se pudo descifrar la contraseña.', true));
    });
    const copy = addButton('Copiar', 'secondary mini', () => requestExtra('Verificar y copiar').then(async extra => { if (!extra) return; if (!await verifyExtra(extra)) return message('La clave extra no coincide.', true); await navigator.clipboard.writeText(await decryptEntry(entry, extra)); message('Contraseña copiada.'); }).catch(() => message('No se pudo copiar. Usa un navegador seguro y vuelve a intentarlo.', true)));
    row.append(label, pass, show, copy); card.append(row); return card;
  }
  function requestExtra(title) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'dialog small-dialog'; const form = document.createElement('form'); form.className = 'dialog-form'; form.method = 'dialog';
      const heading = document.createElement('div'); heading.className = 'dialog-heading'; const h = document.createElement('div'); const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'CONFIRMA TU CLAVE EXTRA'; const titleEl = document.createElement('h2'); titleEl.textContent = title; h.append(eyebrow, titleEl); const close = document.createElement('button'); close.className = 'icon-button'; close.value = 'cancel'; close.textContent = '×'; heading.append(h, close);
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'current-password'; input.placeholder = 'Tu segunda clave secreta'; input.required = true;
      const label = document.createElement('label'); label.className = 'field'; label.textContent = 'Clave extra'; label.append(input); const actions = document.createElement('div'); actions.className = 'form-actions'; const cancel = document.createElement('button'); cancel.className = 'button secondary'; cancel.value = 'cancel'; cancel.textContent = 'Cancelar'; const confirm = document.createElement('button'); confirm.className = 'button primary'; confirm.value = 'confirm'; confirm.textContent = 'Continuar'; actions.append(cancel, confirm); form.append(heading, label, actions); dialog.append(form); document.body.append(dialog);
      dialog.addEventListener('close', () => { const value = dialog.returnValue === 'confirm' ? input.value : null; dialog.remove(); resolve(value); }, { once: true }); dialog.showModal(); input.focus();
    });
  }
  function openEntry(entry = null) {
    entryForm.reset(); const form = entryForm; form.elements.id.value = entry?.id || ''; form.elements.name.value = entry?.name || ''; form.elements.username.value = entry?.username || ''; form.elements.url.value = entry?.url || '';
    form.elements.password.required = !entry; form.elements.password.placeholder = entry ? 'Vacío para conservarla' : 'Contraseña del acceso'; form.elements.extra.value = '';
    $('#dialogTitle').textContent = entry ? 'Editar acceso' : 'Nueva clave'; $('#saveEntry').textContent = entry ? 'Guardar cambios' : 'Guardar acceso'; $('#editNote').hidden = !entry; entryDialog.showModal();
  }
  entryForm.addEventListener('submit', async event => {
    event.preventDefault(); const data = new FormData(entryForm); const id = String(data.get('id')); const existing = vault.entries.find(item => item.id === id); const extra = String(data.get('extra'));
    try {
      if (!await verifyExtra(extra)) return message('La clave extra no coincide.', true);
      const entry = existing || { id: crypto.randomUUID(), createdAt: Date.now() };
      entry.name = String(data.get('name')).trim(); entry.username = String(data.get('username')).trim(); entry.url = String(data.get('url')).trim();
      const password = String(data.get('password')); if (!existing || password) entry.passwordBox = await encryptEntry(password, extra);
      if (!existing) vault.entries.unshift(entry); await persistVault(); entryDialog.close(); revealed.clear(); renderVault(); message(existing ? 'Acceso actualizado.' : 'Acceso guardado.');
    } catch { message('No se pudo guardar este acceso.', true); }
  });
  async function entryMenu(entry) {
    const choice = await chooseAction(entry.name, 'Elige una acción para este acceso.', [{ label: 'Editar', value: 'edit', primary: true }, { label: 'Eliminar', value: 'delete' }]);
    if (choice === 'edit') openEntry(entry);
    if (choice === 'delete') {
      const confirmDelete = await chooseAction('Eliminar acceso', `Se eliminará “${entry.name}” de esta bóveda.`, [{ label: 'Eliminar', value: 'yes', primary: true }]);
      if (confirmDelete === 'yes') { vault.entries = vault.entries.filter(item => item.id !== entry.id); persistVault().then(() => { revealed.delete(entry.id); renderVault(); message('Acceso eliminado.'); }).catch(() => message('No se pudo actualizar la bóveda.', true)); }
    }
  }
  async function backupOptions() {
    const action = await chooseAction('Copia cifrada', 'La copia se guarda como archivo cifrado. Puedes subirlo manualmente a Google Drive.', [{ label: 'Guardar copia', value: 'save', primary: true }, { label: 'Restaurar copia', value: 'restore' }]);
    if (action === 'save') exportBackup(); else if (action === 'restore') importBackup();
  }
  async function exportBackup() {
    try {
      const backup = { format: 'zeroxcryp-vault', version: 1, account };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ZeroXCryp-copia.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('Copia cifrada descargada. Guárdala en un lugar seguro.');
    } catch { message('No se pudo exportar la copia.', true); }
  }
  function importBackup() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const backup = JSON.parse(await file.text()); if (backup.format !== 'zeroxcryp-vault' || backup.version !== 1 || !backup.account?.salt || !backup.account?.box) throw new Error('Formato incorrecto');
        const password = prompt('Escribe la contraseña principal de la copia para verificarla:'); if (!password) return;
        const importedVault = JSON.parse(await unseal(await derive(password, unb64(backup.account.salt)), backup.account.box));
        if (!Array.isArray(importedVault.entries)) throw new Error('Bóveda incompleta');
        account = backup.account; vault = importedVault; masterPassword = password; revealed.clear(); await saveAccount(account); renderVault(); message('Copia restaurada en este dispositivo.');
      } catch { message('No se pudo restaurar: copia inválida o contraseña principal incorrecta.', true); }
    }, { once: true }); input.click();
  }
  async function settings() {
    const action = await chooseAction('Ajustes', 'Administra tu copia cifrada o bloquea la bóveda.', [{ label: 'Copia cifrada', value: 'backup', primary: true }, { label: 'Bloquear', value: 'lock' }]);
    if (action === 'backup') backupOptions(); else if (action === 'lock') lockVault();
  }
  function lockVault() { clearTimeout(idleTimer); vault = null; masterPassword = null; revealed.clear(); renderLogin(); }
  function resetTimer() { clearTimeout(idleTimer); idleTimer = setTimeout(lockVault, 5 * 60 * 1000); }
  document.addEventListener('pointerdown', () => { if (vault) resetTimer(); }); document.addEventListener('visibilitychange', () => { if (document.hidden && vault) lockVault(); });
  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function updateInstallUi() {
    if (standalone()) { installButton.hidden = true; installPanel.hidden = true; return; }
    installButton.hidden = false; installPanel.hidden = false;
    $('#installHelp').textContent = isIos() ? 'En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.' : 'Añádela a la pantalla de inicio para abrirla sin la barra del navegador.';
    installMain.textContent = isIos() ? 'Ver cómo instalar en iPhone' : 'Instalar ZeroXCryp';
  }
  function showInstallHelp() {
    const instruction = $('#installInstructions'); const action = $('#installDialogAction');
    if (deferredInstall) {
      deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; updateInstallUi(); }); return;
    }
    instruction.textContent = isIos()
      ? '1. Abre esta página en Safari.\n2. Toca el botón Compartir (el cuadrado con flecha).\n3. Elige “Añadir a pantalla de inicio”.\n4. Toca “Añadir”.'
      : 'En Chrome: abre el menú ⋮ y toca “Instalar aplicación” o “Añadir a pantalla de inicio”. Si no aparece, actualiza la página y vuelve a intentarlo.';
    action.textContent = 'Entendido'; $('#installDialog').showModal();
  }
  installButton.addEventListener('click', showInstallHelp); installMain.addEventListener('click', showInstallHelp);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; installMain.textContent = 'Instalar ZeroXCryp'; });
  window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallUi(); message('ZeroXCryp se instaló en tu dispositivo.'); });
  async function start() {
    updateInstallUi();
    if (!window.isSecureContext || !crypto.subtle || !indexedDB) { auth.className = 'panel'; auth.textContent = 'Este navegador no ofrece cifrado local seguro. Abre ZeroXCryp desde su enlace HTTPS actualizado.'; return; }
    try { account = await getAccount(); if (account) renderLogin(); else renderRegister(); }
    catch { auth.className = 'panel'; auth.textContent = 'No se pudo abrir el almacenamiento local de este navegador.'; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
