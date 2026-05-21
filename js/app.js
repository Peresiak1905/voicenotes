// WHISPR 2.3

const DEFAULT_CATS = [
  {id:'praca',name:'Praca',color:0},
  {id:'dom',name:'Dom',color:1},
  {id:'ludzie',name:'Ludzie',color:2},
  {id:'zdrowie',name:'Zdrowie',color:3},
  {id:'finanse',name:'Finanse',color:4},
  {id:'rozwoj',name:'Rozwój',color:5},
];

const KW = {
  praca:['praca','zadanie','zadzwonić','sprawdzić','wysłać','zamówić','harmonogram','termin','spotkanie','szef','projekt','faktura','klient','dostawa','materiał','muszę','raport'],
  dom:['dom','mieszkanie','zakupy','sklep','kupić','sprzątanie','naprawa','rachunek','czynsz','gotowanie','jedzenie'],
  ludzie:['mama','tata','brat','siostra','żona','mąż','dziewczyna','chłopak','znajomy','urodziny','rocznica','imieniny','powiedział','powiedziała'],
  zdrowie:['lekarz','wizyta','lek','apteka','zdrowie','choroba','ból','badanie','recepta','szpital'],
  finanse:['złoty','zł','pieniądze','wydatek','przelew','bank','konto','kredyt','faktura','rachunek','płatność','cena','koszt'],
  rozwoj:['pomysł','kurs','książka','nauka','szkoła','studia','trening','siłownia','bieganie','język','angielski']
};

let notes = JSON.parse(localStorage.getItem('whispr_notes')) || [];
let categories = JSON.parse(localStorage.getItem('whispr_cats')) || DEFAULT_CATS;
let currentFilter = 'all';
let isRecording = false;
let waveAF;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initRecord();
  initCategories();
  renderAll();
});

function initTabs() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      
      item.classList.add('active');
      const tabId = 'tab-' + item.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
}

function renderAll() {
  renderFilters();
  renderNotes();
  renderCatList();
  updateStats();
}

function updateStats() {
  document.getElementById('stat-total').textContent = notes.length;
  document.getElementById('stat-cats').textContent = categories.length;
}

function renderFilters() {
  const scroll = document.getElementById('home-cats-scroll');
  if(!scroll) return;
  
  let html = `<div class="cat-pill ${currentFilter==='all'?'active':''}" onclick="setFilter('all')">Wszystkie</div>`;
  categories.forEach(c => {
    html += `<div class="cat-pill ${currentFilter===c.id?'active':''}" onclick="setFilter('${c.id}')">
      <span class="cat-dot" style="background:var(--c${c.color % 6})"></span>${c.name}
    </div>`;
  });
  scroll.innerHTML = html;
}

window.setFilter = function(filter) {
  currentFilter = filter;
  renderFilters();
  renderNotes();
};

function renderNotes() {
  const container = document.getElementById('notes-container');
  if(!container) return;
  
  const filtered = currentFilter === 'all' ? notes : notes.filter(n => n.category === currentFilter);
  
  if(filtered.length === 0) {
    container.innerHTML = '<div class="note-card"><div class="note-text empty">Brak notatek w tej kategorii.</div></div>';
    return;
  }
  
  let html = '';
  filtered.forEach(n => {
    const cat = categories.find(c => c.id === n.category);
    const catName = cat ? cat.name : 'Nieprzypisane';
    const catColor = cat ? `var(--c${cat.color % 6})` : '#666';
    
    html += `
      <div class="note-card">
        <div class="note-top">
          <div class="note-time">${n.date}</div>
          <div class="note-tags">
            <span class="note-tag" style="border-color:${catColor}; color:${catColor}">${catName}</span>
          </div>
        </div>
        <div class="note-text">${n.text}</div>
        <div class="note-actions">
          <button class="nbtn delete" onclick="deleteNote('${n.id}')">Usuń</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

window.deleteNote = function(id) {
  notes = notes.filter(n => n.id !== id);
  localStorage.setItem('whispr_notes', JSON.stringify(notes));
  renderAll();
};

function initRecord() {
  const btn = document.getElementById('record-btn');
  if(!btn) return;
  
  btn.addEventListener('click', () => {
    if(!isRecording) {
      // Start recording simulator
      isRecording = true;
      setRecUI('recording');
      startWave();
    } else {
      // Stop recording simulator
      isRecording = false;
      setRecUI('idle');
      stopWave();
      
      // Simulate Speech to Text
      const phrases = [
        "Trzeba zrobić zakupy w sklepie i kupić mleko oraz jajka na kolację.",
        "Spotkanie z szefem w sprawie projektu i faktury dla klienta jutro o 10.",
        "Zadzwonić do mamy i zapytać o zdrowie oraz wizytę u lekarza.",
        "Kupić nową książkę do nauki języka angielskiego na trening rozwoju.",
        "Opłacić rachunek za prąd i sprawdzić stan konta w banku."
      ];
      const randomText = phrases[Math.floor(Math.random() * phrases.length)];
      
      // Auto category detection
      let detectedCat = 'nieprzypisane';
      for(const [catId, words] of Object.entries(KW)) {
        if(words.some(w => randomText.toLowerCase().includes(w))) {
          detectedCat = catId;
          break;
        }
      }
      
      const newNote = {
        id: Date.now().toString(),
        text: randomText,
        category: detectedCat,
        date: new Date().toLocaleDateString('pl-PL') + ' ' + new Date().toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'})
      };
      
      notes.unshift(newNote);
      localStorage.setItem('whispr_notes', JSON.stringify(notes));
      renderAll();
      
      // Switch tab to list
      setTimeout(() => {
        document.querySelector('[data-tab="home"]').click();
      }, 500);
    }
  });
}

function startWave() {
  const canvas = document.getElementById('wave-canvas');
  const ctx = canvas.getContext('2d');
  canvas.classList.add('on');
  function draw(){
    waveAF = requestAnimationFrame(draw);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bars = 26;
    for(let i=0;i<bars;i++){
      const h = 3+Math.random()*(canvas.height-6);
      const x = i*(canvas.width/bars);
      const y = (canvas.height-h)/2;
      ctx.fillStyle = '#c9a84c';
      ctx.globalAlpha = 0.3+Math.random()*0.7;
      ctx.beginPath();
      ctx.roundRect(x,y,5,h,2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
}

function stopWave() {
  cancelAnimationFrame(waveAF);
  const canvas = document.getElementById('wave-canvas');
  if(canvas) canvas.classList.remove('on');
}

function setRecUI(mode){
  const btn = document.getElementById('record-btn');
  const outer = document.getElementById('record-outer');
  const mic = document.getElementById('icon-mic');
  const stop = document.getElementById('icon-stop');
  const hint = document.getElementById('record-hint');
  
  if(!btn) return;
  btn.className = 'record-btn ' + mode;
  if(outer) outer.className = 'record-outer ' + mode;
  if(mic) mic.style.display = mode === 'idle' ? 'block' : 'none';
  if(stop) stop.style.display = mode === 'recording' ? 'block' : 'none';
  if(hint) {
    hint.className = 'record-hint' + (mode === 'recording' ? ' on' : '');
    hint.textContent = mode === 'idle' ? 'Dotknij aby nagrać' : 'Nagrywam... dotknij aby zakończyć';
  }
}

function initCategories() {
  const btnAdd = document.getElementById('btn-add-cat');
  const modal = document.getElementById('modal-addcat');
  const cancel = document.getElementById('addcat-cancel');
  const ok = document.getElementById('addcat-ok');
  const input = document.getElementById('addcat-name');
  
  if(btnAdd) btnAdd.addEventListener('click', () => modal.style.display = 'flex');
  if(cancel) cancel.addEventListener('click', () => modal.style.display = 'none');
  if(ok) {
    ok.addEventListener('click', () => {
      const name = input.value.trim();
      if(name) {
        const id = name.toLowerCase().replace(/\s+/g, '-');
        categories.push({id: id, name: name, color: categories.length});
        localStorage.setItem('whispr_cats', JSON.stringify(categories));
        input.value = '';
        modal.style.display = 'none';
        renderAll();
      }
    });
  }
}

function renderCatList() {
  const container = document.getElementById('cats-container');
  if(!container) return;
  
  let html = '';
  categories.forEach(c => {
    const count = notes.filter(n => n.category === c.id).length;
    html += `
      <div class="cat-row">
        <div class="cat-info">
          <span class="cat-color-dot" style="background:var(--c${c.color % 6})"></span>
          <span class="cat-name">${c.name}</span>
        </div>
        <span class="cat-count">${count} notatek</span>
      </div>
    `;
  });
  container.innerHTML = html;
}
