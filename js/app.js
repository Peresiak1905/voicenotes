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
  rozwoj:['pomysł','kurs','książka','nauka','cel','plan','rozwój','inspiracja','podcast','szkolenie'],
};

let S = {
  notes:[],cats:[...DEFAULT_CATS],subcats:{},subsubcats:{},
  isRec:false,activeCatId:null,assignNoteId:null,
  filter:{q:'',cat:'',status:'',from:'',to:''},
  catOrder:null,
};

let rec=null,timerInt=null,timerSec=0,waveAF=null;
let transcript='',interim='';

// ═══ INIT ═══

function init(){
  migrate();load();
  setDate();renderNotesTab();
  bind();checkSupport();
}

function migrate(){
  ['vn_notes','whispr_notes','w21_notes'].forEach(k=>{
    try{
      const d=localStorage.getItem(k);
      if(!d) return;
      const arr=JSON.parse(d);
      if(!Array.isArray(arr)||!arr.length) return;
      const ex=JSON.parse(localStorage.getItem('w23_notes')||'[]');
      const ids=new Set(ex.map(n=>String(n.id)));
      const newOnes=arr.filter(n=>!ids.has(String(n.id)));
      if(newOnes.length) localStorage.setItem('w23_notes',JSON.stringify([...ex,...newOnes]));
      localStorage.removeItem(k);
    }catch(e){}
  });
}

function load(){
  try{
    const n=localStorage.getItem('w23_notes');
    const c=localStorage.getItem('w23_cats');
    const s=localStorage.getItem('w23_subcats');
    const ss=localStorage.getItem('w23_subsubcats');
    const o=localStorage.getItem('w23_catorder');
    if(n) S.notes=JSON.parse(n);
    if(c) S.cats=JSON.parse(c);
    if(s) S.subcats=JSON.parse(s);
    if(ss) S.subsubcats=JSON.parse(ss);
    if(o) S.catOrder=JSON.parse(o);
  }catch(e){}
}

function save(){
  localStorage.setItem('w23_notes',JSON.stringify(S.notes));
  localStorage.setItem('w23_cats',JSON.stringify(S.cats));
  localStorage.setItem('w23_subcats',JSON.stringify(S.subcats));
  localStorage.setItem('w23_subsubcats',JSON.stringify(S.subsubcats));
  if(S.catOrder) localStorage.setItem('w23_catorder',JSON.stringify(S.catOrder));
}

function checkSupport(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window))
    showErr('Użyj Safari lub Chrome — brak obsługi nagrywania.');
}

// ═══ BIND ═══

function bind(){
  document.querySelectorAll('.bnav,.back-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  document.getElementById('search-bar-home').addEventListener('click',()=>switchTab('search'));
  document.getElementById('record-btn').addEventListener('click',toggleRec);
  document.getElementById('voice-search-btn').addEventListener('click',()=>voiceSearch('voice-search-btn','search-full-input'));
  document.getElementById('export-btn').addEventListener('click',exportNotes);
  document.getElementById('import-btn').addEventListener('click',()=>document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change',importNotes);
  document.getElementById('notes-search-input').addEventListener('input',e=>{S.filter.q=e.target.value;renderNotesTab();});
  document.getElementById('filter-btn').addEventListener('click',()=>{const p=document.getElementById('filters-panel');p.style.display=p.style.display==='none'?'flex':'none';});
  document.getElementById('filter-cat').addEventListener('change',e=>{S.filter.cat=e.target.value;renderNotesTab();});
  document.getElementById('filter-status').addEventListener('change',e=>{S.filter.status=e.target.value;renderNotesTab();});
  document.getElementById('filter-from').addEventListener('change',e=>{S.filter.from=e.target.value;renderNotesTab();});
  document.getElementById('filter-to').addEventListener('change',e=>{S.filter.to=e.target.value;renderNotesTab();});
  document.getElementById('filter-clear').addEventListener('click',clearFilter);
  document.getElementById('add-cat-btn').addEventListener('click',()=>openModal('modal-addcat'));
  document.getElementById('bulk-assign-btn').addEventListener('click',openBulkModal);
  document.getElementById('cat-back-btn').addEventListener('click',hideCatContent);
  document.getElementById('add-subcat-btn').addEventListener('click',()=>openSubcatModal(S.activeCatId,null));
  document.getElementById('search-full-input').addEventListener('input',e=>doSearch(e.target.value));
  document.getElementById('voice-search-full').addEventListener('click',()=>voiceSearch('voice-search-full','search-full-input'));

  // Modals
  document.getElementById('subcat-cancel').addEventListener('click',()=>closeModal('modal-subcat'));
  document.getElementById('subcat-ok').addEventListener('click',confirmSubcat);
  document.getElementById('subcat-cat').addEventListener('change',updateSubcatSub);
  document.getElementById('addcat-cancel').addEventListener('click',()=>closeModal('modal-addcat'));
  document.getElementById('addcat-ok').addEventListener('click',confirmAddCat);
  document.getElementById('assign-cancel').addEventListener('click',()=>closeModal('modal-assign'));
  document.getElementById('assign-ok').addEventListener('click',confirmAssign);
  document.getElementById('assign-cat').addEventListener('change',updateAssignSub);
  document.getElementById('assign-sub').addEventListener('change',updateAssignSubSub);
  document.getElementById('bulk-cancel').addEventListener('click',()=>closeModal('modal-bulk'));
  document.getElementById('bulk-ok').addEventListener('click',confirmBulk);
  document.getElementById('bulk-cat').addEventListener('change',updateBulkSub);
}

// ═══ NAV ═══

function switchTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelectorAll('[data-tab="'+tab+'"]').forEach(b=>{if(b.classList.contains('bnav'))b.classList.add('active');});
  if(tab==='notes') renderNotesTab();
  if(tab==='search') setTimeout(()=>document.getElementById('search-full-input').focus(),100);
}

function setDate(){
  const el=document.getElementById('logo-date');
  if(el) el.textContent=new Date().toLocaleDateString('pl-PL',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}

// ═══ NAGRYWANIE ═══

function toggleRec(){S.isRec?stopRec():startRec();}

function startRec(){
  hideErr();transcript='';interim='';setLive('Zacznij mówić...');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  rec=new SR();rec.lang='pl-PL';rec.continuous=true;rec.interimResults=true;

  rec.onstart=()=>{S.isRec=true;setRecUI('recording');startTimer();startWave();};

  rec.onresult=(e)=>{
    let f='',i='';
    for(let j=e.resultIndex;j<e.results.length;j++){
      const t=e.results[j][0].transcript;
      if(e.results[j].isFinal) f+=t+' '; else i+=t;
    }
    transcript+=f;interim=i;
    const p=(transcript+i).trim();
    setLive(p||'Nagrywam...');
    const h=document.getElementById('record-hint');
    if(h){h.textContent=p.length>50?'...'+p.slice(-50):p||'Nagrywam...';h.className='record-hint on';}
  };

  rec.onerror=(e)=>{
    if(e.error==='not-allowed') showErr('Brak dostępu do mikrofonu.');
    else if(e.error!=='aborted') showErr('Błąd: '+e.error);
    cleanupRec();
  };

  rec.onend=()=>{if(S.isRec){try{rec.start();}catch(e){}}};
  try{rec.start();}catch(e){showErr('Błąd: '+e.message);}
}

function stopRec(){
  S.isRec=false;
  if(rec){rec.onend=null;rec.stop();rec=null;}
  cleanupRec();
  const text=(transcript+' '+interim).trim();
  if(text){
    S.notes.push({id:Date.now()+Math.random(),ts:new Date().toISOString(),text,category:classify(text),subcategory:null,subsubcategory:null,pending:true});
    save();
  } else showErr('Nic nie nagrano. Spróbuj ponownie.');
}

function cleanupRec(){
  clearInterval(timerInt);cancelAnimationFrame(waveAF);
  document.getElementById('wave-canvas').classList.remove('on');
  setRecUI('idle');resetTimer();setLive('Zacznij mówić...');
}

function setLive(text){const el=document.getElementById('live-text');if(el)el.textContent=text;}

function classify(text){
  const l=text.toLowerCase();let best='rozwoj',score=0;
  for(const[id,kws] of Object.entries(KW)){
    if(!S.cats.find(c=>c.id===id)) continue;
    let s=0;for(const k of kws){if(l.includes(k))s++;}
    if(s>score){score=s;best=id;}
  }
  return best;
}

// ═══ RENDER NOTES TAB ═══

function renderNotesTab(){
  renderFilterCats();
  const f=S.filter;
  let notes=[...S.notes];
  if(f.q) notes=notes.filter(n=>n.text.toLowerCase().includes(f.q.toLowerCase()));
  if(f.cat) notes=notes.filter(n=>n.category===f.cat);
  if(f.status==='pending') notes=notes.filter(n=>n.pending);
  if(f.status==='ok') notes=notes.filter(n=>!n.pending);
  if(f.from) notes=notes.filter(n=>new Date(n.ts)>=new Date(f.from));
  if(f.to) notes=notes.filter(n=>new Date(n.ts)<=new Date(f.to+'T23:59:59'));
  notes.sort((a,b)=>new Date(b.ts)-new Date(a.ts));

  // Pending section
  const pending=notes.filter(n=>n.pending);
  const ps=document.getElementById('pending-section');
  const pn=document.getElementById('pending-notes');
  const pc=document.getElementById('pending-count');
  if(pending.length){
    ps.style.display='block';pc.textContent=pending.length;
    pn.innerHTML='';pending.forEach(n=>pn.appendChild(buildCard(n,true)));
  } else ps.style.display='none';

  // Cat pills grid
  renderCatGrid(notes.filter(n=>!n.pending));

  // Jeśli aktywna kategoria — odśwież jej zawartość
  if(S.activeCatId) showCatContent(S.activeCatId, notes.filter(n=>!n.pending));
}

function renderFilterCats(){
  const sel=document.getElementById('filter-cat');
  const cur=sel.value;
  sel.innerHTML='<option value="">Wszystkie</option>';
  S.cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;if(c.id===cur)o.selected=true;sel.appendChild(o);});
}

function renderCatGrid(notes){
  const grid=document.getElementById('cat-pills-grid');
  grid.innerHTML='';

  // Drag & drop order
  const orderedCats=getOrderedCats();

  orderedCats.forEach((cat,idx)=>{
    const count=notes.filter(n=>n.category===cat.id).length;
    const pill=document.createElement('div');
    pill.className='cat-pill-item cc-'+cat.color+(S.activeCatId===cat.id?' active':'');
    pill.dataset.catid=cat.id;
    pill.dataset.idx=idx;
    pill.draggable=true;

    pill.innerHTML=
      '<span class="cat-pill-name">'+cat.name+'</span>'+
      '<span class="cat-pill-count">'+count+'</span>'+
      '<button class="cat-pill-del" title="Usuń">×</button>';

    pill.addEventListener('click',e=>{
      if(e.target.classList.contains('cat-pill-del')) return;
      if(S.activeCatId===cat.id){hideCatContent();}
      else{S.activeCatId=cat.id;renderNotesTab();}
    });

    pill.querySelector('.cat-pill-del').addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm('Usunąć kategorię "'+cat.name+'"?')){
        S.notes.forEach(n=>{if(n.category===cat.id)n.category='rozwoj';});
        S.cats=S.cats.filter(c=>c.id!==cat.id);
        if(S.activeCatId===cat.id) S.activeCatId=null;
        save();renderNotesTab();
      }
    });

    // Drag & drop
    pill.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',idx);pill.style.opacity='0.5';});
    pill.addEventListener('dragend',()=>{pill.style.opacity='1';});
    pill.addEventListener('dragover',e=>{e.preventDefault();});
    pill.addEventListener('drop',e=>{
      e.preventDefault();
      const fromIdx=parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx=idx;
      if(fromIdx===toIdx) return;
      const order=[...getOrderedCats()];
      const [moved]=order.splice(fromIdx,1);
      order.splice(toIdx,0,moved);
      S.catOrder=order.map(c=>c.id);
      save();renderNotesTab();
    });

    grid.appendChild(pill);
  });

  // Cat content
  const cc=document.getElementById('cat-content');
  cc.style.display=S.activeCatId?'flex':'none';
}

function getOrderedCats(){
  if(!S.catOrder) return S.cats;
  const ordered=[];
  S.catOrder.forEach(id=>{const c=S.cats.find(c=>c.id===id);if(c)ordered.push(c);});
  S.cats.forEach(c=>{if(!ordered.find(o=>o.id===c.id))ordered.push(c);});
  return ordered;
}

function showCatContent(catId, notes){
  const cat=S.cats.find(c=>c.id===catId);
  if(!cat) return;
  const catNotes=notes.filter(n=>n.category===catId);
  document.getElementById('cat-content-title').textContent=cat.name;
  document.getElementById('cat-content').style.display='flex';
  document.getElementById('add-subcat-btn').onclick=()=>openSubcatModal(catId,null);

  // Subkategorie
  const subcatsWrap=document.getElementById('cat-subcats');
  subcatsWrap.innerHTML='';
  const subs=S.subcats[catId]||[];
  subs.forEach(sub=>{
    const subKey=catId+'/'+sub;
    const subSubs=S.subsubcats[subKey]||[];
    const subNotes=catNotes.filter(n=>n.subcategory===sub);
    const item=document.createElement('div');
    item.className='subcat-item';
    item.innerHTML=
      '<div class="subcat-header">'+
        '<span class="subcat-name">'+sub+'</span>'+
        '<span class="subcat-count">'+subNotes.length+'</span>'+
        '<div class="subcat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>'+
      '</div>'+
      '<div class="subcat-body"></div>';
    item.querySelector('.subcat-header').addEventListener('click',()=>item.classList.toggle('open'));

    const body=item.querySelector('.subcat-body');
    subSubs.forEach(ss=>{
      const ssNotes=subNotes.filter(n=>n.subsubcategory===ss);
      const ssItem=document.createElement('div');
      ssItem.className='subsubcat-item';
      ssItem.innerHTML=
        '<div class="subsubcat-header">'+
          '<span class="subsubcat-name">'+ss+'</span>'+
          '<span class="subsubcat-count">'+ssNotes.length+'</span>'+
          '<div class="subsubcat-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>'+
        '</div>'+
        '<div class="subsubcat-body"></div>';
      ssItem.querySelector('.subsubcat-header').addEventListener('click',()=>ssItem.classList.toggle('open'));
      ssNotes.forEach(n=>ssItem.querySelector('.subsubcat-body').appendChild(buildCard(n)));
      body.appendChild(ssItem);
    });

    subNotes.filter(n=>!n.subsubcategory).forEach(n=>body.appendChild(buildCard(n)));
    const addSSBtn=document.createElement('button');
    addSSBtn.className='add-subcat-btn';addSSBtn.style.fontSize='10px';addSSBtn.style.padding='6px 10px';
    addSSBtn.textContent='+ podpodkategoria';
    addSSBtn.addEventListener('click',()=>openSubcatModal(catId,sub));
    body.appendChild(addSSBtn);
    subcatsWrap.appendChild(item);
  });

  // Notatki bez podkategorii
  const notesList=document.getElementById('cat-notes-list');
  notesList.innerHTML='';
  catNotes.filter(n=>!n.subcategory).forEach(n=>notesList.appendChild(buildCard(n)));
}

function hideCatContent(){
  S.activeCatId=null;
  document.getElementById('cat-content').style.display='none';
  renderNotesTab();
}

// ═══ NOTE CARD ═══

function buildCard(note, showCheckbox=false){
  const card=document.createElement('div');
  card.className='note-card'+(note.pending?' pending':'');
  const d=new Date(note.ts);
  const t=d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const dt=d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'});
  const catName=getCatName(note.category);
  const badge=catName+(note.subcategory?' › '+note.subcategory:'')+(note.subsubcategory?' › '+note.subsubcategory:'');
  const q=S.filter.q;
  const highlighted=q?highlightText(esc(note.text),q):esc(note.text);

  card.innerHTML=
    '<div class="note-meta">'+
      (showCheckbox?'<input type="checkbox" class="note-checkbox" data-id="'+note.id+'">':'')+
      '<span class="note-time">'+t+' · '+dt+'</span>'+
      '<span class="note-badge">'+badge+'</span>'+
      (note.pending?'<span class="note-pending-tag">⚠</span>':'')+
    '</div>'+
    '<div class="note-text">'+highlighted+'</div>'+
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
    else{note.text=ta.value;tel.innerHTML=highlightText(esc(ta.value),S.filter.q);tel.style.display='block';ta.style.display='none';eb.textContent='Edytuj';save();}
  });
  const ob=card.querySelector('.ok-btn');
  if(ob) ob.addEventListener('click',()=>{note.pending=false;save();renderNotesTab();});
  card.querySelector('.del-btn').addEventListener('click',()=>{S.notes=S.notes.filter(n=>n.id!==note.id);save();renderNotesTab();});
  return card;
}

function highlightText(text,q){
  if(!q) return text;
  const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return text.replace(re,'<mark>$1</mark>');
}

function getCatName(id){const c=S.cats.find(c=>c.id===id);return c?c.name:id;}

// ═══ MODALS ═══

function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}

function openSubcatModal(catId,parentSub){
  const selCat=document.getElementById('subcat-cat');
  const selSub=document.getElementById('subcat-sub');
  selCat.innerHTML='';
  S.cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;if(c.id===catId)o.selected=true;selCat.appendChild(o);});
  if(parentSub){
    selSub.style.display='block';selSub.innerHTML='';
    (S.subcats[catId]||[]).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(s===parentSub)o.selected=true;selSub.appendChild(o);});
  } else {selSub.style.display='none';}
  document.getElementById('subcat-name').value='';
  openModal('modal-subcat');
  setTimeout(()=>document.getElementById('subcat-name').focus(),100);
}

function updateSubcatSub(){
  const catId=document.getElementById('subcat-cat').value;
  const sel=document.getElementById('subcat-sub');
  const subs=S.subcats[catId]||[];
  if(subs.length){sel.style.display='block';sel.innerHTML='<option value="">— do głównej —</option>';subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});}
  else sel.style.display='none';
}

function confirmSubcat(){
  const val=document.getElementById('subcat-name').value.trim();
  const catId=document.getElementById('subcat-cat').value;
  const sub=document.getElementById('subcat-sub').value;
  if(!val) return;
  if(sub){const k=catId+'/'+sub;if(!S.subsubcats[k])S.subsubcats[k]=[];if(!S.subsubcats[k].includes(val))S.subsubcats[k].push(val);}
  else{if(!S.subcats[catId])S.subcats[catId]=[];if(!S.subcats[catId].includes(val))S.subcats[catId].push(val);}
  save();closeModal('modal-subcat');renderNotesTab();
}

function confirmAddCat(){
  const val=document.getElementById('addcat-name').value.trim();
  if(!val) return;
  S.cats.push({id:'cat_'+Date.now(),name:val,color:S.cats.length%8});
  save();closeModal('modal-addcat');renderNotesTab();
}

function openAssignModal(noteId){
  S.assignNoteId=noteId;
  const sel=document.getElementById('assign-cat');
  sel.innerHTML='';S.cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);});
  document.getElementById('assign-sub').style.display='none';
  document.getElementById('assign-subsub').style.display='none';
  updateAssignSub();openModal('modal-assign');
}

function updateAssignSub(){
  const catId=document.getElementById('assign-cat').value;
  const sel=document.getElementById('assign-sub');
  const subs=S.subcats[catId]||[];
  if(subs.length){sel.style.display='block';sel.innerHTML='<option value="">— bez podkategorii —</option>';subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});}
  else sel.style.display='none';
  document.getElementById('assign-subsub').style.display='none';
}

function updateAssignSubSub(){
  const catId=document.getElementById('assign-cat').value;
  const sub=document.getElementById('assign-sub').value;
  const sel=document.getElementById('assign-subsub');
  if(sub){const k=catId+'/'+sub;const ss=S.subsubcats[k]||[];if(ss.length){sel.style.display='block';sel.innerHTML='<option value="">— bez podpodkategorii —</option>';ss.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});return;}}
  sel.style.display='none';
}

function confirmAssign(){
  const note=S.notes.find(n=>n.id===S.assignNoteId);
  if(!note){closeModal('modal-assign');return;}
  note.category=document.getElementById('assign-cat').value;
  note.subcategory=document.getElementById('assign-sub').value||null;
  note.subsubcategory=document.getElementById('assign-subsub').value||null;
  note.pending=false;
  save();closeModal('modal-assign');renderNotesTab();
}

// BULK ASSIGN
function openBulkModal(){
  const sel=document.getElementById('bulk-cat');
  sel.innerHTML='';S.cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);});
  document.getElementById('bulk-sub').style.display='none';
  updateBulkSub();openModal('modal-bulk');
}

function updateBulkSub(){
  const catId=document.getElementById('bulk-cat').value;
  const sel=document.getElementById('bulk-sub');
  const subs=S.subcats[catId]||[];
  if(subs.length){sel.style.display='block';sel.innerHTML='<option value="">— bez podkategorii —</option>';subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});}
  else sel.style.display='none';
}

function confirmBulk(){
  const cat=document.getElementById('bulk-cat').value;
  const sub=document.getElementById('bulk-sub').value||null;
  S.notes.filter(n=>n.pending).forEach(n=>{n.category=cat;n.subcategory=sub;n.pending=false;});
  save();closeModal('modal-bulk');renderNotesTab();
}

// ═══ SEARCH ═══

function doSearch(q){
  const res=document.getElementById('search-results');
  const query=q.trim().toLowerCase();
  if(!query){res.innerHTML='<div class="empty-state">Wpisz frazę aby przeszukać</div>';return;}
  const found=S.notes.filter(n=>n.text.toLowerCase().includes(query)||getCatName(n.category).toLowerCase().includes(query)||(n.subcategory&&n.subcategory.toLowerCase().includes(query))).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  if(!found.length){res.innerHTML='<div class="empty-state">Brak wyników</div>';return;}
  
  // Auto-otwieranie przy 1 wyniku
  if(found.length===1){
    res.innerHTML='';
    const card=buildCardSearch(found[0],query);
    card.querySelector('.note-textarea')&&(card.style.cursor='default');
    res.appendChild(card);
    return;
  }
  res.innerHTML='';
  found.forEach(n=>res.appendChild(buildCardSearch(n,query)));
}

function buildCardSearch(note,q){
  const card=buildCard(note);
  if(q){
    const textEl=card.querySelector('.note-text');
    if(textEl) textEl.innerHTML=highlightText(esc(note.text),q);
  }
  return card;
}

function voiceSearch(btnId,inputId){
  const btn=document.getElementById(btnId);
  btn.style.color='var(--gold2)';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const sr=new SR();sr.lang='pl-PL';
  sr.onresult=e=>{const q=e.results[0][0].transcript;document.getElementById(inputId).value=q;doSearch(q);btn.style.color='';};
  sr.onerror=()=>btn.style.color='';sr.onend=()=>btn.style.color='';
  sr.start();
}

function clearFilter(){
  S.filter={q:'',cat:'',status:'',from:'',to:''};
  document.getElementById('notes-search-input').value='';
  ['filter-cat','filter-status','filter-from','filter-to'].forEach(id=>document.getElementById(id).value='');
  renderNotesTab();
}

// ═══ EXPORT / IMPORT ═══

function exportNotes(){
  const lines=['WHISPR — Eksport','Data: '+new Date().toLocaleDateString('pl-PL'),'','---',''];
  [...S.notes].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).forEach(n=>{
    const d=new Date(n.ts);
    lines.push('['+d.toLocaleDateString('pl-PL')+' '+d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+']');
    let cat=getCatName(n.category);if(n.subcategory)cat+=' › '+n.subcategory;if(n.subsubcategory)cat+=' › '+n.subsubcategory;
    lines.push('Kategoria: '+cat);lines.push(n.text);lines.push('');
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='whispr-'+new Date().toISOString().slice(0,10)+'.txt';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

function importNotes(event){
  const file=event.target.files[0];if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    const lines=e.target.result.split('\n');
    let imported=0,i=0;
    while(i<lines.length){
      const match=lines[i].match(/^\[(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{2}:\d{2})\]/);
      if(match){
        const p=match[1].split('.');
        const ts=new Date(p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T'+match[2]+':00').toISOString();
        let cat='rozwoj',sub=null,subsub=null;
        if(i+1<lines.length&&lines[i+1].startsWith('Kategoria:')){
          const parts=lines[i+1].replace('Kategoria:','').trim().split('›').map(s=>s.trim());
          const fc=S.cats.find(c=>c.name===parts[0]);if(fc)cat=fc.id;
          if(parts[1])sub=parts[1];if(parts[2])subsub=parts[2];i+=2;
        } else i++;
        let text='';
        while(i<lines.length&&lines[i].trim()!==''&&!lines[i].match(/^\[/)){text+=lines[i]+' ';i++;}
        text=text.trim();
        if(text){S.notes.push({id:Date.now()+Math.random(),ts,text,category:cat,subcategory:sub,subsubcategory:subsub,pending:false});imported++;}
      } else i++;
    }
    if(imported>0){save();renderNotesTab();alert('Zaimportowano '+imported+' notatek!');}
    else alert('Nie znaleziono notatek w pliku.');
    event.target.value='';
  };
  reader.readAsText(file);
}

// ═══ TIMER & WAVE ═══

function startTimer(){timerSec=0;document.getElementById('timer').textContent='0:00';timerInt=setInterval(()=>{timerSec++;const m=Math.floor(timerSec/60),s=timerSec%60;document.getElementById('timer').textContent=m+':'+String(s).padStart(2,'0');},1000);}
function resetTimer(){document.getElementById('timer').textContent='0:00';}

function startWave(){
  const canvas=document.getElementById('wave-canvas');const ctx=canvas.getContext('2d');canvas.classList.add('on');
  function draw(){
    waveAF=requestAnimationFrame(draw);ctx.clearRect(0,0,canvas.width,canvas.height);
    const bars=26;
    for(let i=0;i<bars;i++){
      const h=3+Math.random()*(canvas.height-6);const x=i*(canvas.width/bars);const y=(canvas.height-h)/2;
      ctx.fillStyle='#c9a84c';ctx.globalAlpha=0.3+Math.random()*0.7;
      ctx.beginPath();ctx.roundRect(x,y,5,h,2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  draw();
}

function setRecUI(mode){
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

function showErr(msg){const b=document.getElementById('error-box');if(b){b.textContent=msg;b.style.display='block';}}
function hideErr(){const b=document.getElementById('error-box');if(b)b.style.display='none';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
