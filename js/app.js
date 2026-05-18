const DEFAULT_CATEGORIES = ['Zadania','Pomysły','Kontakty','Zakupy','Zdrowie','Różne'];
const KEYWORDS = {
  'Zadania':['zadzwonić','sprawdzić','wysłać','zrobić','przygotować','napisać','umówić','zamówić','potwierdzić','harmonogram','termin','spotkanie','zadanie','muszę','trzeba','należy'],
  'Pomysły':['pomysł','może','można','warto','fajnie','dobry','świetny','propozycja','plan','projekt','nowy','proponuję'],
  'Kontakty':['telefon','tel','email','kontakt','pan','pani','nazwisko','firma','numer','adres'],
  'Zakupy':['kupić','zamówić','sklep','cena','koszt','sztuk','materiał','dostawa','faktura','zakup'],
  'Zdrowie':['lekarz','wizyta','lek','apteka','zdrowie','choroba','ból','badanie','recepta'],
};

let state = {
  notes:[],categories:[...DEFAULT_CATEGORIES],
  selectedCat:null,currentFilter:'Wszystkie',isRecording:false,
};
let recognition=null,timerInterval=null,timerSeconds=0,waveAnimFrame=null;
let currentTranscript='',currentInterim='';

function init(){
  loadFromStorage();
  renderCatPills();renderFilters();renderNotes();updateStats();
  bindEvents();checkSupport();
}

function checkSupport(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window))
    showError('Użyj Google Chrome — ta przeglądarka nie obsługuje nagrywania głosu.');
}

function loadFromStorage(){
  try{
    const n=localStorage.getItem('vn_notes');
    const c=localStorage.getItem('vn_cats');
    if(n) state.notes=JSON.parse(n);
    if(c) state.categories=JSON.parse(c);
  }catch(e){}
}
function save(){
  localStorage.setItem('vn_notes',JSON.stringify(state.notes));
  localStorage.setItem('vn_cats',JSON.stringify(state.categories));
}

function bindEvents(){
  document.querySelectorAll('.bnav').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  document.getElementById('record-btn').addEventListener('click',toggleRecord);
  document.getElementById('add-cat-btn').addEventListener('click',()=>document.getElementById('add-cat-modal').classList.add('open'));
  document.getElementById('modal-cancel').addEventListener('click',closeModal);
  document.getElementById('modal-confirm').addEventListener('click',confirmCat);
  document.getElementById('new-cat-input').addEventListener('keydown',e=>{if(e.key==='Enter')confirmCat();if(e.key==='Escape')closeModal();});
  document.getElementById('search-input').addEventListener('input',e=>doSearch(e.target.value));
}

function switchTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector('[data-tab="'+tab+'"]').classList.add('active');
  if(tab==='notes') renderNotes();
}

function updateStats(){
  const today=new Date().toDateString();
  document.getElementById('s-total').textContent=state.notes.length;
  document.getElementById('s-pending').textContent=state.notes.filter(n=>n.pending).length;
}

function catColor(cat){return state.categories.indexOf(cat)%6;}

function renderCatPills(){
  const c=document.getElementById('cat-pills');
  c.innerHTML='';
  state.categories.forEach(cat=>{
    const p=document.createElement('button');
    p.className='cat-pill'+(state.selectedCat===cat?' active':'');
    p.textContent=cat;
    p.addEventListener('click',()=>{state.selectedCat=state.selectedCat===cat?null:cat;renderCatPills();});
    c.appendChild(p);
  });
}

function closeModal(){document.getElementById('add-cat-modal').classList.remove('open');document.getElementById('new-cat-input').value='';}
function confirmCat(){
  const v=document.getElementById('new-cat-input').value.trim();
  if(v&&!state.categories.includes(v)){state.categories.push(v);save();renderCatPills();renderFilters();}
  closeModal();
}

function toggleRecord(){state.isRecording?stopRecording():startRecording();}

function startRecording(){
  hideError();currentTranscript='';currentInterim='';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();
  recognition.lang='pl-PL';recognition.continuous=true;recognition.interimResults=true;

  recognition.onstart=()=>{
    state.isRecording=true;
    setUI('recording');startTimer();startWave();
  };

  recognition.onresult=(event)=>{
    let fin='',int='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const t=event.results[i][0].transcript;
      if(event.results[i].isFinal){fin+=t+' ';}else{int+=t;}
    }
    currentTranscript+=fin;currentInterim=int;
    const preview=(currentTranscript+int).trim();
    document.getElementById('record-status').textContent=preview.length>60?'...'+preview.slice(-60):preview||'Nagrywam...';
    const lb=document.getElementById('live-box');
    const lt=document.getElementById('live-text');
    if(preview){lb.style.display='block';lt.textContent=preview;}
  };

  recognition.onerror=(e)=>{
    if(e.error==='not-allowed') showError('Brak dostępu do mikrofonu. Zezwól przeglądarce.');
    else if(e.error!=='aborted') showError('Błąd: '+e.error);
    state.isRecording=false;setUI('idle');
    clearInterval(timerInterval);cancelAnimationFrame(waveAnimFrame);
    document.getElementById('wave-canvas').classList.remove('on');resetTimer();
  };

  recognition.onend=()=>{if(state.isRecording){try{recognition.start();}catch(e){}}};

  try{recognition.start();}catch(e){showError('Błąd uruchomienia: '+e.message);}
}

function stopRecording(){
  state.isRecording=false;
  if(recognition){recognition.onend=null;recognition.stop();recognition=null;}
  clearInterval(timerInterval);cancelAnimationFrame(waveAnimFrame);
  document.getElementById('wave-canvas').classList.remove('on');
  document.getElementById('live-box').style.display='none';
  setUI('idle');resetTimer();

  const text=(currentTranscript+' '+currentInterim).trim();
  if(text){
    const cat=state.selectedCat||classifyText(text);
    const pending=!state.selectedCat&&cat==='Różne';
    state.notes.push({id:Date.now()+Math.random(),ts:new Date().toISOString(),text,category:cat,pending});
    state.selectedCat=null;
    save();updateStats();renderCatPills();renderFilters();
  } else {
    showError('Nic nie zostało nagrane. Spróbuj ponownie.');
  }
}

function classifyText(text){
  const l=text.toLowerCase();
  let best='Różne',score=0;
  for(const[cat,kws] of Object.entries(KEYWORDS)){
    if(!state.categories.includes(cat)) continue;
    let s=0;for(const k of kws){if(l.includes(k))s++;}
    if(s>score){score=s;best=cat;}
  }
  return best;
}

function renderNotes(filter){
  const f=filter!==undefined?filter:state.currentFilter;
  const list=document.getElementById('notes-list');
  let shown=[...state.notes].reverse();
  if(f!=='Wszystkie') shown=shown.filter(n=>n.category===f);
  if(!shown.length){list.innerHTML='<div class="empty">Brak notatek'+(f!=='Wszystkie'?' w tej kategorii':'')+'</div>';return;}
  list.innerHTML='';shown.forEach(n=>list.appendChild(buildCard(n)));
}

function buildCard(note){
  const card=document.createElement('div');
  card.className='note-card'+(note.pending?' pending':'');
  const d=new Date(note.ts);
  const t=d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const dt=d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'});
  const ci=catColor(note.category);
  card.innerHTML=
    '<div class="note-meta">'+
      '<span class="note-time">'+t+' · '+dt+'</span>'+
      '<span class="note-badge b'+ci+'">'+note.category+'</span>'+
      (note.pending?'<span class="pending-tag">⚠ weryfikacja</span>':'')+
    '</div>'+
    '<div class="note-text">'+esc(note.text)+'</div>'+
    '<textarea class="note-textarea" rows="3" style="display:none">'+esc(note.text)+'</textarea>'+
    '<div class="note-actions">'+
      '<select class="note-select"></select>'+
      '<button class="note-btn edit-btn">Edytuj</button>'+
      (note.pending?'<button class="note-btn ok ok-btn">✓ OK</button>':'')+
      '<div class="fl"></div>'+
      '<button class="note-btn del del-btn">Usuń</button>'+
    '</div>';

  const sel=card.querySelector('.note-select');
  state.categories.forEach(cat=>{const o=document.createElement('option');o.value=cat;o.textContent=cat;if(cat===note.category)o.selected=true;sel.appendChild(o);});
  sel.addEventListener('change',()=>{note.category=sel.value;note.pending=false;save();updateStats();renderFilters();renderNotes();});

  const eb=card.querySelector('.edit-btn'),tel=card.querySelector('.note-text'),ta=card.querySelector('.note-textarea');
  eb.addEventListener('click',()=>{
    if(ta.style.display==='none'){tel.style.display='none';ta.style.display='block';eb.textContent='Zapisz';ta.focus();}
    else{note.text=ta.value;tel.innerHTML=esc(ta.value);tel.style.display='block';ta.style.display='none';eb.textContent='Edytuj';save();}
  });

  const ob=card.querySelector('.ok-btn');
  if(ob) ob.addEventListener('click',()=>{note.pending=false;save();updateStats();renderNotes();});
  card.querySelector('.del-btn').addEventListener('click',()=>{state.notes=state.notes.filter(n=>n.id!==note.id);save();updateStats();renderFilters();renderNotes();});
  return card;
}

function renderFilters(){
  const row=document.getElementById('filter-row');row.innerHTML='';
  ['Wszystkie',...state.categories].forEach(f=>{
    const ch=document.createElement('button');
    ch.className='filter-chip'+(state.currentFilter===f?' active':'');
    ch.textContent=f;
    ch.addEventListener('click',()=>{state.currentFilter=f;renderFilters();renderNotes();});
    row.appendChild(ch);
  });
}

function doSearch(q){
  const res=document.getElementById('search-results');
  const query=q.trim().toLowerCase();
  if(!query){res.innerHTML='<div class="empty">Wpisz frazę aby przeszukać notatki</div>';return;}
  const found=state.notes.filter(n=>n.text.toLowerCase().includes(query)||n.category.toLowerCase().includes(query)).reverse();
  if(!found.length){res.innerHTML='<div class="empty">Brak wyników</div>';return;}
  res.innerHTML='';found.forEach(n=>res.appendChild(buildCard(n)));
}

function startTimer(){
  timerSeconds=0;document.getElementById('timer').textContent='0:00';
  timerInterval=setInterval(()=>{timerSeconds++;const m=Math.floor(timerSeconds/60),s=timerSeconds%60;document.getElementById('timer').textContent=m+':'+String(s).padStart(2,'0');},1000);
}
function resetTimer(){document.getElementById('timer').textContent='0:00';}

function startWave(){
  const canvas=document.getElementById('wave-canvas');
  const ctx=canvas.getContext('2d');
  canvas.classList.add('on');
  function draw(){
    waveAnimFrame=requestAnimationFrame(draw);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bars=14;
    for(let i=0;i<bars;i++){
      const h=4+Math.random()*(canvas.height-8);
      const x=i*(canvas.width/bars);
      const y=(canvas.height-h)/2;
      ctx.fillStyle='#e05a2b';ctx.globalAlpha=0.5+Math.random()*0.5;
      ctx.beginPath();ctx.roundRect(x,y,4,h,2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  draw();
}

function setUI(mode){
  const btn=document.getElementById('record-btn');
  const mic=document.getElementById('icon-mic');
  const stop=document.getElementById('icon-stop');
  const hint=document.getElementById('record-status');
  btn.className='rec-btn '+mode;
  mic.style.display=mode==='idle'?'block':'none';
  stop.style.display=mode==='recording'?'block':'none';
  hint.className='record-hint'+(mode==='recording'?' on':'');
  if(mode==='idle'){hint.textContent='Kliknij aby nagrać';}
  else{hint.textContent='Nagrywam... kliknij aby zakończyć';}
}

function showError(msg){const b=document.getElementById('error-box');b.textContent=msg;b.style.display='block';}
function hideError(){document.getElementById('error-box').style.display='none';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
