(function () {
  'use strict';

  var STORAGE_KEY = 'controlHorasData';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var today = new Date();
  var state = {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(), // 0-indexed
    selectedKey: null
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    bindEvents();
    render();
    if (window.DriveSync && typeof window.DriveSync.init === 'function') {
      window.DriveSync.init({ onDataMerged: onExternalDataMerged });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    }
  });

  function cacheEls() {
    els.weekTotal = document.getElementById('weekTotal');
    els.monthTotal = document.getElementById('monthTotal');
    els.yearTotal = document.getElementById('yearTotal');
    els.monthLabel = document.getElementById('monthLabel');
    els.grid = document.getElementById('grid');
    els.prevMonth = document.getElementById('prevMonth');
    els.nextMonth = document.getElementById('nextMonth');
    els.modalOverlay = document.getElementById('modalOverlay');
    els.modalDate = document.getElementById('modalDate');
    els.inicioInput = document.getElementById('inicioInput');
    els.finInput = document.getElementById('finInput');
    els.modalError = document.getElementById('modalError');
    els.saveBtn = document.getElementById('saveBtn');
    els.deleteBtn = document.getElementById('deleteBtn');
    els.cancelBtn = document.getElementById('cancelBtn');
  }

  function bindEvents() {
    els.prevMonth.addEventListener('click', function () { changeMonth(-1); });
    els.nextMonth.addEventListener('click', function () { changeMonth(1); });
    els.cancelBtn.addEventListener('click', closeModal);
    els.modalOverlay.addEventListener('click', function (e) {
      if (e.target === els.modalOverlay) closeModal();
    });
    els.saveBtn.addEventListener('click', onSave);
    els.deleteBtn.addEventListener('click', onDelete);
  }

  function onExternalDataMerged() {
    render();
  }

  // ---------- data ----------
  function loadData() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (window.DriveSync && typeof window.DriveSync.queueUpload === 'function') {
      window.DriveSync.queueUpload(data);
    }
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

  function minutesFromTime(str) {
    var parts = str.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function formatMinutes(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  // ---------- totals ----------
  function sumRange(data, startKey, endKey) {
    var total = 0;
    for (var key in data) {
      if (key >= startKey && key <= endKey && data[key] && typeof data[key].mins === 'number') {
        total += data[key].mins;
      }
    }
    return total;
  }

  function currentWeekRange() {
    var now = new Date();
    var dow = (now.getDay() + 6) % 7; // Monday = 0
    var monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate()),
      end: dateKey(sunday.getFullYear(), sunday.getMonth(), sunday.getDate())
    };
  }

  function renderCounters() {
    var data = loadData();
    var week = currentWeekRange();
    var weekMins = sumRange(data, week.start, week.end);

    var monthStart = dateKey(state.viewYear, state.viewMonth, 1);
    var monthEnd = dateKey(state.viewYear, state.viewMonth, daysInMonth(state.viewYear, state.viewMonth));
    var monthMins = sumRange(data, monthStart, monthEnd);

    var yearStart = state.viewYear + '-01-01';
    var yearEnd = state.viewYear + '-12-31';
    var yearMins = sumRange(data, yearStart, yearEnd);

    els.weekTotal.textContent = formatMinutes(weekMins);
    els.monthTotal.textContent = formatMinutes(monthMins);
    els.yearTotal.textContent = formatMinutes(yearMins);
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  // ---------- calendar ----------
  function changeMonth(delta) {
    state.viewMonth += delta;
    if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
    if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
    render();
  }

  function render() {
    els.monthLabel.textContent = MESES[state.viewMonth] + ' ' + state.viewYear;
    renderGrid();
    renderCounters();
  }

  function renderGrid() {
    var data = loadData();
    els.grid.innerHTML = '';

    var year = state.viewYear, month = state.viewMonth;
    var firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    var totalDaysInMonth = daysInMonth(year, month);
    var prevMonth = month === 0 ? 11 : month - 1;
    var prevYear = month === 0 ? year - 1 : year;
    var daysInPrev = daysInMonth(prevYear, prevMonth);

    var totalCells = Math.ceil((firstDow + totalDaysInMonth) / 7) * 7;
    var todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

    for (var i = 0; i < totalCells; i++) {
      var cell = document.createElement('button');
      cell.className = 'day-cell';
      var y, m, d, outside = false;

      if (i < firstDow) {
        d = daysInPrev - firstDow + i + 1;
        m = prevMonth; y = prevYear; outside = true;
      } else if (i < firstDow + totalDaysInMonth) {
        d = i - firstDow + 1;
        m = month; y = year;
      } else {
        d = i - (firstDow + totalDaysInMonth) + 1;
        m = month === 11 ? 0 : month + 1;
        y = month === 11 ? year + 1 : year;
        outside = true;
      }

      var key = dateKey(y, m, d);
      if (outside) cell.classList.add('outside');
      if (key === todayKey) cell.classList.add('today');

      var numEl = document.createElement('span');
      numEl.className = 'day-num';
      numEl.textContent = d;
      cell.appendChild(numEl);

      var entry = data[key];
      if (entry && typeof entry.mins === 'number') {
        cell.classList.add('has-hours');
        var hoursEl = document.createElement('span');
        hoursEl.className = 'day-hours';
        hoursEl.textContent = formatMinutes(entry.mins);
        cell.appendChild(hoursEl);
      }

      (function (y2, m2, d2) {
        cell.addEventListener('click', function () { openModal(y2, m2, d2); });
      })(y, m, d);

      els.grid.appendChild(cell);
    }
  }

  // ---------- modal ----------
  function openModal(y, m, d) {
    var key = dateKey(y, m, d);
    state.selectedKey = key;
    var data = loadData();
    var entry = data[key];

    els.modalDate.textContent = d + ' de ' + MESES[m] + ' ' + y;
    els.inicioInput.value = entry ? entry.inicio : '';
    els.finInput.value = entry ? entry.fin : '';
    els.modalError.hidden = true;
    els.deleteBtn.hidden = !entry;

    els.modalOverlay.hidden = false;
  }

  function closeModal() {
    els.modalOverlay.hidden = true;
    state.selectedKey = null;
  }

  function onSave() {
    var inicio = els.inicioInput.value;
    var fin = els.finInput.value;

    if (!inicio || !fin) {
      showError('Indica hora de inicio y hora de fin.');
      return;
    }

    var mins = minutesFromTime(fin) - minutesFromTime(inicio);
    if (mins <= 0) {
      showError('La hora de fin debe ser posterior a la de inicio.');
      return;
    }

    var data = loadData();
    data[state.selectedKey] = { inicio: inicio, fin: fin, mins: mins };
    saveData(data);
    closeModal();
    render();
  }

  function onDelete() {
    var data = loadData();
    delete data[state.selectedKey];
    saveData(data);
    closeModal();
    render();
  }

  function showError(msg) {
    els.modalError.textContent = msg;
    els.modalError.hidden = false;
  }
})();
