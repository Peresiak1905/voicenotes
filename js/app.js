// WHISPR 2.1

const DEFAULT_CATEGORIES = [
  {id:'praca',name:'Praca',color:0},
  {id:'dom',name:'Dom',color:1},
  {id:'ludzie',name:'Ludzie',color:2},
  {id:'zdrowie',name:'Zdrowie',color:3},
  {id:'finanse',name:'Finanse',color:4},
  {id:'rozwoj',name:'Rozwój',color:5},
];

const KEYWORDS = {
  praca:['praca','zadanie','zadzwonić','sprawdzić','wysłać','zamówić','harmonogram','termin','spotkanie','szef','projekt','faktura','klient','dostawa','materiał','muszę','raport'],
  dom:['dom','mieszkanie','zakupy','sklep','kupić','sprzątanie','naprawa','rachunek','czynsz','gotowanie','jedzenie'],
  ludzie:['mama','tata','brat','siostra','żona','mąż','dziewczyna','chłopak','znajomy','urodziny','rocznica','imieniny','powiedział','powiedziała','kolega'],
  zdrowie:['lekarz','wizyta','lek','apteka','zdrowie','choroba','ból','badanie','recepta','szpital','tabletka'],
  finanse:['złoty','zł','pieniądze','wydatek','przelew','bank','konto','kredyt','faktura','rachunek','płatność','cena','koszt','budżet'],
  rozwoj:['pomysł','kurs','książka','nauka','cel','plan','rozwój','inspiracja','podcast','szkolenie','pomyśleć'],
};

let state = {
  notes:[],
  categories:[...DEFAULT_CATEGORIES],
  subcategories:{},   // catId -> [subName, ...]
  subsubcategories:{}, // catId+'/'+subName -> [subsubName, ...]
  isRecording:false,
  currentFilter:{q:'',cat:'',status:'',dateFrom:'',dateTo:''},
  assignNoteId:null,
};

let recognition=null, timerInterval=null, timerSeconds=0, waveAnimFrame=null;
let currentTranscript='', currentInterim='';

// ========== INIT ==========

function init(){
  migrateData();
  loadFromStorage();
  renderDate();
  renderNotes();
  bindEvents();
  checkSupport();
}

function migrateData(){
  // Migracja ze starych kluczy
  const oldKeys=['vn_notes','whispr_notes'];
  let migrated=[];
  oldKeys.forEach(k=>{
    try{
      const d=localStorage.getItem(k);
      if(d){
        const arr=JSON.parse(d);
        if(Array.isArray(arr)) migrated=migrated.concat(arr);
      }
    }catch(e){}
  });
  if(migrated.length>0){
    const existing=JSON.parse(localStorage.getItem('w21_notes')||'[]');
    const existingIds=new Set(existing.map(n=>String(n.id)));
    const newOnes=migrated.filter(n=>!existingIds.has(String(n.id)));
    if(newOnes.length>0){
      const merged=[...existing,...newOnes];
      localStorage.setItem('w21_notes',JSON.stringify(merged));
    }
    oldKeys.forEach(k=>localStorage.removeItem(k));
  }
}

function loadFromStorage(){
  try{
    const n=localStorage.getItem('w21_notes');
    const c=localStorage.getItem('w21_cats');
    const s=localStorage.getItem('w21_subcats');
    const ss=localStorage.getItem('w21_subsubcats');
    if(n) state.notes=JSON.parse(n);
    if(c) state.categories=JSON.parse(c);
    if(s) state.subcategories=JSON.parse(s);
    if(ss) state.subsubcategories=JSON.parse(ss);
  }catch(e){}
}

function save(){
  localStorage.setItem('w21_notes',JSON.stringify(state.notes));
  localStorage.setItem('w21_cats',JSON.stringify(state.categories));
  localStorage.setItem('w21_subcats',JSON.stringify(state.subcategories));
  localStorage.setItem('w21_subsubcats',JSON.stringify(state.subsubcategories));
}

function checkSupport(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window))
    showError('Użyj Safari lub Chrome — brak obsługi nagrywania głosu.');
}

// ========== EVENTS ==========

function bindEvents(){
  document.querySelectorAll('.bnav,.back-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  document.getElementById('search-pill').addEventListener('click',()=>switchTab('search'));
  document.getElementById('record-btn').addEventListener('click',toggleRecord);
  document.getElementById('export-btn').addEventListener('click',exportNotes);
  document.getElementById('import-btn').addEventListener('click',()=>document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change',importNotes);
  document.getElementById('notes-search-input').addEventListener('input',e=>{state.currentFilter.q=e.target.value;renderNotes();});
  document.getElementById('filter-toggle-btn').addEventListener('click',toggleFilters);
  document.getElementById('filter-cat').addEventListener('change',e=>{state.currentFilter.cat=e.target.value;renderNotes();});
  document.getElementById('filter-status').addEventListener('change',e=>{state.currentFilter.status=e.target.value;renderNotes();});
  document.getElementById('filter-date-from').addEventListener('change',e=>{state.currentFilter.dateFrom=e.target.value;renderNotes();});
  document.getElementById('filter-date-to').addEventListener('change',e=>{state.currentFilter.dateTo=e.target.value;renderNotes();});
  document.getElementById('filter-clear-btn').addEventListener('click',clearFilters);
  document.getElementById('search-full-input').addEventListener('input',e=>doSearch(e.target.value));
  document.getElementById('voice-search-btn').addEventListener('click',startVoiceSearch);

  // Modals
  document.getElementById('subcat-cancel').addEventListener('click',()=>closeModal('subcat-modal'));
  document.getElementById('subcat-confirm').addEventListener('click',confirmSubcat);
  document.getElementById('addcat-cancel').addEventListener('click',()=>closeModal('addcat-modal'));
  document.getElementById('addcat-confirm').addEventListener('click',confirmAddCat);
  document.getElementById('assign-cancel').addEventListener('click',()=>closeModal('assign-modal'));
  document.getElementById('assign-confirm').addEventListener('click',confirmAssign);

  document.getElementById('subcat-parent-cat').addEventListener('change',updateSubcatParentSub);
  document.getElementById('assign-cat').addEventListener('change',updateAssignSub);
  document.getElementById('assign-sub').addEventListener('change',updateAssignSubSub);
}

// ========== NAWIGACJA ==========

function switchTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelectorAll('[data-tab="'+tab+'"]').forEach(b=>{if(b.classList.contains('bnav'))b.classList.add('active');});
  if(tab==='notes') renderNotes();
  if(tab==='search') setTimeout(()=>document.getElementById('search-full-input').focus(),100);
}

function renderDate(){
  const el=document.getElementById('home-date');
  if(el) el.textContent=new Date().toLocaleDateString('pl-PL',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}

// ========== NAGRYWANIE ==========

function toggleRecord(){state.isRecording?stopRecording():startRecording();}

function startRecording(){
  hideError();
  currentTranscript='';currentInterim='';
  updateLiveText('Zacznij mówić...');

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();
  recognition.lang='pl-PL';recognition.continuous=true;recognition.interimResults=true;

  recognition.onstart=()=>{
    state.isRecording=true;
    setRecordUI('recording');
    startTimer();startWave();
  };

  recognition.onresult=(event)=>{
    let fin='',int='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const t=event.results[i][0].transcript;
      if(event.results[i].isFinal) fin+=t+' ';
      else int+=t;
    }
    currentTranscript+=fin;currentInterim=int;
    const preview=(currentTranscript+int).trim();
    updateLiveText(preview||'Nagrywam...');
    const hint=document.getElementById('record-hint');
    if(hint) hint.textContent=preview.length>50?'...'+preview.slice(-50):preview||'Nagrywam...';
  };

  recognition.onerror=(e)=>{
    if(e.error==='not-allowed') showError('Brak dostępu do mikrofonu.');
    else if(e.error!=='aborted') showError('Błąd: '+e.error);
    cleanup();
  };

  recognition.onend=()=>{if(state.isRecording){try{recognition.start();}catch(e){}}};
  try{recognition.start();}catch(e){showError('Błąd: '+e.message);}
}

function stopRecording(){
  state.isRecording=false;
  if(recognition){recognition.onend=null;recognition.stop();recognition=null;}
  cleanup();

  const text=(currentTranscript+' '+currentInterim).trim();
  if(text){
    const cat=classifyText(text);
    state.notes.push({
      id:Date.now()+Math.random(),
      ts:new Date().toISOString(),
      text,category:cat,
      subcategory:null,subsubcategory:null,
      pending:true,
    });
    save();
  } else {
    showError('Nic nie nagrano. Spróbuj ponownie.');
  }
}

function cleanup(){
  clearInterval(timerInterval);
  cancelAnimationFrame(waveAnimFrame);
  document.getElementById('wave-canvas').classList.remove('on');
  setRecordUI('idle');
  resetTimer();
  updateLiveText('Zacznij mówić...');
}

function updateLiveText(text){
  const el=document.getElementById('live-text');
  if(el) el.textContent=text;
}

function classifyText(text){
  const l=text.toLowerCase();
  let best='rozwoj',score=0;
  for(const[catId,kws] of Object.entries(KEYWORDS)){
    if(!state.categories.find(c=>c.id===catId)) continue;
    let s=0;for(const k of kws){if(l.includes(k))s++;}
    if(s>score){score=s;best=catId;}
  }
  return best;
}

// ========== RENDER NOTES ==========

function renderNotes(){
  renderFilterCats();
  const f=state.currentFilter;
  let notes=[...state.notes];

  // Filtrowanie
  if(f.q) notes=notes.filter(n=>n.text.toLowerCase().includes(f.q.toLowerCase()));
  if(f.cat) notes=notes.filter(n=>n.category===f.cat);
  if(f.status==='pending') notes=notes.filter(n=>n.pending);
  if(f.status==='ok') notes=notes.filter(n=>!n.pending);
  if(f.dateFrom) notes=notes.filter(n=>new Date(n.ts)>=new Date(f.dateFrom));
  if(f.dateTo) notes=notes.filter(n=>new Date(n.ts)<=new Date(f.dateTo+'T23:59:59'));

  // Sortowanie — najnowsze na górze
  notes.sort((a,b)=>new Date(b.ts)-new Date(a.ts));

  // Sekcja do weryfikacji
  const pending=notes.filter(n=>n.pending);
  const pendingSection=document.getElementById('pending-section');
  const pendingList=document.getElementById('pending-list');
  const pendingCount=document.getElementById('pending-count');
  if(pending.length>0){
    pendingSection.style.display='block';
    pendingCount.textContent=pending.length;
    pendingList.innerHTML='';
    pending.forEach(n=>pendingList.appendChild(buildNoteCard(n)));
  } else {
    pendingSection.style.display='none';
  }

  // Accordion kategorii
  renderAccordion(notes.filter(n=>!n.pending));
}

function renderFilterCats(){
  const sel=document.getElementById('filter-cat');
  const current=sel.value;
  sel.innerHTML='<option value="">Wszystkie</option>';
  state.categories.forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat.id;o.textContent=cat.name;
    if(cat.id===current) o.selected=true;
    sel.appendChild(o);
  });
}

function renderAccordion(notes){
  const wrap=document.getElementById('categories-wrap');
  wrap.innerHTML='';

  state.categories.forEach(cat=>{
    const catNotes=notes.filter(n=>n.category===cat.id);
    const subcats=state.subcategories[cat.id]||[];

    const accCat=document.createElement('div');
    accCat.className='acc-cat';

    // Header
    const header=document.createElement('div');
    header.className='acc-cat-header';
    header.innerHTML=
      '<div class="acc-cat-dot dot-'+cat.color+'"></div>'+
      '<div class="acc-cat-name">'+cat.name+'</div>'+
      '<div class="acc-cat-count">'+catNotes.length+'</div>'+
      '<div class="acc-cat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>'+
      '<button class="acc-cat-del" title="Usuń kategorię">×</button>';

    header.querySelector('.acc-cat-del').addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm('Usunąć kategorię "'+cat.name+'"? Notatki zostaną przeniesione do "Różne".')){
        state.notes.forEach(n=>{if(n.category===cat.id) n.category='rozwoj';});
        state.categories=state.categories.filter(c=>c.id!==cat.id);
        delete state.subcategories[cat.id];
        save();renderNotes();
      }
    });
    header.addEventListener('click',e=>{
      if(e.target.classList.contains('acc-cat-del')) return;
      accCat.classList.toggle('open');
    });
    accCat.appendChild(header);

    // Body
    const body=document.createElement('div');
    body.className='acc-cat-body';
    const inner=document.createElement('div');
    inner.className='acc-notes-inner';

    // Podkategorie (poziom 2)
    subcats.forEach(sub=>{
      const subKey=cat.id+'/'+sub;
      const subSubs=state.subsubcategories[subKey]||[];
      const subNotes=catNotes.filter(n=>n.subcategory===sub);

      const accSub=document.createElement('div');
      accSub.className='acc-subcat';

      const subHeader=document.createElement('div');
      subHeader.className='acc-subcat-header';
      subHeader.innerHTML=
        '<div class="acc-subcat-name">'+sub+'</div>'+
        '<div class="acc-subcat-count">'+subNotes.length+'</div>'+
        '<div class="acc-subcat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>';
      subHeader.addEventListener('click',()=>accSub.classList.toggle('open'));

      const subBody=document.createElement('div');
      subBody.className='acc-subcat-body';

      // Podpodkategorie (poziom 3)
      subSubs.forEach(subsub=>{
        const subsubNotes=subNotes.filter(n=>n.subsubcategory===subsub);
        const accSubSub=document.createElement('div');
        accSubSub.className='acc-subsubcat';

        const subsubHeader=document.createElement('div');
        subsubHeader.className='acc-subsubcat-header';
        subsubHeader.innerHTML=
          '<div class="acc-subsubcat-name">'+subsub+'</div>'+
          '<div class="acc-subsubcat-count">'+subsubNotes.length+'</div>'+
          '<div class="acc-subsubcat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>';
        subsubHeader.addEventListener('click',()=>accSubSub.classList.toggle('open'));

        const subsubBody=document.createElement('div');
        subsubBody.className='acc-subsubcat-body';
        subsubNotes.forEach(n=>subsubBody.appendChild(buildNoteCard(n)));
        accSubSub.appendChild(subsubHeader);
        accSubSub.appendChild(subsubBody);
        subBody.appendChild(accSubSub);
      });

      // Notatki w podkategorii bez podpodkategorii
      subNotes.filter(n=>!n.subsubcategory).forEach(n=>subBody.appendChild(buildNoteCard(n)));

      // Dodaj podpodkategorię
      const addSubSubBtn=document.createElement('button');
      addSubSubBtn.className='acc-add-btn';
      addSubSubBtn.textContent='+ podpodkategoria';
      addSubSubBtn.addEventListener('click',()=>openSubcatModal(cat.id,sub));
      subBody.appendChild(addSubSubBtn);

      accSub.appendChild(subHeader);
      accSub.appendChild(subBody);
      inner.appendChild(accSub);
    });

    // Notatki w kategorii bez podkategorii
    catNotes.filter(n=>!n.subcategory).forEach(n=>inner.appendChild(buildNoteCard(n)));

    // Dodaj podkategorię
    const addSubBtn=document.createElement('button');
    addSubBtn.className='acc-add-btn';
    addSubBtn.textContent='+ podkategoria';
    addSubBtn.addEventListener('click',()=>openSubcatModal(cat.id,null));
    inner.appendChild(addSubBtn);

    body.appendChild(inner);
    accCat.appendChild(body);
    wrap.appendChild(accCat);
  });

  // Dodaj nową kategorię główną
  const addCatBtn=document.createElement('button');
  addCatBtn.className='acc-add-cat-btn';
  addCatBtn.textContent='+ dodaj kategorię';
  addCatBtn.addEventListener('click',()=>openModal('addcat-modal'));
  wrap.appendChild(addCatBtn);
}

// ========== NOTE CARD ==========

function buildNoteCard(note){
  const card=document.createElement('div');
  card.className='note-card'+(note.pending?' pending':'');
  const d=new Date(note.ts);
  const t=d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const dt=d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'});
  const catName=getCatName(note.category);
  const badge=catName+(note.subcategory?' › '+note.subcategory:'')+(note.subsubcategory?' › '+note.subsubcategory:'');

  card.innerHTML=
    '<div class="note-meta">'+
      '<span class="note-time">'+t+' · '+dt+'</span>'+
      '<span class="note-badge">'+badge+'</span>'+
      (note.pending?'<span class="pending-tag">⚠ weryfikacja</span>':'')+
    '</div>'+
    '<div class="note-text">'+esc(note.text)+'</div>'+
    '<textarea class="note-textarea" rows="3" style="display:none">'+esc(note.text)+'</textarea>'+
    '<div class="note-actions">'+
      '<button class="note-btn assign assign-btn">Przypisz</button>'+
      '<button class="note-btn edit-btn">Edytuj</button>'+
      (note.pending?'<button class="note-btn ok ok-btn">✓ OK</button>':'')+
      '<div class="fl"></div>'+
      '<button class="note-btn del del-btn">Usuń</button>'+
    '</div>';

  card.querySelector('.assign-btn').addEventListener('click',()=>openAssignModal(note.id));

  const eb=card.querySelector('.edit-btn'),tel=card.querySelector('.note-text'),ta=card.querySelector('.note-textarea');
  eb.addEventListener('click',()=>{
    if(ta.style.display==='none'){tel.style.display='none';ta.style.display='block';eb.textContent='Zapisz';ta.focus();}
    else{note.text=ta.value;tel.innerHTML=esc(ta.value);tel.style.display='block';ta.style.display='none';eb.textContent='Edytuj';save();}
  });

  const ob=card.querySelector('.ok-btn');
  if(ob) ob.addEventListener('click',()=>{note.pending=false;save();renderNotes();});

  card.querySelector('.del-btn').addEventListener('click',()=>{
    state.notes=state.notes.filter(n=>n.id!==note.id);save();renderNotes();
  });

  return card;
}

function getCatName(catId){
  const cat=state.categories.find(c=>c.id===catId);
  return cat?cat.name:catId;
}

// ========== MODAL: SUBKAT ==========

function openSubcatModal(catId, parentSub){
  const modal=document.getElementById('subcat-modal');
  const selCat=document.getElementById('subcat-parent-cat');
  const selSub=document.getElementById('subcat-parent-sub');

  selCat.innerHTML='';
  state.categories.forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat.id;o.textContent=cat.name;
    if(cat.id===catId) o.selected=true;
    selCat.appendChild(o);
  });

  if(parentSub){
    selSub.style.display='block';
    selSub.innerHTML='';
    const subs=state.subcategories[catId]||[];
    subs.forEach(s=>{
      const o=document.createElement('option');
      o.value=s;o.textContent=s;
      if(s===parentSub) o.selected=true;
      selSub.appendChild(o);
    });
  } else {
    selSub.style.display='none';
    selSub.innerHTML='';
  }

  document.getElementById('subcat-input').value='';
  openModal('subcat-modal');
  setTimeout(()=>document.getElementById('subcat-input').focus(),100);
}

function updateSubcatParentSub(){
  const catId=document.getElementById('subcat-parent-cat').value;
  const selSub=document.getElementById('subcat-parent-sub');
  const subs=state.subcategories[catId]||[];
  if(subs.length>0){
    selSub.style.display='block';
    selSub.innerHTML='<option value="">— brak (dodaj do głównej) —</option>';
    subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;selSub.appendChild(o);});
  } else {
    selSub.style.display='none';
  }
}

function confirmSubcat(){
  const val=document.getElementById('subcat-input').value.trim();
  const catId=document.getElementById('subcat-parent-cat').value;
  const parentSub=document.getElementById('subcat-parent-sub').value;

  if(!val) return;

  if(parentSub){
    // Dodaj podpodkategorię
    const key=catId+'/'+parentSub;
    if(!state.subsubcategories[key]) state.subsubcategories[key]=[];
    if(!state.subsubcategories[key].includes(val)) state.subsubcategories[key].push(val);
  } else {
    // Dodaj podkategorię
    if(!state.subcategories[catId]) state.subcategories[catId]=[];
    if(!state.subcategories[catId].includes(val)) state.subcategories[catId].push(val);
  }

  save();closeModal('subcat-modal');renderNotes();
}

// ========== MODAL: DODAJ KAT ==========

function confirmAddCat(){
  const val=document.getElementById('addcat-input').value.trim();
  if(!val) return;
  const id='cat_'+Date.now();
  const color=state.categories.length%8;
  state.categories.push({id,name:val,color});
  save();closeModal('addcat-modal');renderNotes();
}

// ========== MODAL: PRZYPISZ ==========

function openAssignModal(noteId){
  state.assignNoteId=noteId;
  const selCat=document.getElementById('assign-cat');
  selCat.innerHTML='';
  state.categories.forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat.id;o.textContent=cat.name;
    selCat.appendChild(o);
  });
  updateAssignSub();
  openModal('assign-modal');
}

function updateAssignSub(){
  const catId=document.getElementById('assign-cat').value;
  const selSub=document.getElementById('assign-sub');
  const selSubSub=document.getElementById('assign-subsub');
  const subs=state.subcategories[catId]||[];
  if(subs.length>0){
    selSub.style.display='block';
    selSub.innerHTML='<option value="">— bez podkategorii —</option>';
    subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;selSub.appendChild(o);});
  } else {
    selSub.style.display='none';
  }
  selSubSub.style.display='none';
}

function updateAssignSubSub(){
  const catId=document.getElementById('assign-cat').value;
  const sub=document.getElementById('assign-sub').value;
  const selSubSub=document.getElementById('assign-subsub');
  if(sub){
    const key=catId+'/'+sub;
    const subsubs=state.subsubcategories[key]||[];
    if(subsubs.length>0){
      selSubSub.style.display='block';
      selSubSub.innerHTML='<option value="">— bez podpodkategorii —</option>';
      subsubs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;selSubSub.appendChild(o);});
    } else {
      selSubSub.style.display='none';
    }
  } else {
    selSubSub.style.display='none';
  }
}

function confirmAssign(){
  const note=state.notes.find(n=>n.id===state.assignNoteId);
  if(!note){closeModal('assign-modal');return;}
  note.category=document.getElementById('assign-cat').value;
  note.subcategory=document.getElementById('assign-sub').value||null;
  note.subsubcategory=document.getElementById('assign-subsub').value||null;
  note.pending=false;
  save();closeModal('assign-modal');renderNotes();
}

// ========== MODAL HELPERS ==========

function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}

// ========== FILTRY ==========

function toggleFilters(){
  const panel=document.getElementById('filters-panel');
  panel.style.display=panel.style.display==='none'?'flex':'none';
}

function clearFilters(){
  state.currentFilter={q:'',cat:'',status:'',dateFrom:'',dateTo:''};
  document.getElementById('notes-search-input').value='';
  document.getElementById('filter-cat').value='';
  document.getElementById('filter-status').value='';
  document.getElementById('filter-date-from').value='';
  document.getElementById('filter-date-to').value='';
  renderNotes();
}

// ========== WYSZUKIWANIE ==========

function doSearch(q){
  const res=document.getElementById('search-results');
  const query=q.trim().toLowerCase();
  if(!query){res.innerHTML='<div class="empty-state">Wpisz frazę aby przeszukać notatki</div>';return;}
  const found=state.notes.filter(n=>
    n.text.toLowerCase().includes(query)||
    getCatName(n.category).toLowerCase().includes(query)||
    (n.subcategory&&n.subcategory.toLowerCase().includes(query))
  ).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  if(!found.length){res.innerHTML='<div class="empty-state">Brak wyników</div>';return;}
  res.innerHTML='';
  found.forEach(n=>res.appendChild(buildNoteCard(n)));
}

function startVoiceSearch(){
  const btn=document.getElementById('voice-search-btn');
  btn.style.color='var(--gold2)';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const sr=new SR();
  sr.lang='pl-PL';
  sr.onresult=e=>{
    const q=e.results[0][0].transcript;
    document.getElementById('search-full-input').value=q;
    doSearch(q);btn.style.color='';
  };
  sr.onerror=()=>btn.style.color='';
  sr.onend=()=>btn.style.color='';
  sr.start();
}

// ========== EKSPORT & IMPORT ==========

function exportNotes(){
  const lines=['WHISPR — Eksport','Data: '+new Date().toLocaleDateString('pl-PL'),'','---',''];
  [...state.notes].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).forEach(n=>{
    const d=new Date(n.ts);
    lines.push('['+d.toLocaleDateString('pl-PL')+' '+d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+']');
    let cat=getCatName(n.category);
    if(n.subcategory) cat+=' › '+n.subcategory;
    if(n.subsubcategory) cat+=' › '+n.subsubcategory;
    lines.push('Kategoria: '+cat);
    lines.push(n.text);
    lines.push('');
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='whispr-'+new Date().toISOString().slice(0,10)+'.txt';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// ========== TIMER & WAVE ==========

function startTimer(){
  timerSeconds=0;document.getElementById('timer').textContent='0:00';
  timerInterval=setInterval(()=>{
    timerSeconds++;
    const m=Math.floor(timerSeconds/60),s=timerSeconds%60;
    document.getElementById('timer').textContent=m+':'+String(s).padStart(2,'0');
  },1000);
}
function resetTimer(){document.getElementById('timer').textContent='0:00';}

function startWave(){
  const canvas=document.getElementById('wave-canvas');
  const ctx=canvas.getContext('2d');
  canvas.classList.add('on');
  function draw(){
    waveAnimFrame=requestAnimationFrame(draw);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bars=24;
    for(let i=0;i<bars;i++){
      const h=3+Math.random()*(canvas.height-6);
      const x=i*(canvas.width/bars);
      const y=(canvas.height-h)/2;
      ctx.fillStyle='#c9a84c';ctx.globalAlpha=0.3+Math.random()*0.7;
      ctx.beginPath();ctx.roundRect(x,y,5,h,2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  draw();
}

function setRecordUI(mode){
  const btn=document.getElementById('record-btn');
  const outer=document.getElementById('record-outer');
  const mic=document.getElementById('icon-mic');
  const stop=document.getElementById('icon-stop');
  const hint=document.getElementById('record-hint');
  btn.className='record-btn '+mode;
  outer.className='record-outer '+mode;
  mic.style.display=mode==='idle'?'block':'none';
  stop.style.display=mode==='recording'?'block':'none';
  if(hint){hint.className='record-hint'+(mode==='recording'?' on':'');hint.textContent=mode==='idle'?'Dotknij aby nagrać':'Nagrywam... dotknij aby zakończyć';}
}

function importNotes(event){
  const file=event.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    const text=e.target.result;
    const lines=text.split('\n');
    let imported=0;
    let i=0;
    while(i<lines.length){
      // Szukaj linii z datą w formacie [DD.MM.YYYY HH:MM]
      const match=lines[i].match(/^\[(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{2}:\d{2})\]/);
      if(match){
        const dateStr=match[1]; // DD.MM.YYYY
        const timeStr=match[2]; // HH:MM
        const parts=dateStr.split('.');
        const ts=new Date(parts[2]+'-'+parts[1].padStart(2,'0')+'-'+parts[0].padStart(2,'0')+'T'+timeStr+':00').toISOString();
        // Linia z kategorią
        let category='rozwoj';
        let subcategory=null;
        let subsubcategory=null;
        if(i+1<lines.length&&lines[i+1].startsWith('Kategoria:')){
          const catLine=lines[i+1].replace('Kategoria:','').trim();
          const catParts=catLine.split('›').map(s=>s.trim());
          const foundCat=state.categories.find(c=>c.name===catParts[0]);
          if(foundCat) category=foundCat.id;
          if(catParts[1]) subcategory=catParts[1];
          if(catParts[2]) subsubcategory=catParts[2];
          i+=2;
        } else {
          i++;
        }
        // Treść notatki
        let noteText='';
        while(i<lines.length&&lines[i].trim()!==''&&!lines[i].match(/^\[/)){
          noteText+=lines[i]+' ';
          i++;
        }
        noteText=noteText.trim();
        if(noteText){
          const id=Date.now()+Math.random();
          state.notes.push({id,ts,text:noteText,category,subcategory,subsubcategory,pending:false});
          imported++;
        }
      } else {
        i++;
      }
    }
    if(imported>0){
      save();renderNotes();
      alert('Zaimportowano '+imported+' notatek!');
    } else {
      alert('Nie znaleziono notatek w pliku.');
    }
    event.target.value='';
  };
  reader.readAsText(file);
}

function showError(msg){const b=document.getElementById('error-box');b.textContent=msg;b.style.display='block';}
function hideError(){document.getElementById('error-box').style.display='none';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
