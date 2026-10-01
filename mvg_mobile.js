/* ============================================================================
   MVG — module mobile (iPhone) : menu, synchro chiffrée, ventes rapides, hors ligne
   Chargé après le script principal de index.html (accès à DB, KEY, save, today…)
   ========================================================================== */
(function () {
  'use strict';

  var CFG_KEY   = 'mvg_sync_cfg';
  var GIST_DESC = 'MVG_SYNC_DATA';
  var GIST_FILE = 'mvg_data.enc.json';
  var API       = 'https://api.github.com';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(m, d) { try { showToast(m, d || 3500); } catch (e) { /* ignore */ } }
  function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }

  /* ────────────────────────────────────────────────────────────────────────
     1. CSS mobile
     ──────────────────────────────────────────────────────────────────────── */
  var css = '' +
    'html{-webkit-text-size-adjust:100%}' +
    '.mvg-burger{display:none;background:var(--s2);border:1px solid var(--br);color:var(--gd2);border-radius:8px;font-size:18px;line-height:1;padding:6px 10px;cursor:pointer}' +
    '.sb-backdrop{display:none}' +
    '#mvg-sync-btn{display:inline-flex;align-items:center;gap:6px}' +
    '#mvg-sync-btn .dot{width:8px;height:8px;border-radius:50%;background:#55524e;display:inline-block}' +
    '#mvg-sync-btn.ok .dot{background:#2ea043}#mvg-sync-btn.dirty .dot{background:#e3a008}' +
    '#mvg-sync-btn.busy .dot{background:#1f6feb;animation:mvgp 1s infinite}#mvg-sync-btn.err .dot{background:#da3633}' +
    '@keyframes mvgp{50%{opacity:.25}}' +
    '.mvg-note{font-size:11px;line-height:1.6;color:var(--tx2)}' +
    '.mvg-note a{color:var(--gd2)}' +
    '.mvg-box{background:var(--s1);border:1px solid var(--br);border-radius:10px;padding:10px 12px;margin:8px 0}' +
    '.mvg-ios-banner{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:250;background:var(--s2);border:1px solid var(--gd);border-radius:12px;padding:12px 14px;font-size:12px;color:var(--tx);box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
    '@media(max-width:768px){' +
    '  .mvg-burger{display:inline-block}' +
    '  .sidebar{display:flex!important;position:fixed!important;top:0;left:0;bottom:0;height:100%!important;width:270px;max-width:84vw;z-index:300;transform:translateX(-105%);transition:transform .22s ease;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-shadow:none}' +
    '  body.sb-open .sidebar{transform:none;box-shadow:0 0 60px rgba(0,0,0,.8)}' +
    '  body.sb-open .sb-backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:290}' +
    '  .topbar{padding:8px 12px;padding-top:calc(8px + env(safe-area-inset-top));padding-left:calc(12px + env(safe-area-inset-left));padding-right:calc(12px + env(safe-area-inset-right))}' +
    '  .topbar-right{gap:6px;flex-wrap:wrap}' +
    '  #topbar-week,.theme-btn{display:none!important}' +
    '  .content{padding-bottom:calc(24px + env(safe-area-inset-bottom))}' +
    '  input,select,textarea{font-size:16px!important}' +
    '  .btn-sm{min-height:36px}' +
    '  .overlay{align-items:flex-start;padding:calc(10px + env(safe-area-inset-top)) 6px 10px;overflow-y:auto}' +
    '  .modal{padding:16px!important;max-height:none!important}' +
    '  .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}' +
    '}' +
    '@media(max-width:480px){.form-grid{grid-template-columns:1fr!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ────────────────────────────────────────────────────────────────────────
     2. Menu tiroir (iPhone)
     ──────────────────────────────────────────────────────────────────────── */
  function initDrawer() {
    var title = document.querySelector('.topbar-title');
    if (title && !$('mvg-burger')) {
      var b = document.createElement('button');
      b.id = 'mvg-burger'; b.className = 'mvg-burger'; b.setAttribute('aria-label', 'Menu'); b.textContent = '☰';
      b.onclick = function () { document.body.classList.toggle('sb-open'); };
      title.parentNode.insertBefore(b, title);
    }
    var bd = document.createElement('div'); bd.className = 'sb-backdrop';
    bd.onclick = function () { document.body.classList.remove('sb-open'); };
    document.body.appendChild(bd);
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.sidebar .sb-btn')) document.body.classList.remove('sb-open');
    });
  }

  /* ────────────────────────────────────────────────────────────────────────
     3. Chiffrement (mot de passe → AES-GCM) — les données sont illisibles dans le cloud
     ──────────────────────────────────────────────────────────────────────── */
  function b64e(buf) {
    var u = new Uint8Array(buf), s = '', i, CH = 0x8000;
    for (i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function b64d(str) { var s = atob(str), u = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function deriveKey(pass, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function streamBytes(bytes, Ctor, fmt) {
    var s = new Ctor(fmt);
    var w = s.writable.getWriter(); w.write(bytes); w.close();
    return new Response(s.readable).arrayBuffer();
  }
  function encryptObj(obj, pass) {
    var raw = new TextEncoder().encode(JSON.stringify(obj));
    var canZip = typeof CompressionStream !== 'undefined';
    var p = canZip ? streamBytes(raw, CompressionStream, 'gzip').then(function (b) { return new Uint8Array(b); }) : Promise.resolve(raw);
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return Promise.all([p, deriveKey(pass, salt)]).then(function (r) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, r[1], r[0]);
    }).then(function (ct) {
      return { v: 1, z: canZip ? 1 : 0, mod: obj._mod || 0, salt: b64e(salt), iv: b64e(iv), data: b64e(ct) };
    });
  }
  function decryptEnv(env, pass) {
    return deriveKey(pass, b64d(env.salt)).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.data));
    }).catch(function () { var e = new Error('BAD_PASS'); e.code = 'BAD_PASS'; throw e; }).then(function (pt) {
      if (env.z) {
        if (typeof DecompressionStream === 'undefined') { var e = new Error('NO_DECOMP'); e.code = 'NO_DECOMP'; throw e; }
        return streamBytes(new Uint8Array(pt), DecompressionStream, 'gzip');
      }
      return pt;
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  /* ────────────────────────────────────────────────────────────────────────
     4. Accès GitHub Gist (gratuit, privé)
     ──────────────────────────────────────────────────────────────────────── */
  function gh(path, opt, token) {
    opt = opt || {};
    var h = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token };
    if (opt.body) h['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opt.method || 'GET', headers: h, body: opt.body, cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { var e = new Error('BAD_TOKEN'); e.code = 'BAD_TOKEN'; throw e; }
      if (r.status === 403 || r.status === 429) { var e2 = new Error('RATE'); e2.code = 'RATE'; throw e2; }
      if (r.status === 404) { var e3 = new Error('NOT_FOUND'); e3.code = 'NOT_FOUND'; throw e3; }
      if (!r.ok) { var e4 = new Error('HTTP_' + r.status); e4.code = 'HTTP'; throw e4; }
      return r.json();
    });
  }
  function findGist(token) {
    function page(n) {
      return gh('/gists?per_page=100&page=' + n, {}, token).then(function (list) {
        for (var i = 0; i < list.length; i++) if (list[i].description === GIST_DESC && list[i].files && list[i].files[GIST_FILE]) return list[i].id;
        if (list.length === 100 && n < 5) return page(n + 1);
        return null;
      });
    }
    return page(1);
  }
  function readGist(id, token) {
    return gh('/gists/' + id, {}, token).then(function (g) {
      var f = g.files && g.files[GIST_FILE];
      if (!f) { var e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
      if (f.truncated && f.raw_url) return fetch(f.raw_url, { cache: 'no-store' }).then(function (r) { return r.text(); });
      return f.content;
    }).then(function (txt) { return JSON.parse(txt); });
  }
  function writeGist(id, env, token) {
    var files = {}; files[GIST_FILE] = { content: JSON.stringify(env) };
    if (id) return gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: files }) }, token).then(function () { return id; });
    return gh('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: files }) }, token).then(function (g) { return g.id; });
  }

  /* ────────────────────────────────────────────────────────────────────────
     5. Synchronisation (hors ligne d'abord, cloud ensuite)
     ──────────────────────────────────────────────────────────────────────── */
  var busy = false, timer = null, state = 'none', lastError = '', pendingConflict = null;

  function cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function configured() { var c = cfg(); return !!(c.token && c.pass); }
  function localMod() { return (typeof DB !== 'undefined' && DB._mod) || 0; }
  function isPristine(d) {
    d = d || DB;
    return !((d.commandes && d.commandes.length) || (d.clients && d.clients.length) || (d.charges && d.charges.length) ||
      (d.prix && d.prix.length) || (d.stock && d.stock.items && d.stock.items.length) || (d.ventesDirectes && d.ventesDirectes.length) ||
      (d.employes && d.employes.length) || (d.fournisseurs && d.fournisseurs.length));
  }
  function summary(d) {
    return (d.commandes ? d.commandes.length : 0) + ' commandes · ' + (d.clients ? d.clients.length : 0) + ' clients · ' +
      (d.ventesDirectes ? d.ventesDirectes.length : 0) + ' ventes';
  }
  function fmtDT(ts) { if (!ts) return '—'; return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  function setState(s, err) {
    state = s; lastError = err || '';
    var b = $('mvg-sync-btn'); if (b) { b.className = 'btn-sm ' + (s === 'ok' || s === 'dirty' || s === 'busy' || s === 'err' ? s : ''); var l = b.querySelector('.lab'); if (l) l.textContent = ({ none: 'Sync', ok: 'Synchronisé', dirty: 'À envoyer', busy: 'Sync…', err: 'Erreur', offline: 'Hors ligne' })[s] || 'Sync'; }
    renderPanel();
  }
  function friendly(e) {
    var m = { BAD_TOKEN: 'Jeton GitHub invalide ou expiré.', BAD_PASS: 'Mot de passe de chiffrement incorrect (ou données d’un autre mot de passe).', RATE: 'Limite GitHub atteinte, réessayez plus tard.', NOT_FOUND: 'Sauvegarde cloud introuvable.', NO_DECOMP: 'Cette sauvegarde est compressée : mettez iOS à jour.', HTTP: 'GitHub a répondu avec une erreur.' };
    if (e && m[e.code]) return m[e.code];
    if (!navigator.onLine) return 'Pas de connexion internet.';
    return 'Erreur réseau : ' + (e && e.message ? e.message : e);
  }

  function replaceLocal(data, newCfg) {
    try { localStorage.setItem('mvg_v5_avant_sync', localStorage.getItem(KEY) || ''); } catch (e) { /* ignore */ }
    localStorage.setItem(KEY, JSON.stringify(data));
    newCfg.lastMod = data._mod || 0; newCfg.lastSync = Date.now(); saveCfg(newCfg);
    toast('Données cloud chargées ✓');
    setTimeout(function () { location.reload(); }, 500);
  }

  function push(c, remoteExists) {
    var snapshot = JSON.parse(JSON.stringify(DB));
    if (!snapshot._mod) { snapshot._mod = Date.now(); DB._mod = snapshot._mod; try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* ignore */ } }
    return encryptObj(snapshot, c.pass).then(function (env) {
      return writeGist(c.gistId, env, c.token);
    }).then(function (id) {
      c.gistId = id; c.lastMod = snapshot._mod; c.lastSync = Date.now(); saveCfg(c);
      return 'pushed';
    });
  }

  function syncNow(opts) {
    opts = opts || {};
    if (busy) return Promise.resolve('busy');
    var c = cfg();
    if (!c.token || !c.pass) { setState('none'); return Promise.resolve('noconfig'); }
    if (!navigator.onLine) { setState('offline'); return Promise.resolve('offline'); }
    busy = true; setState('busy'); pendingConflict = null;
    var remote = null;
    return Promise.resolve(c.gistId || findGist(c.token)).then(function (id) {
      c.gistId = id || null;
      if (!id) return null;
      return readGist(id, c.token).catch(function (e) { if (e.code === 'NOT_FOUND') { c.gistId = null; return null; } throw e; });
    }).then(function (env) {
      remote = env;
      var lm = localMod(), last = c.lastMod || 0;
      if (!remote) {
        if (isPristine() && !opts.force) { return 'empty'; } // rien à envoyer, rien dans le cloud
        return push(c, false);
      }
      var localChanged = lm > last, remoteChanged = remote.mod !== last;
      if (!localChanged && !remoteChanged) { c.lastSync = Date.now(); saveCfg(c); return 'uptodate'; }
      if (localChanged && !remoteChanged) return push(c, true);
      // le cloud a changé : déchiffrer
      return decryptEnv(remote, c.pass).then(function (data) {
        if (!data || typeof data !== 'object' || !data.tasks) { var e = new Error('BAD_PASS'); e.code = 'BAD_PASS'; throw e; }
        if (!localChanged || isPristine()) {
          if (opts.auto && document.querySelector('.overlay.open')) { return 'deferred'; }
          replaceLocal(data, c); return 'pulled';
        }
        pendingConflict = { remoteData: data, remoteMod: remote.mod, cfg: c };
        return 'conflict';
      });
    }).then(function (res) {
      busy = false;
      if (res === 'conflict') { setState('err', 'Conflit : les deux appareils ont été modifiés.'); if (!opts.auto) openSync(); else toast('⚠ Conflit de synchro : ouvrez ☁ pour choisir'); }
      else if (res === 'deferred') { setState('dirty'); }
      else if (res === 'pushed' || res === 'uptodate' || res === 'empty' || res === 'pulled') { setState(localMod() > (cfg().lastMod || 0) ? 'dirty' : 'ok'); }
      return res;
    }).catch(function (e) {
      busy = false;
      setState(navigator.onLine ? 'err' : 'offline', friendly(e));
      return 'error';
    });
  }

  function resolveConflict(keep) {
    if (!pendingConflict) return;
    var pc = pendingConflict, c = pc.cfg; pendingConflict = null;
    if (keep === 'cloud') { replaceLocal(pc.remoteData, c); return; }
    // garder local : on force l'écrasement du cloud (le cloud est sauvegardé localement avant)
    try { localStorage.setItem('mvg_cloud_avant_ecrasement', JSON.stringify(pc.remoteData)); } catch (e) { /* ignore */ }
    busy = true; setState('busy');
    DB._mod = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* ignore */ }
    push(c, true).then(function () { busy = false; setState('ok'); toast('Cloud mis à jour avec cet appareil ✓'); })
      .catch(function (e) { busy = false; setState('err', friendly(e)); });
  }

  function changed() { // appelé par save()/saveRaw()
    if (!configured()) { return; }
    if (state !== 'busy') setState('dirty');
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow({ auto: true }); }, 5000);
  }

  /* ────────────────────────────────────────────────────────────────────────
     6. Panneau de synchronisation (modale)
     ──────────────────────────────────────────────────────────────────────── */
  function buildPanel() {
    if ($('modal-sync')) return;
    var o = document.createElement('div'); o.className = 'overlay'; o.id = 'modal-sync';
    o.innerHTML = '<div class="modal" style="width:520px"><div class="modal-title">☁ Synchronisation</div><div id="sync-body"></div></div>';
    o.addEventListener('click', function (e) { if (e.target === o) closeSync(); });
    document.body.appendChild(o);
  }
  function openSync() { buildPanel(); renderPanel(); $('modal-sync').classList.add('open'); }
  function closeSync() { var m = $('modal-sync'); if (m) m.classList.remove('open'); }

  function renderPanel() {
    var body = $('sync-body'); if (!body) return;
    var c = cfg(), h = '';
    if (pendingConflict) {
      var pc = pendingConflict;
      h += '<div class="mvg-box"><div style="font-weight:700;color:var(--rd2);margin-bottom:6px">⚠ Conflit : les deux versions ont changé</div>' +
        '<div class="mvg-note">📱 <b>Cet appareil</b> (modifié ' + fmtDT(localMod()) + ')<br>' + esc(summary(DB)) + '</div>' +
        '<div class="mvg-note" style="margin-top:6px">☁ <b>Cloud</b> (modifié ' + fmtDT(pc.remoteMod) + ')<br>' + esc(summary(pc.remoteData)) + '</div></div>' +
        '<div class="mvg-note">Choisissez la version à conserver. L’autre est gardée en secours sur cet appareil.</div>' +
        '<div class="modal-actions"><button class="btn-sm gold" onclick="MVGSync.resolve(\'local\')">Garder cet appareil</button>' +
        '<button class="btn-sm" onclick="MVGSync.resolve(\'cloud\')">Garder le cloud</button></div>';
      body.innerHTML = h; return;
    }
    var statusTxt = { none: 'Non configuré', ok: 'À jour', dirty: 'Modifications à envoyer', busy: 'Synchronisation…', err: lastError || 'Erreur', offline: 'Hors ligne — les modifications sont gardées sur l’appareil' }[state] || '';
    h += '<div class="mvg-box"><div style="font-weight:700">' + esc(statusTxt) + '</div>' +
      '<div class="mvg-note">Dernière synchro : ' + esc(fmtDT(c.lastSync)) + '</div></div>';
    h += '<div class="form-grid">' +
      '<div class="fg full"><label class="lbl">Jeton GitHub (classique, droit « gist »)</label><input class="inp" id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…" value="' + esc(c.token || '') + '"></div>' +
      '<div class="fg full"><label class="lbl">Mot de passe de chiffrement (le même sur tous vos appareils)</label><input class="inp" id="sync-pass" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Choisissez une phrase longue" value="' + esc(c.pass || '') + '"></div></div>';
    h += '<div class="mvg-note" style="margin-top:8px">1) <a href="https://github.com/settings/tokens/new?scopes=gist&description=MVG%20sync" target="_blank" rel="noopener">Créer le jeton</a> (cochez seulement « gist », durée « No expiration »). ' +
      '2) Choisissez un mot de passe : vos données sont chiffrées avant l’envoi, GitHub ne peut pas les lire. <b>Si vous l’oubliez, elles sont irrécupérables</b> (gardez aussi une sauvegarde fichier).</div>';
    h += '<div class="modal-actions"><button class="btn-sm gold" onclick="MVGSync.saveAndSync()">' + (configured() ? 'Enregistrer & synchroniser' : 'Activer la synchro') + '</button>' +
      (configured() ? '<button class="btn-sm" onclick="MVGSync.now()">Synchroniser maintenant</button>' : '') + '</div>';
    h += '<div class="sh" style="margin-top:16px"><span class="sh-title">Sauvegarde fichier</span></div>' +
      '<div class="modal-actions" style="margin-top:6px"><button class="btn-sm" onclick="exportData()">Exporter (.json)</button>' +
      '<label class="btn-sm" style="cursor:pointer">Restaurer…<input type="file" accept=".json,application/json" style="display:none" onchange="importData(event)"></label></div>';
    h += '<div class="modal-actions" style="margin-top:14px"><button class="btn-sm" onclick="MVGSync.close()">Fermer</button>' +
      (configured() ? '<button class="btn-sm danger" style="margin-left:auto" onclick="MVGSync.disconnect()">Déconnecter cet appareil</button>' : '') + '</div>';
    body.innerHTML = h;
  }

  function saveAndSync() {
    var t = ($('sync-token').value || '').trim(), p = ($('sync-pass').value || '');
    if (!t || p.length < 6) { toast('Jeton requis + mot de passe d’au moins 6 caractères'); return; }
    if (!window.crypto || !crypto.subtle) { toast('Chiffrement indisponible : ouvrez l’app en https'); return; }
    var c = cfg();
    if (c.token !== t || c.pass !== p) { c.gistId = null; }
    c.token = t; c.pass = p; saveCfg(c);
    syncNow({}).then(function (r) { if (r === 'pushed') toast('Synchro activée ✓ données envoyées'); else if (r === 'uptodate') toast('Déjà à jour ✓'); else if (r === 'empty') toast('Synchro activée. Rien à envoyer pour l’instant.'); });
  }
  function disconnect() {
    if (!confirm('Déconnecter cet appareil de la synchro ? Vos données restent sur le téléphone et dans le cloud.')) return;
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ }
    setState('none'); toast('Appareil déconnecté');
  }

  function initSyncButton() {
    var right = document.querySelector('.topbar-right'); if (!right || $('mvg-sync-btn')) return;
    var b = document.createElement('button'); b.id = 'mvg-sync-btn'; b.className = 'btn-sm';
    b.innerHTML = '<span class="dot"></span><span class="lab">Sync</span>';
    b.onclick = openSync; right.insertBefore(b, right.firstChild);
    setState(configured() ? (localMod() > (cfg().lastMod || 0) ? 'dirty' : 'ok') : 'none');
  }

  /* ────────────────────────────────────────────────────────────────────────
     7. Ventes rapides (remplace la saisie de MVG_WATCHER.pyw)
     ──────────────────────────────────────────────────────────────────────── */
  var CANAUX = { ventes_store: '🏪 Store MVG', ventes_facebook: '📘 Facebook', ventes_instagram: '📸 Instagram' };
  function vrStore() { if (!DB.ventesRapides) DB.ventesRapides = { ventes_store: [], ventes_facebook: [], ventes_instagram: [], commandes: [] }; return DB.ventesRapides; }
  function buildQuick() {
    if ($('modal-vr')) return;
    var o = document.createElement('div'); o.className = 'overlay'; o.id = 'modal-vr';
    var opts = ''; Object.keys(CANAUX).forEach(function (k) { opts += '<option value="' + k + '">' + CANAUX[k] + '</option>'; });
    o.innerHTML = '<div class="modal" style="width:460px"><div class="modal-title" id="vr-title">Vente rapide</div>' +
      '<input type="hidden" id="vr-cle0"><input type="hidden" id="vr-idx" value="-1">' +
      '<div class="form-grid">' +
      '<div class="fg"><label class="lbl">Canal</label><select class="inp" id="vr-cle">' + opts + '</select></div>' +
      '<div class="fg"><label class="lbl">Date</label><input type="date" class="inp" id="vr-date"></div>' +
      '<div class="fg full"><label class="lbl">Article / Produit</label><input type="text" class="inp" id="vr-article" placeholder="ex: Lamba brodé S"></div>' +
      '<div class="fg full"><label class="lbl">Prix (Ar)</label><input type="number" inputmode="decimal" class="inp" id="vr-prix" placeholder="25000"></div></div>' +
      '<div class="modal-actions"><button class="btn-sm gold" onclick="MVGQuick.save()">Enregistrer</button>' +
      '<button class="btn-sm" onclick="MVGQuick.close()">Annuler</button>' +
      '<button class="btn-sm danger" id="vr-del" style="margin-left:auto;display:none" onclick="MVGQuick.del()">Supprimer</button></div></div>';
    o.addEventListener('click', function (e) { if (e.target === o) closeQuick(); });
    document.body.appendChild(o);
  }
  function openQuick() {
    buildQuick();
    $('vr-title').textContent = 'Nouvelle vente rapide'; $('vr-idx').value = '-1'; $('vr-cle0').value = '';
    $('vr-cle').value = 'ventes_store'; $('vr-date').value = today(); $('vr-article').value = ''; $('vr-prix').value = '';
    $('vr-del').style.display = 'none'; $('modal-vr').classList.add('open');
  }
  function editQuick(cle, i) {
    buildQuick();
    var v = (vrStore()[cle] || [])[i]; if (!v) return;
    $('vr-title').textContent = 'Modifier la vente'; $('vr-idx').value = String(i); $('vr-cle0').value = cle;
    $('vr-cle').value = cle; $('vr-article').value = v.article || '';
    $('vr-prix').value = String(v.prix == null ? '' : v.prix).replace(/\s/g, '').replace(',', '.');
    var d = v.date || today();
    if (d.indexOf('/') > -1) { var p = d.split('/'); d = p[2] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2); }
    $('vr-date').value = d; $('vr-del').style.display = 'inline-block'; $('modal-vr').classList.add('open');
  }
  function closeQuick() { var m = $('modal-vr'); if (m) m.classList.remove('open'); }
  function saveQuick() {
    var cle = $('vr-cle').value, art = $('vr-article').value.trim(), prix = $('vr-prix').value.trim(), date = $('vr-date').value || today();
    if (!art || !prix || isNaN(parseFloat(prix))) { toast('Article et prix (nombre) obligatoires'); return; }
    var s = vrStore(), idx = parseInt($('vr-idx').value, 10), old = $('vr-cle0').value;
    var e = { article: art, date: date, prix: prix, enregistre_le: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    if (idx >= 0 && old) { if (old === cle) { s[cle][idx] = Object.assign({}, s[cle][idx], e); } else { s[old].splice(idx, 1); (s[cle] = s[cle] || []).push(e); } }
    else { (s[cle] = s[cle] || []).push(e); }
    save(); chargerVentesDirectes(); closeQuick(); toast('Vente enregistrée ✓');
  }
  function delQuick() {
    var idx = parseInt($('vr-idx').value, 10), old = $('vr-cle0').value;
    if (idx < 0 || !old || !confirm('Supprimer cette vente ?')) return;
    vrStore()[old].splice(idx, 1); save(); chargerVentesDirectes(); closeQuick(); toast('Vente supprimée');
  }

  /* ────────────────────────────────────────────────────────────────────────
     8. Sauvegarde fichier adaptée à l'iPhone (feuille de partage → Fichiers)
     ──────────────────────────────────────────────────────────────────────── */
  function exportBackup() {
    var name = 'mvg_v5_' + today() + '.json';
    var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    try {
      var file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') fallback(); });
        return;
      }
    } catch (e) { /* ignore */ }
    fallback();
    function fallback() { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }
  }
  window.exportData = exportBackup;

  /* ────────────────────────────────────────────────────────────────────────
     9. Hors ligne (service worker) + aide d'installation iOS
     ──────────────────────────────────────────────────────────────────────── */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    var had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (had) toast('Mise à jour installée — elle s’applique au prochain lancement', 5000); had = true; });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* ignore */ });
  }
  function iosBanner() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || isStandalone() || localStorage.getItem('mvg_ios_hint')) return;
    var d = document.createElement('div'); d.className = 'mvg-ios-banner';
    d.innerHTML = '<b>Installer MVG sur l’iPhone</b><br>Touchez <b>Partager</b> (carré avec flèche) puis <b>« Sur l’écran d’accueil »</b>. L’app marche alors hors ligne et vos données sont mieux protégées.' +
      '<div class="modal-actions" style="margin-top:8px"><button class="btn-sm gold" id="mvg-ios-ok">Compris</button></div>';
    document.body.appendChild(d);
    $('mvg-ios-ok').onclick = function () { d.remove(); try { localStorage.setItem('mvg_ios_hint', '1'); } catch (e) { /* ignore */ } };
  }

  /* ────────────────────────────────────────────────────────────────────────
     Démarrage
     ──────────────────────────────────────────────────────────────────────── */
  window.MVGSync = { changed: changed, now: function () { return syncNow({}); }, open: openSync, close: closeSync, saveAndSync: saveAndSync, resolve: resolveConflict, disconnect: disconnect };
  window.MVGQuick = { open: openQuick, edit: editQuick, close: closeQuick, save: saveQuick, del: delQuick };

  initDrawer(); initSyncButton(); initSW();
  setTimeout(iosBanner, 2500);
  try { chargerVentesDirectes(); } catch (e) { /* ignore */ }
  if (configured()) setTimeout(function () { syncNow({ auto: true }); }, 1200);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && configured()) syncNow({ auto: true }); });
  window.addEventListener('online', function () { if (configured()) syncNow({ auto: true }); else setState('none'); });
  window.addEventListener('offline', function () { if (configured()) setState('offline'); });
  setInterval(function () { if (!document.hidden && configured()) syncNow({ auto: true }); }, 5 * 60 * 1000);
})();
