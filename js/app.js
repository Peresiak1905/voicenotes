// =====================
// KONFIGURACJA
// =====================

const DEFAULT_CATEGORIES = ['Zadania', 'Pomysły', 'Kontakty', 'Zakupy', 'Zdrowie', 'Różne'];

// Słowa kluczowe do klasyfikacji
const KEYWORDS = {
  'Zadania':   ['zadzwonić', 'sprawdzić', 'wysłać', 'kupić', 'zrobić', 'przygotować', 'napisać', 'umówić', 'zamówić', 'dostarczyć', 'potwierdzić', 'sprawdz', 'przypomnij', 'harmonogram', 'termin', 'deadline', 'spotkanie', 'zadanie', 'praca'],
  'Pomysły':   ['pomysł', 'może', 'można', 'warto', 'fajnie', 'dobry', 'świetny', 'pomyśleć', 'zastanowić', 'propozycja', 'koncepcja', 'plan', 'projekt', 'nowy'],
  'Kontakty':  ['telefon', 'tel', 'email', 'mail', 'kontakt', 'pan', 'pani', 'imię', 'nazwisko', 'firma', 'numer', 'adres'],
  'Zakupy':    ['kupić', 'zamówić', 'sklep', 'cena', 'koszt', 'sztuk', 'materiał', 'dostawa', 'faktura', 'zakup'],
  'Zdrowie':   ['lekarz', 'wizyta', 'lek', 'apteka', 'zdrowie', 'choroba', 'ból', 'badanie', 'recepta'],
};

// =====================
// STAN APLIKACJI
// =====================

let state = {
  notes: [],
  categories: [...DEFAULT_CATEGORIES],
  selectedCat: null,
  currentFilter: 'Wszystkie',
  isRecording: false,
};

let recognition = null;
let timerInterval = null;
let timerSeconds = 0;
let waveAnimFrame = null;
let currentTranscript = '';
let currentInterim = '';

// =====================
// INIT
// =====================

function init() {
  loadFromStorage();
  renderDateChip();
  renderSidebar();
  renderCatPills();
  renderFilters();
  renderNotes();
  updateStats();
  bindEvents();
  checkSpeechSupport();
}

function checkSpeechSupport() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showError('Twoja przeglądarka nie obsługuje Web Speech API. Użyj Google Chrome.');
  }
}

function loadFromStorage() {
  try {
    const notes = localStorage.getItem('vn_notes');
    const cats = localStorage.getItem('vn_cats');
    if (notes) state.notes = JSON.parse(notes);
    if (cats) state.categories = JSON.parse(cats);
  } catch(e) {}
}

function saveToStorage() {
  localStorage.setItem('vn_notes', JSON.stringify(state.notes));
  localStorage.setItem('vn_cats', JSON.stringify(state.categories));
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('record-btn').addEventListener('click', toggleRecord);
  document.getElementById('add-cat-btn').addEventListener('click', openAddCat);
  document.getElementById('modal-cancel').addEventListener('click', closeAddCat);
  document.getElementById('modal-confirm').addEventListener('click', confirmAddCat);
  document.getElementById('new-cat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddCat();
    if (e.key === 'Escape') closeAddCat();
  });
  document.getElementById('search-input').addEventListener('input', e => doSearch(e.target.value));
}

// =====================
// NAWIGACJA
// =====================

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
  if (tab === 'notes') renderNotes();
}

// =====================
// UI
// =====================

function renderDateChip() {
  const d = new Date();
  document.getElementById('date-chip').textContent =
    d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function updateStats() {
  const today = new Date().toDateString();
  document.getElementById('s-total').textContent = state.notes.length;
  document.getElementById('s-pending').textContent = state.notes.filter(n => n.pending).length;
  document.getElementById('s-today').textContent = state.notes.filter(n => new Date(n.ts).toDateString() === today).length;
}

function catColor(cat) {
  const idx = state.categories.indexOf(cat);
  return idx >= 0 ? idx % 8 : 5;
}

// =====================
// SIDEBAR
// =====================

function renderSidebar() {
  const list = document.getElementById('sidebar-cat-list');
  list.innerHTML = '';
  state.categories.forEach(cat => {
    const count = state.notes.filter(n => n.category === cat).length;
    const item = document.createElement('div');
    item.className = 'cat-item' + (state.currentFilter === cat ? ' active' : '');
    item.innerHTML = '<div class="cat-dot dot-' + catColor(cat) + '"></div><span>' + cat + '</span><span class="cat-count">' + count + '</span>';
    item.addEventListener('click', () => {
      state.currentFilter = cat;
      switchTab('notes');
      renderSidebar(); renderFilters(); renderNotes();
    });
    list.appendChild(item);
  });
}

// =====================
// KATEGORIE
// =====================

function renderCatPills() {
  const container = document.getElementById('cat-pills');
  container.innerHTML = '';
  state.categories.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = 'cat-pill' + (state.selectedCat === cat ? ' active' : '');
    pill.textContent = cat;
    pill.addEventListener('click', () => {
      state.selectedCat = state.selectedCat === cat ? null : cat;
      renderCatPills();
    });
    container.appendChild(pill);
  });
}

function openAddCat() {
  document.getElementById('add-cat-modal').classList.add('open');
  document.getElementById('new-cat-input').focus();
}

function closeAddCat() {
  document.getElementById('add-cat-modal').classList.remove('open');
  document.getElementById('new-cat-input').value = '';
}

function confirmAddCat() {
  const val = document.getElementById('new-cat-input').value.trim();
  if (val && !state.categories.includes(val)) {
    state.categories.push(val);
    saveToStorage();
    renderCatPills(); renderSidebar(); renderFilters();
  }
  closeAddCat();
}

// =====================
// NAGRYWANIE — WEB SPEECH API
// =====================

function toggleRecord() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  hideError();
  currentTranscript = '';
  currentInterim = '';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'pl-PL';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isRecording = true;
    setRecordUI('recording');
    startTimer();
    startWaveform();
  };

  recognition.onresult = (event) => {
    let final = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) { final += t + ' '; }
      else { interim += t; }
    }
    currentTranscript += final;
    currentInterim = interim;
    const preview = (currentTranscript + interim).trim();
    const label = document.getElementById('record-status');
    if (preview) {
      label.textContent = preview.length > 80 ? '...' + preview.slice(-80) : preview;
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed') {
      showError('Brak dostępu do mikrofonu. Zezwól przeglądarce na dostęp i spróbuj ponownie.');
    } else if (event.error !== 'aborted') {
      showError('Błąd: ' + event.error);
    }
    state.isRecording = false;
    setRecordUI('idle');
    clearInterval(timerInterval);
    cancelAnimationFrame(waveAnimFrame);
    document.getElementById('waveform').classList.remove('visible');
    resetTimer();
  };

  recognition.onend = () => {
    if (state.isRecording) {
      try { recognition.start(); } catch(e) {}
    }
  };

  try {
    recognition.start();
  } catch(e) {
    showError('Nie można uruchomić rozpoznawania mowy: ' + e.message);
  }
}

function stopRecording() {
  state.isRecording = false;

  if (recognition) {
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }

  clearInterval(timerInterval);
  cancelAnimationFrame(waveAnimFrame);
  document.getElementById('waveform').classList.remove('visible');
  setRecordUI('idle');
  resetTimer();

  const text = (currentTranscript + ' ' + currentInterim).trim();
  if (text) {
    const category = state.selectedCat || classifyText(text);
    const pending = !state.selectedCat && category === 'Różne';
    addNote(text, category, pending);
    state.selectedCat = null;
    renderCatPills();
  } else {
    showError('Nic nie zostało nagrane lub mowa nie została rozpoznana.');
  }
}

// =====================
// KLASYFIKACJA (lokalna)
// =====================

function classifyText(text) {
  const lower = text.toLowerCase();
  let bestCat = 'Różne';
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(KEYWORDS)) {
    if (!state.categories.includes(cat)) continue;
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) { bestScore = score; bestCat = cat; }
  }
  return bestCat;
}

// =====================
// NOTATKI
// =====================

function addNote(text, category, pending) {
  const note = { id: Date.now() + Math.random(), ts: new Date().toISOString(), text, category, pending };
  state.notes.push(note);
  saveToStorage(); updateStats(); renderSidebar(); renderFilters();
}

function renderNotes(filter) {
  const f = filter !== undefined ? filter : state.currentFilter;
  const list = document.getElementById('notes-list');
  let shown = [...state.notes].reverse();
  if (f !== 'Wszystkie') shown = shown.filter(n => n.category === f);
  if (!shown.length) { list.innerHTML = '<div class="empty-state">Brak notatek' + (f !== 'Wszystkie' ? ' w kategorii ' + f : '') + '</div>'; return; }
  list.innerHTML = '';
  shown.forEach(note => list.appendChild(buildNoteCard(note)));
}

function buildNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card' + (note.pending ? ' pending' : '');
  const d = new Date(note.ts);
  const timeStr = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  const ci = catColor(note.category);

  card.innerHTML =
    '<div class="note-meta">' +
      '<span class="note-time">' + timeStr + ' · ' + dateStr + '</span>' +
      '<span class="note-badge badge-' + ci + '">' + note.category + '</span>' +
      (note.pending ? '<span class="pending-tag">⚠ do weryfikacji</span>' : '') +
    '</div>' +
    '<div class="note-text">' + escHtml(note.text) + '</div>' +
    '<textarea class="note-textarea" rows="3" style="display:none">' + escHtml(note.text) + '</textarea>' +
    '<div class="note-actions">' +
      '<select class="note-select"></select>' +
      '<button class="note-btn edit-btn">Edytuj</button>' +
      (note.pending ? '<button class="note-btn ok ok-btn">✓ OK</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="note-btn del del-btn">Usuń</button>' +
    '</div>';

  const sel = card.querySelector('.note-select');
  state.categories.forEach(cat => {
    const o = document.createElement('option');
    o.value = cat; o.textContent = cat;
    if (cat === note.category) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    note.category = sel.value; note.pending = false;
    saveToStorage(); updateStats(); renderSidebar(); renderFilters(); renderNotes();
  });

  const editBtn = card.querySelector('.edit-btn');
  const textEl = card.querySelector('.note-text');
  const textarea = card.querySelector('.note-textarea');
  editBtn.addEventListener('click', () => {
    if (textarea.style.display === 'none') {
      textEl.style.display = 'none'; textarea.style.display = 'block';
      editBtn.textContent = 'Zapisz'; textarea.focus();
    } else {
      note.text = textarea.value; textEl.innerHTML = escHtml(textarea.value);
      textEl.style.display = 'block'; textarea.style.display = 'none';
      editBtn.textContent = 'Edytuj'; saveToStorage();
    }
  });

  const okBtn = card.querySelector('.ok-btn');
  if (okBtn) okBtn.addEventListener('click', () => {
    note.pending = false; saveToStorage(); updateStats(); renderSidebar(); renderNotes();
  });

  card.querySelector('.del-btn').addEventListener('click', () => {
    state.notes = state.notes.filter(n => n.id !== note.id);
    saveToStorage(); updateStats(); renderSidebar(); renderFilters(); renderNotes();
  });

  return card;
}

// =====================
// FILTRY & SZUKAJ
// =====================

function renderFilters() {
  const row = document.getElementById('filter-row');
  row.innerHTML = '';
  ['Wszystkie', ...state.categories].forEach(f => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (state.currentFilter === f ? ' active' : '');
    chip.textContent = f;
    chip.addEventListener('click', () => { state.currentFilter = f; renderFilters(); renderNotes(); renderSidebar(); });
    row.appendChild(chip);
  });
}

function doSearch(q) {
  const res = document.getElementById('search-results');
  const query = q.trim().toLowerCase();
  if (!query) { res.innerHTML = '<div class="empty-state">Wpisz frazę aby przeszukać notatki</div>'; return; }
  const found = state.notes.filter(n => n.text.toLowerCase().includes(query) || n.category.toLowerCase().includes(query)).reverse();
  if (!found.length) { res.innerHTML = '<div class="empty-state">Brak wyników dla "' + escHtml(q) + '"</div>'; return; }
  res.innerHTML = '';
  found.forEach(n => res.appendChild(buildNoteCard(n)));
}

// =====================
// TIMER & WAVEFORM
// =====================

function startTimer() {
  timerSeconds = 0;
  document.getElementById('timer').textContent = '0:00';
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    document.getElementById('timer').textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}

function resetTimer() { document.getElementById('timer').textContent = '0:00'; }

function startWaveform() {
  const canvas = document.getElementById('wave-canvas');
  const ctx = canvas.getContext('2d');
  document.getElementById('waveform').classList.add('visible');
  function draw() {
    waveAnimFrame = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 30;
    for (let i = 0; i < bars; i++) {
      const h = 4 + Math.random() * (canvas.height - 8);
      const x = i * (canvas.width / bars);
      const y = (canvas.height - h) / 2;
      ctx.fillStyle = '#e05a2b';
      ctx.globalAlpha = 0.4 + Math.random() * 0.6;
      ctx.beginPath(); ctx.roundRect(x, y, 5, h, 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

function setRecordUI(mode) {
  const btn = document.getElementById('record-btn');
  const ring = document.getElementById('record-ring');
  const mic = document.getElementById('icon-mic');
  const stop = document.getElementById('icon-stop');
  const label = document.getElementById('record-status');
  btn.className = 'record-btn ' + mode;
  ring.className = 'record-ring ' + mode;
  mic.style.display = mode === 'idle' ? 'block' : 'none';
  stop.style.display = mode === 'recording' ? 'block' : 'none';
  document.getElementById('icon-spinner').style.display = 'none';
  if (mode === 'idle') { label.textContent = 'Kliknij aby nagrać'; label.className = 'record-status'; }
  else { label.textContent = 'Nagrywam... kliknij aby zakończyć'; label.className = 'record-status recording'; }
}

function showError(msg) { const b = document.getElementById('error-box'); b.textContent = msg; b.style.display = 'block'; }
function hideError() { document.getElementById('error-box').style.display = 'none'; }
function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

init();
