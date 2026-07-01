/*
  Sincronizacion opcional con Google Drive (appDataFolder).
  Para activarla:
    1. Despliega la app en una URL https fija (ej. GitHub Pages).
    2. Crea un OAuth Client ID (tipo "Web application") en Google Cloud Console,
       anadiendo esa URL como "Authorized JavaScript origin".
    3. Pega el Client ID abajo, en CLIENT_ID.
  Mientras CLIENT_ID este vacio, esta funcionalidad permanece desactivada
  y la app funciona solo con localStorage.
*/
window.DriveSync = (function () {
  'use strict';

  var CLIENT_ID = ''; // <-- PON AQUI TU CLIENT ID DE GOOGLE
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var FILE_NAME = 'control-horas.json';
  var API_BASE = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

  var tokenClient = null;
  var accessToken = null;
  var fileId = null;
  var uploadTimer = null;
  var onDataMerged = function () {};
  var driveBtn = null;

  function init(opts) {
    if (!CLIENT_ID) return; // no configurado: no hacer nada
    onDataMerged = (opts && opts.onDataMerged) || onDataMerged;
    driveBtn = document.getElementById('driveBtn');
    if (!driveBtn) return;
    driveBtn.hidden = false;
    driveBtn.addEventListener('click', onButtonClick);
    loadGis();
  }

  function loadGis() {
    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = setupTokenClient;
    document.head.appendChild(script);
  }

  function setupTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: onToken
    });
  }

  function onButtonClick() {
    if (!tokenClient) return;
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }

  function onToken(resp) {
    if (resp.error) return;
    accessToken = resp.access_token;
    driveBtn.classList.add('connected');
    syncOnConnect();
  }

  function authHeaders(extra) {
    var h = { Authorization: 'Bearer ' + accessToken };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function findFileId() {
    var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    return fetch(API_BASE + '?spaces=appDataFolder&q=' + q + '&fields=files(id,name)', {
      headers: authHeaders()
    }).then(function (r) { return r.json(); }).then(function (json) {
      var files = json.files || [];
      fileId = files.length ? files[0].id : null;
      return fileId;
    });
  }

  function downloadBackup() {
    if (!fileId) return Promise.resolve(null);
    return fetch(API_BASE + '/' + fileId + '?alt=media', {
      headers: authHeaders()
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  function createBackup(data) {
    var metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
    var boundary = 'ctrlhoras_boundary';
    var body =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) + '\r\n' +
      '--' + boundary + '--';

    return fetch(UPLOAD_BASE + '?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'multipart/related; boundary=' + boundary }),
      body: body
    }).then(function (r) { return r.json(); }).then(function (json) {
      fileId = json.id;
    });
  }

  function updateBackup(data) {
    return fetch(UPLOAD_BASE + '/' + fileId + '?uploadType=media', {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
  }

  function uploadBackup(data) {
    if (!accessToken) return;
    var ready = fileId ? Promise.resolve(fileId) : findFileId();
    ready.then(function () {
      return fileId ? updateBackup(data) : createBackup(data);
    });
  }

  function syncOnConnect() {
    findFileId().then(downloadBackup).then(function (remote) {
      if (!remote) {
        uploadBackup(readLocal());
        return;
      }
      var local = readLocal();
      var merged = Object.assign({}, remote, local); // los cambios locales ganan en conflicto
      writeLocal(merged);
      uploadBackup(merged);
      onDataMerged();
    });
  }

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem('controlHorasData')) || {};
    } catch (e) { return {}; }
  }

  function writeLocal(data) {
    localStorage.setItem('controlHorasData', JSON.stringify(data));
  }

  function queueUpload(data) {
    if (!accessToken) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () { uploadBackup(data); }, 800);
  }

  return { init: init, queueUpload: queueUpload };
})();
