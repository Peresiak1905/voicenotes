// =====================
// WHISPR 2.0
// =====================

const MAIN_CATEGORIES = [
  { id: 'praca',   name: 'Praca',    color: 0 },
  { id: 'dom',     name: 'Dom',      color: 1 },
  { id: 'ludzie',  name: 'Ludzie',   color: 2 },
  { id: 'zdrowie', name: 'Zdrowie',  color: 3 },
  { id: 'finanse', name: 'Finanse',  color: 4 },
  { id: 'rozwoj',  name: 'Rozwój',   color: 5 },
];

const KEYWORDS = {
  'praca':   ['praca','zadanie','zadzwonić','sprawdzić','wysłać','zamówić','harmonogram','termin','spotkanie','szef','kolega','projekt','raport','faktura','klient','dostawa','materiał'],
  'dom':     ['dom','mieszkanie','zakupy','sklep','kupić','sprzątanie','naprawa','rachun','czynsz','gotowanie','jedzenie','przepis'],
  'ludzie':  ['mama','tata','brat','siostra','żona','mąż','dziewczyna','chłopak','znajomy','urodziny','rocznica','imieniny','powiedział','powiedziała'],
  'zdrowie': ['lekarz','wizyta','lek','apteka','zdrowie','choroba','ból','badanie','recepta','szpital','tabletka'],
  'finanse': ['złoty','zł','pieniądze','wydatek','przelew','bank','konto','kredyt','faktura','rachunek','płatność','cena','koszt'],
  'rozwoj':  ['pomysł','kurs','książka','nauka','cel','plan','rozwój','inspiracja','podcast','szkolenie'],
};

let state = {
  notes: [],
  subcategories: {},
  selectedCat: null,
  currentSort: 'newest',
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
  renderDate();
  renderCatPillsHome();
  renderAccordion();
  bindEvents();
  checkSupport();
}

function checkSupport() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showError('Użyj Safari lub Chrome — ta przeglądarka nie obsługuje nagrywania głosu.');
  }
}

function loadFromStorage() {
  try {
    const n = localStorage.getItem('whispr_notes');
    const s = localStorage.getItem('whispr_subcats');
    if (n) state.notes = JSON.parse(n);
    if (s) state.subcategories = JSON.parse(s);
  } catch(e) {}
}

function save() {
  localStorage.setItem('whispr_notes', JSON.stringify(state.notes));
  localStorage.setItem('whispr_subcats', JSON.stringify(state.subcategories));
}

// =====================
// EVENTS
// =====================

function bindEvents() {
  // Nawigacja
  document.querySelectorAll('.bnav, .back-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // Wyszukiwarka na home — otwiera tab search
  document.getElementById('home-search-input').addEventListener('focus', () => switchTab('search'));
  document.getElementById('search-bar-home').addEventListener('click', () => switchTab('search'));

  // Nagrywanie
  document.getElementById('record-btn').addEventListener('click', toggleRecord);

  // Wyszukiwanie głosowe
  document.getElementById('voice-search-btn').addEventListener('click', startVoiceSearch);

  // Wyszukiwanie tekstowe
  document.getElementById('search-full-input').addEventListener('input', e => doSearch(e.target.value));

  // Eksport
  document.getElementById('export-btn').addEventListener('click', exportNotes);

  // Sort
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.currentSort = b.dataset.sort;
      renderAccordion();
    });
  });

  // Modal podkategorii
  document.getElementById('subcategory-cancel').addEventListener('click', () => {
    document.getElementById('subcategory-modal').style.display = 'none';
  });
  document.getElementById('subcategory-confirm').addEventListener('click', confirmSubcategory);
  document.getElementById('subcategory-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSubcategory();
    if (e.key === 'Escape') document.getElementById('subcategory-modal').style.display = 'none';
  });
}

// =====================
// NAWIGACJA
// =====================

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('[data-tab="' + tab + '"]').forEach(b => {
    if (b.classList.contains('bnav')) b.classList.add('active');
  });
  if (tab === 'notes') renderAccordion();
  if (tab === 'search') setTimeout(() => document.getElementById('search-full-input').focus(), 100);
}

// =====================
// UI
// =====================

function renderDate() {
  const d = new Date();
  document.getElementById('home-date').textContent =
    d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

function getCatColor(catId) {
  const cat = MAIN_CATEGORIES.find(c => c.id === catId);
  return cat ? cat.color : 5;
}

function getCatName(catId) {
  const cat = MAIN_CATEGORIES.find(c => c.id === catId);
  return cat ? cat.name : catId;
}

// =====================
// KATEGORIE NA HOME
// =====================

function renderCatPillsHome() {
  const c = document.getElementById('cat-pills-home');
  c.innerHTML = '';
  MAIN_CATEGORIES.forEach(cat => {
    const p = document.createElement('button');
    p.className = 'cat-pill-home' + (state.selectedCat === cat.id ? ' active' : '');
    p.textContent = cat.name;
    p.addEventListener('click', () => {
      state.selectedCat = state.selectedCat === cat.id ? null : cat.id;
      renderCatPillsHome();
    });
    c.appendChild(p);
  });
}

// =====================
// NAGRYWANIE
// =====================

function toggleRecord() {
  state.isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  hideError();
  currentTranscript = '';
  currentInterim = '';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'pl-PL';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isRecording = true;
    setRecordUI('recording');
    startTimer();
    startWave();
  };

  recognition.onresult = (event) => {
    let fin = '', int = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) fin += t + ' ';
      else int += t;
    }
    currentTranscript += fin;
    currentInterim = int;
    const preview = (currentTranscript + int).trim();
    const hint = document.getElementById('record-hint');
    hint.textContent = preview.length > 55 ? '...' + preview.slice(-55) : preview || 'Nagrywam...';

    const lb = document.getElementById('live-box');
    const lt = document.getElementById('live-text');
    if (preview) { lb.style.display = 'block'; lt.textContent = preview; }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') showError('Brak dostępu do mikrofonu. Zezwól w ustawieniach.');
    else if (e.error !== 'aborted') showError('Błąd rozpoznawania: ' + e.error);
    state.isRecording = false;
    setRecordUI('idle');
    clearInterval(timerInterval);
    cancelAnimationFrame(waveAnimFrame);
    document.getElementById('wave-canvas').classList.remove('on');
    resetTimer();
  };

  recognition.onend = () => {
    if (state.isRecording) { try { recognition.start(); } catch(e) {} }
  };

  try { recognition.start(); } catch(e) { showError('Błąd: ' + e.message); }
}

function stopRecording() {
  state.isRecording = false;
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  clearInterval(timerInterval);
  cancelAnimationFrame(waveAnimFrame);
  document.getElementById('wave-canvas').classList.remove('on');
  document.getElementById('live-box').style.display = 'none';
  setRecordUI('idle');
  resetTimer();

  const text = (currentTranscript + ' ' + currentInterim).trim();
  if (text) {
    const cat = state.selectedCat || classifyText(text);
    state.notes.push({
      id: Date.now() + Math.random(),
      ts: new Date().toISOString(),
      text,
      category: cat,
      subcategory: null,
      pending: !state.selectedCat,
    });
    state.selectedCat = null;
    save();
    renderCatPillsHome();
  } else {
    showError('Nic nie zostało nagrane. Spróbuj ponownie.');
  }
}

// =====================
// KLASYFIKACJA
// =====================

function classifyText(text) {
  const l = text.toLowerCase();
  let best = 'rozwoj', score = 0;
  for (const [catId, kws] of Object.entries(KEYWORDS)) {
    let s = 0;
    for (const k of kws) { if (l.includes(k)) s++; }
    if (s > score) { score = s; best = catId; }
  }
  return best;
}

// =====================
// ACCORDION
// =====================

function renderAccordion() {
  const container = document.getElementById('categories-accordion');
  container.innerHTML = '';

  let notes = [...state.notes];

  // Sortowanie
  if (state.currentSort === 'newest') notes.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  else if (state.currentSort === 'oldest') notes.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  MAIN_CATEGORIES.forEach(cat => {
    const catNotes = notes.filter(n => n.category === cat.id);

    const accCat = document.createElement('div');
    accCat.className = 'acc-cat';
    accCat.id = 'acc-' + cat.id;

    // Header
    const header = document.createElement('div');
    header.className = 'acc-cat-header';
    header.innerHTML =
      '<div class="acc-cat-dot dot-' + cat.color + '"></div>' +
      '<div class="acc-cat-name">' + cat.name + '</div>' +
      '<div class="acc-cat-count">' + catNotes.length + '</div>' +
      '<div class="acc-cat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>';

    header.addEventListener('click', () => {
      accCat.classList.toggle('open');
    });
    accCat.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'acc-cat-body';

    const notesWrap = document.createElement('div');
    notesWrap.className = 'acc-notes';

    // Podkategorie
    const subcats = state.subcategories[cat.id] || [];
    subcats.forEach(sub => {
      const subNotes = catNotes.filter(n => n.subcategory === sub);
      const accSub = document.createElement('div');
      accSub.className = 'acc-subcat';

      const subHeader = document.createElement('div');
      subHeader.className = 'acc-subcat-header';
      subHeader.innerHTML =
        '<div class="acc-subcat-name">' + sub + '</div>' +
        '<div class="acc-subcat-count">' + subNotes.length + '</div>' +
        '<div class="acc-subcat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>';
      subHeader.addEventListener('click', () => accSub.classList.toggle('open'));

      const subNotesWrap = document.createElement('div');
      subNotesWrap.className = 'acc-subcat-notes';
      subNotes.forEach(n => subNotesWrap.appendChild(buildNoteCard(n)));

      accSub.appendChild(subHeader);
      accSub.appendChild(subNotesWrap);
      notesWrap.appendChild(accSub);
    });

    // Notatki bez podkategorii
    const uncategorized = catNotes.filter(n => !n.subcategory);
    uncategorized.forEach(n => notesWrap.appendChild(buildNoteCard(n)));

    // Dodaj podkategorię
    const addSubBtn = document.createElement('button');
    addSubBtn.className = 'acc-add-subcat';
    addSubBtn.textContent = '+ dodaj podkategorię';
    addSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSubcategoryModal(cat.id);
    });
    notesWrap.appendChild(addSubBtn);

    body.appendChild(notesWrap);
    accCat.appendChild(body);
    container.appendChild(accCat);
  });
}

// =====================
// NOTE CARD
// =====================

function buildNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card' + (note.pending ? ' pending' : '');

  const d = new Date(note.ts);
  const t = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const dt = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });

  card.innerHTML =
    '<div class="note-meta">' +
      '<span class="note-time">' + t + ' · ' + dt + '</span>' +
      '<span class="note-badge">' + getCatName(note.category) + (note.subcategory ? ' › ' + note.subcategory : '') + '</span>' +
      (note.pending ? '<span class="pending-tag">⚠ weryfikacja</span>' : '') +
    '</div>' +
    '<div class="note-text">' + esc(note.text) + '</div>' +
    '<textarea class="note-textarea" rows="3" style="display:none">' + esc(note.text) + '</textarea>' +
    '<div class="note-actions">' +
      '<select class="note-select"></select>' +
      '<button class="note-btn edit-btn">Edytuj</button>' +
      (note.pending ? '<button class="note-btn ok ok-btn">✓ OK</button>' : '') +
      '<div class="fl"></div>' +
      '<button class="note-btn del del-btn">Usuń</button>' +
    '</div>';

  // Select kategorii
  const sel = card.querySelector('.note-select');
  MAIN_CATEGORIES.forEach(cat => {
    const o = document.createElement('option');
    o.value = cat.id; o.textContent = cat.name;
    if (cat.id === note.category) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    note.category = sel.value; note.pending = false;
    save(); renderAccordion();
  });

  // Edytuj
  const eb = card.querySelector('.edit-btn');
  const tel = card.querySelector('.note-text');
  const ta = card.querySelector('.note-textarea');
  eb.addEventListener('click', () => {
    if (ta.style.display === 'none') {
      tel.style.display = 'none'; ta.style.display = 'block';
      eb.textContent = 'Zapisz'; ta.focus();
    } else {
      note.text = ta.value; tel.innerHTML = esc(ta.value);
      tel.style.display = 'block'; ta.style.display = 'none';
      eb.textContent = 'Edytuj'; save();
    }
  });

  // OK
  const ob = card.querySelector('.ok-btn');
  if (ob) ob.addEventListener('click', () => {
    note.pending = false; save(); renderAccordion();
  });

  // Usuń
  card.querySelector('.del-btn').addEventListener('click', () => {
    state.notes = state.notes.filter(n => n.id !== note.id);
    save(); renderAccordion();
  });

  return card;
}

// =====================
// PODKATEGORIE
// =====================

function openSubcategoryModal(catId) {
  const modal = document.getElementById('subcategory-modal');
  const sel = document.getElementById('subcategory-parent');
  sel.innerHTML = '';

  MAIN_CATEGORIES.forEach(cat => {
    const o = document.createElement('option');
    o.value = cat.id; o.textContent = cat.name;
    if (cat.id === catId) o.selected = true;
    sel.appendChild(o);
  });

  document.getElementById('subcategory-input').value = '';
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('subcategory-input').focus(), 100);
}

function confirmSubcategory() {
  const val = document.getElementById('subcategory-input').value.trim();
  const parentId = document.getElementById('subcategory-parent').value;

  if (val) {
    if (!state.subcategories[parentId]) state.subcategories[parentId] = [];
    if (!state.subcategories[parentId].includes(val)) {
      state.subcategories[parentId].push(val);
      save();
      renderAccordion();
    }
  }
  document.getElementById('subcategory-modal').style.display = 'none';
}

// =====================
// WYSZUKIWANIE
// =====================

function doSearch(q) {
  const res = document.getElementById('search-results');
  const query = q.trim().toLowerCase();
  if (!query) { res.innerHTML = '<div class="empty-state">Wpisz frazę aby przeszukać notatki</div>'; return; }

  const found = state.notes.filter(n =>
    n.text.toLowerCase().includes(query) ||
    getCatName(n.category).toLowerCase().includes(query) ||
    (n.subcategory && n.subcategory.toLowerCase().includes(query))
  ).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (!found.length) { res.innerHTML = '<div class="empty-state">Brak wyników dla "' + esc(q) + '"</div>'; return; }
  res.innerHTML = '';
  found.forEach(n => res.appendChild(buildNoteCard(n)));
}

function startVoiceSearch() {
  const btn = document.getElementById('voice-search-btn');
  btn.classList.add('listening');
  switchTab('search');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sr = new SR();
  sr.lang = 'pl-PL';
  sr.onresult = (e) => {
    const q = e.results[0][0].transcript;
    document.getElementById('search-full-input').value = q;
    doSearch(q);
    btn.classList.remove('listening');
  };
  sr.onerror = () => btn.classList.remove('listening');
  sr.onend = () => btn.classList.remove('listening');
  sr.start();
}

// =====================
// EKSPORT
// =====================

function exportNotes() {
  const lines = ['WHISPR — Eksport notatek', 'Data: ' + new Date().toLocaleDateString('pl-PL'), '', '---', ''];

  const sorted = [...state.notes].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  sorted.forEach(n => {
    const d = new Date(n.ts);
    lines.push('[' + d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'}) + ']');
    lines.push('Kategoria: ' + getCatName(n.category) + (n.subcategory ? ' › ' + n.subcategory : ''));
    lines.push(n.text);
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'whispr-notatki-' + new Date().toISOString().slice(0,10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =====================
// TIMER & WAVE
// =====================

function startTimer() {
  timerSeconds = 0;
  document.getElementById('timer').textContent = '0:00';
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = Math.floor(timerSeconds / 60), s = timerSeconds % 60;
    document.getElementById('timer').textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}

function resetTimer() { document.getElementById('timer').textContent = '0:00'; }

function startWave() {
  const canvas = document.getElementById('wave-canvas');
  const ctx = canvas.getContext('2d');
  canvas.classList.add('on');
  function draw() {
    waveAnimFrame = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 22;
    for (let i = 0; i < bars; i++) {
      const h = 3 + Math.random() * (canvas.height - 6);
      const x = i * (canvas.width / bars);
      const y = (canvas.height - h) / 2;
      ctx.fillStyle = '#c9a84c';
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      ctx.beginPath(); ctx.roundRect(x, y, 4, h, 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

function setRecordUI(mode) {
  const btn = document.getElementById('record-btn');
  const outer = document.getElementById('record-outer');
  const mic = document.getElementById('icon-mic');
  const stop = document.getElementById('icon-stop');
  const hint = document.getElementById('record-hint');

  btn.className = 'record-btn ' + mode;
  outer.className = 'record-outer ' + mode;
  mic.style.display = mode === 'idle' ? 'block' : 'none';
  stop.style.display = mode === 'recording' ? 'block' : 'none';
  hint.className = 'record-hint' + (mode === 'recording' ? ' on' : '');
  if (mode === 'idle') hint.textContent = 'Dotknij aby nagrać';
  else hint.textContent = 'Nagrywam... dotknij aby zakończyć';
}

// =====================
// HELPERS
// =====================

function showError(msg) { const b = document.getElementById('error-box'); b.textContent = msg; b.style.display = 'block'; }
function hideError() { document.getElementById('error-box').style.display = 'none'; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

init();
