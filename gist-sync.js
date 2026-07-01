/*
  Backup/sincronizacion via un Gist privado de GitHub (no depende de Google/Gmail).
  Requiere un Personal Access Token (classic) con el scope "gist" unicamente.
  Crealo en: https://github.com/settings/tokens/new?scopes=gist&description=Control+Horas
  El token se guarda solo en localStorage de este dispositivo y se usa exclusivamente
  para leer/escribir un Gist privado llamado "control-horas.json".
*/
window.GistSync = (function () {
  'use strict';

  var TOKEN_KEY = 'ghToken';
  var GIST_ID_KEY = 'ghGistId';
  var FILE_NAME = 'control-horas.json';
  var GIST_DESC = 'control-horas-backup';
  var API_BASE = 'https://api.github.com';
  var LOCAL_DATA_KEY = 'controlHorasData';

  var uploadTimer = null;
  var syncing = false;
  var onDataMerged = function () {};
  var btn = null;
  var pressTimer = null;

  function init(opts) {
    onDataMerged = (opts && opts.onDataMerged) || onDataMerged;
    btn = document.getElementById('syncBtn');
    if (!btn) return;
    btn.hidden = false;
    updateButtonState();

    btn.addEventListener('click', onButtonClick);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); onDisconnectRequest(); });
    btn.addEventListener('touchstart', function () {
      pressTimer = setTimeout(onDisconnectRequest, 700);
    });
    btn.addEventListener('touchend', function () { clearTimeout(pressTimer); });
    btn.addEventListener('touchmove', function () { clearTimeout(pressTimer); });

    if (getToken()) doSync();
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }

  function updateButtonState() {
    if (!btn) return;
    btn.classList.toggle('connected', !!getToken());
    btn.title = getToken()
      ? 'Sincronizar ahora con GitHub (mantén pulsado para desconectar)'
      : 'Conectar backup con GitHub';
  }

  function onButtonClick() {
    if (!getToken()) {
      var token = prompt('Pega tu Personal Access Token de GitHub (scope "gist"):');
      if (!token) return;
      localStorage.setItem(TOKEN_KEY, token.trim());
      updateButtonState();
      doSync();
    } else {
      doSync();
    }
  }

  function onDisconnectRequest() {
    if (!getToken()) return;
    if (confirm('¿Desconectar el backup de GitHub en este dispositivo?')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(GIST_ID_KEY);
      updateButtonState();
    }
  }

  function authHeaders(extra) {
    var h = {
      Authorization: 'Bearer ' + getToken(),
      Accept: 'application/vnd.github+json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function findGistId() {
    var stored = localStorage.getItem(GIST_ID_KEY);
    if (stored) return Promise.resolve(stored);

    return fetch(API_BASE + '/gists', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var found = Array.isArray(list) && list.find(function (g) { return g.description === GIST_DESC; });
        if (found) {
          localStorage.setItem(GIST_ID_KEY, found.id);
          return found.id;
        }
        return null;
      });
  }

  function createGist(data) {
    var body = {
      description: GIST_DESC,
      public: false,
      files: {}
    };
    body.files[FILE_NAME] = { content: JSON.stringify(data) };

    return fetch(API_BASE + '/gists', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (json) {
      localStorage.setItem(GIST_ID_KEY, json.id);
      return json.id;
    });
  }

  function downloadGist(id) {
    return fetch(API_BASE + '/gists/' + id, { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (!json || !json.files || !json.files[FILE_NAME]) return null;
        try { return JSON.parse(json.files[FILE_NAME].content); } catch (e) { return null; }
      });
  }

  function updateGist(id, data) {
    var body = { files: {} };
    body.files[FILE_NAME] = { content: JSON.stringify(data) };
    return fetch(API_BASE + '/gists/' + id, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_DATA_KEY)) || {}; } catch (e) { return {}; }
  }

  function writeLocal(data) {
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
  }

  function doSync() {
    if (syncing || !getToken()) return;
    syncing = true;

    findGistId().then(function (id) {
      if (!id) return createGist(readLocal()).then(function () { return null; });
      return downloadGist(id).then(function (remote) {
        var local = readLocal();
        var merged = Object.assign({}, remote || {}, local); // los cambios locales ganan en conflicto
        writeLocal(merged);
        onDataMerged();
        return updateGist(id, merged);
      });
    }).catch(function () {
      // token invalido o sin conexion: no se hace nada, se reintentara en el proximo guardado
    }).then(function () {
      syncing = false;
    });
  }

  function queueUpload(data) {
    if (!getToken()) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () { doSync(); }, 800);
  }

  return { init: init, queueUpload: queueUpload };
})();
