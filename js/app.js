// WHISPR 2.4 — Folder → Kategoria → Grupa → Temat

const DEFAULT_FOLDERS = [
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
  finanse:['złoty','zł','pieniądze','wydatek','przelew','bank','konto','kredyt','rachunek','płatność','cena','koszt'],
  rozwoj:['pomysł','kurs','książka','nauka','cel','plan','rozwój','inspiracja','podcast','szkolenie'],
};

// Struktura: notes[].folder, .category, .group, .topic
// Drzewo: S.tree[folderId] = { cats: {catName: {groups: {groupName: [topicName,...]}}}}

let S = {
  notes:[],
  folders:[...DEFAULT_FOLDERS],
  tree:{}, // folderId -> { catName -> { groupName -> [topicName,...] } }
  activeFolder:null,
  activeCat:null,
  activeGroup:null,
  assignNoteId:null,
  bulkSource:null, // 'pending' | folderId
  filter:{q:'',folder:'',status:'',from:'',to:''},
  isRec:false,
};

let rec=null,timerInt=null,timerSec=0,waveAF=null,transcript='',interim='';

// ═══ INIT ═══
function init(){
  migrate(); load();
  setDate(); renderNotesTab();
  bind(); checkSupport();
}

function migrate(){
  ['vn_notes','whispr_notes','w21_notes','w23_notes'].forEach(k=>{
    try{
      const d=localStorage.getItem(k); if(!d) return;
      const arr=JSON.parse(d); if(!Array.isArray(arr)||!arr.length) return;
      const ex=JSON.parse(localStorage.getItem('w24_notes')||'[]');
      const ids=new Set(ex.map(n=>String(n.id)));
      const newOnes=arr.filter(n=>!ids.has(String(n.id))).map(n=>({
        id:n.id, ts:n.ts, text:n.text, pending:n.pending||false,
        folder:n.folder||n.category||'razvoj',
        category:n.subcategory||n.category2||null,
        group:n.subsubcategory||n.group||null,
        topic:n.topic||null,
      }));
      if(newOnes.length) localStorage.setItem('w24_notes',JSON.stringify([...ex,...newOnes]));
      localStorage.removeItem(k);
    }catch(e){}
  });
}

function load(){
  try{
    const n=localStorage.getItem('w24_notes');
    const f=localStorage.getItem('w24_folders');
    const t=localStorage.getItem('w24_tree');
    if(n) S.notes=JSON.parse(n);
    if(f) S.folders=JSON.parse(f);
    if(t) S.tree=JSON.parse(t);
  }catch(e){}
}

function save(){
  localStorage.setItem('w24_notes',JSON.stringify(S.notes));
  localStorage.setItem('w24_folders',JSON.stringify(S.folders));
  localStorage.setItem('w24_tree',JSON.stringify(S.tree));
}

function checkSupport(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window))
    showErr('Użyj Safari lub Chrome.');
}

// ═══ BIND ═══
function bind(){
  document.querySelectorAll('.bnav,.back-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  document.getElementById('search-pill-btn').addEventListener('click',()=>switchTab('search'));
  document.getElementById('home-voice-btn').addEventListener('click',e=>{e.stopPropagation();voiceSearch('search-q');switchTab('search');});
  document.getElementById('rec-btn').addEventListener('click',toggleRec);
  document.getElementById('export-btn').addEventListener('click',exportNotes);
  document.getElementById('import-btn').addEventListener('click',()=>document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change',importNotes);
  document.getElementById('notes-q').addEventListener('input',e=>{S.filter.q=e.target.value;renderNotesTab();});
  document.getElementById('filter-btn').addEventListener('click',()=>{const p=document.getElementById('filters-panel');p.style.display=p.style.display==='none'?'flex':'none';});
  document.getElementById('f-cat').addEventListener('change',e=>{S.filter.folder=e.target.value;renderNotesTab();});
  document.getElementById('f-status').addEventListener('change',e=>{S.filter.status=e.target.value;renderNotesTab();});
  document.getElementById('f-from').addEventListener('change',e=>{S.filter.from=e.target.value;renderNotesTab();});
  document.getElementById('f-to').addEventListener('change',e=>{S.filter.to=e.target.value;renderNotesTab();});
  document.getElementById('fclear-btn').addEventListener('click',clearFilter);
  document.getElementById('add-folder-btn').addEventListener('click',()=>openAddLevel('folder',null,null,null));
  document.getElementById('bulk-btn').addEventListener('click',()=>openBulkModal('pending'));
  document.getElementById('search-q').addEventListener('input',e=>doSearch(e.target.value));
  document.getElementById('search-voice-btn').addEventListener('click',()=>voiceSearch('search-q'));
  // modal addlevel
  document.getElementById('m-addlevel-cancel').addEventListener('click',()=>closeModal('m-addlevel'));
  document.getElementById('m-addlevel-ok').addEventListener('click',confirmAddLevel);
  document.getElementById('m-addlevel-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAddLevel();if(e.key==='Escape')closeModal('m-addlevel');});
  // modal assign
  document.getElementById('m-assign-cancel').addEventListener('click',()=>closeModal('m-assign'));
  document.getElementById('m-assign-ok').addEventListener('click',confirmAssign);
  document.getElementById('a-folder').addEventListener('change',()=>updateAssignSelects('a'));
  document.getElementById('a-cat').addEventListener('change',()=>updateAssignSelects('a'));
  document.getElementById('a-group').addEventListener('change',()=>updateAssignSelects('a'));
  // modal bulk
  document.getElementById('m-bulk-cancel').addEventListener('click',()=>closeModal('m-bulk'));
  document.getElementById('m-bulk-ok').addEventListener('click',confirmBulk);
  document.getElementById('b-folder').addEventListener('change',()=>updateAssignSelects('b'));
  document.getElementById('b-cat').addEventListener('change',()=>updateAssignSelects('b'));
  document.getElementById('b-group').addEventListener('change',()=>updateAssignSelects('b'));
}

// ═══ ADDLEVEL STATE ═══
let _addLevelCtx = null;
function openAddLevel(type, folderId, catName, groupName){
  _addLevelCtx = {type, folderId, catName, groupName};
  const titles = {folder:'Nowy folder', category:'Nowa kategoria', group:'Nowa grupa', topic:'Nowy temat'};
  document.getElementById('m-addlevel-title').textContent = titles[type]||'Nowy';
  document.getElementById('m-addlevel-name').value='';
  openModal('m-addlevel');
  setTimeout(()=>document.getElementById('m-addlevel-name').focus(),100);
}

function confirmAddLevel(){
  const val=document.getElementById('m-addlevel-name').value.trim();
  if(!val||!_addLevelCtx) return;
  const {type,folderId,catName,groupName}=_addLevelCtx;
  if(type==='folder'){
    S.folders.push({id:'f_'+Date.now(),name:val,color:S.folders.length%8});
  } else if(type==='category'){
    if(!S.tree[folderId]) S.tree[folderId]={};
    if(!S.tree[folderId][val]) S.tree[folderId][val]={};
  } else if(type==='group'){
    if(!S.tree[folderId]) S.tree[folderId]={};
    if(!S.tree[folderId][catName]) S.tree[folderId][catName]={};
    if(!S.tree[folderId][catName][val]) S.tree[folderId][catName][val]=[];
  } else if(type==='topic'){
    if(!S.tree[folderId]) S.tree[folderId]={};
    if(!S.tree[folderId][catName]) S.tree[folderId][catName]={};
    if(!S.tree[folderId][catName][groupName]) S.tree[folderId][catName][groupName]=[];
    if(!S.tree[folderId][catName][groupName].includes(val)) S.tree[folderId][catName][groupName].push(val);
  }
  save(); closeModal('m-addlevel'); renderNotesTab();
}

// ═══ DELETE LEVELS ═══
function deleteCategory(folderId, catName){
  if(!confirm('Usunąć kategorię "'+catName+'"? Notatki trafią do folderu.')) return;
  S.notes.forEach(n=>{if(n.folder===folderId&&n.category===catName){n.category=null;n.group=null;n.topic=null;}});
  if(S.tree[folderId]) delete S.tree[folderId][catName];
  save(); renderNotesTab();
}
function deleteGroup(folderId, catName, groupName){
  if(!confirm('Usunąć grupę "'+groupName+'"?')) return;
  S.notes.forEach(n=>{if(n.folder===folderId&&n.category===catName&&n.group===groupName){n.group=null;n.topic=null;}});
  if(S.tree[folderId]&&S.tree[folderId][catName]) delete S.tree[folderId][catName][groupName];
  save(); renderNotesTab();
}
function deleteTopic(folderId, catName, groupName, topicName){
  if(!confirm('Usunąć temat "'+topicName+'"?')) return;
  S.notes.forEach(n=>{if(n.folder===folderId&&n.category===catName&&n.group===groupName&&n.topic===topicName){n.topic=null;}});
  if(S.tree[folderId]&&S.tree[folderId][catName]&&S.tree[folderId][catName][groupName]){
    S.tree[folderId][catName][groupName]=S.tree[folderId][catName][groupName].filter(t=>t!==topicName);
  }
  save(); renderNotesTab();
}

// ═══ TAB SWITCH ═══
function switchTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelectorAll('[data-tab="'+tab+'"]').forEach(b=>{if(b.classList.contains('bnav'))b.classList.add('active');});
  if(tab==='notes') renderNotesTab();
  if(tab==='search') setTimeout(()=>document.getElementById('search-q').focus(),100);
}

function setDate(){
  const el=document.getElementById('logo-date');
  if(el) el.textContent=new Date().toLocaleDateString('pl-PL',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}

// ═══ NAGRYWANIE ═══
function toggleRec(){S.isRec?stopRec():startRec();}

function startRec(){
  hideErr(); transcript=''; interim=''; setLive('Zacznij mówić...');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  rec=new SR(); rec.lang='pl-PL'; rec.continuous=true; rec.interimResults=true;
  rec.onstart=()=>{S.isRec=true;setRecUI('recording');startTimer();startWave();};
  rec.onresult=(e)=>{
    let f='',i='';
    for(let j=e.resultIndex;j<e.results.length;j++){const t=e.results[j][0].transcript;if(e.results[j].isFinal)f+=t+' ';else i+=t;}
    transcript+=f;interim=i;
    const p=(transcript+i).trim();
    setLive(p||'Nagrywam...');
    const h=document.getElementById('rec-hint');
    if(h){h.textContent=p.length>50?'...'+p.slice(-50):p||'Nagrywam...';h.className='rec-hint on';}
  };
  rec.onerror=(e)=>{if(e.error==='not-allowed')showErr('Brak dostępu do mikrofonu.');else if(e.error!=='aborted')showErr('Błąd: '+e.error);cleanRec();};
  rec.onend=()=>{if(S.isRec){try{rec.start();}catch(e){}}};
  try{rec.start();}catch(e){showErr('Błąd: '+e.message);}
}

function stopRec(){
  S.isRec=false;
  if(rec){rec.onend=null;rec.stop();rec=null;}
  cleanRec();
  const text=(transcript+' '+interim).trim();
  if(text){
    S.notes.push({id:Date.now()+Math.random(),ts:new Date().toISOString(),text,folder:classify(text),category:null,group:null,topic:null,pending:true});
    save();
  } else showErr('Nic nie nagrano.');
}

function cleanRec(){clearInterval(timerInt);cancelAnimationFrame(waveAF);document.getElementById('wave-canvas').classList.remove('on');setRecUI('idle');resetTimer();setLive('Zacznij mówić...');}
function setLive(t){const el=document.getElementById('live-txt');if(el)el.textContent=t;}
function classify(text){
  const l=text.toLowerCase();let best='rozwoj',score=0;
  for(const[id,kws]of Object.entries(KW)){if(!S.folders.find(f=>f.id===id))continue;let s=0;for(const k of kws){if(l.includes(k))s++;}if(s>score){score=s;best=id;}}
  return best;
}

// ═══ RENDER NOTES TAB ═══
function renderNotesTab(){
  renderFilterFolders();
  const f=S.filter;
  let notes=[...S.notes];
  if(f.q) notes=notes.filter(n=>n.text.toLowerCase().includes(f.q.toLowerCase()));
  if(f.folder) notes=notes.filter(n=>n.folder===f.folder);
  if(f.status==='pending') notes=notes.filter(n=>n.pending);
  if(f.status==='ok') notes=notes.filter(n=>!n.pending);
  if(f.from) notes=notes.filter(n=>new Date(n.ts)>=new Date(f.from));
  if(f.to) notes=notes.filter(n=>new Date(n.ts)<=new Date(f.to+'T23:59:59'));
  notes.sort((a,b)=>new Date(b.ts)-new Date(a.ts));

  // Pending
  const pending=notes.filter(n=>n.pending);
  const ps=document.getElementById('pending-section');
  const pl=document.getElementById('pending-list');
  const pc=document.getElementById('pending-cnt');
  if(pending.length){ps.style.display='block';pc.textContent=pending.length;pl.innerHTML='';pending.forEach(n=>pl.appendChild(buildCard(n,true)));}
  else ps.style.display='none';

  // Foldery grid
  renderFoldersGrid(notes.filter(n=>!n.pending));

  // Aktywny folder
  const afc=document.getElementById('active-folder-content');
  if(S.activeFolder){
    afc.innerHTML='';
    afc.appendChild(buildFolderContent(S.activeFolder, notes.filter(n=>!n.pending&&n.folder===S.activeFolder)));
  } else {
    afc.innerHTML='';
  }
}

function renderFilterFolders(){
  const sel=document.getElementById('f-cat');
  const cur=sel.value;
  sel.innerHTML='<option value="">Wszystkie</option>';
  S.folders.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;if(f.id===cur)o.selected=true;sel.appendChild(o);});
}

function renderFoldersGrid(notes){
  const grid=document.getElementById('folders-grid');
  grid.innerHTML='';
  S.folders.forEach(folder=>{
    const count=notes.filter(n=>n.folder===folder.id).length;
    const pill=document.createElement('div');
    pill.className='level-pill lv0 cc'+folder.color+(S.activeFolder===folder.id?' active':'');
    pill.innerHTML='<span class="pill-name">'+folder.name+'</span><span class="pill-cnt">'+count+'</span><button class="pill-del" title="Usuń">×</button>';
    pill.addEventListener('click',e=>{
      if(e.target.classList.contains('pill-del')){
        e.stopPropagation();
        if(confirm('Usunąć folder "'+folder.name+'"?')){
          S.notes.forEach(n=>{if(n.folder===folder.id)n.folder='rozwoj';});
          S.folders=S.folders.filter(f=>f.id!==folder.id);
          if(S.activeFolder===folder.id){S.activeFolder=null;}
          save();renderNotesTab();
        }
        return;
      }
      S.activeFolder=S.activeFolder===folder.id?null:folder.id;
      S.activeCat=null; S.activeGroup=null;
      renderNotesTab();
      // Scroll do zawartości
      setTimeout(()=>{
        const afc=document.getElementById('active-folder-content');
        if(afc&&S.activeFolder) afc.scrollIntoView({behavior:'smooth',block:'start'});
      },50);
    });
    grid.appendChild(pill);
  });
}

// ═══ FOLDER CONTENT ═══
function buildFolderContent(folderId, notes){
  const folder=S.folders.find(f=>f.id===folderId);
  const wrap=document.createElement('div');
  wrap.className='sublevel-wrap';

  // Header folderu
  const hdr=document.createElement('div');
  hdr.className='active-content-hdr';
  const backBtn=document.createElement('button');
  backBtn.className='content-back-btn';
  backBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 18 9 12 15 6"/></svg>';
  backBtn.addEventListener('click',()=>{S.activeFolder=null;S.activeCat=null;S.activeGroup=null;renderNotesTab();});
  const title=document.createElement('span');
  title.className='content-title';
  title.textContent=folder?folder.name:'';
  const bulkBtn=document.createElement('button');
  bulkBtn.className='content-bulk-btn';
  bulkBtn.textContent='Przypisz zbiorczo';
  bulkBtn.addEventListener('click',()=>openBulkModal(folderId));
  hdr.appendChild(backBtn);hdr.appendChild(title);hdr.appendChild(bulkBtn);
  wrap.appendChild(hdr);

  // Kategorie (poziom 2)
  const cats=S.tree[folderId]?Object.keys(S.tree[folderId]):[];
  const catsRow=document.createElement('div');
  catsRow.className='sublevel-pills-row';
  cats.forEach(catName=>{
    const catNotes=notes.filter(n=>n.category===catName);
    const pill=document.createElement('div');
    pill.className='level-pill lv1 cc'+(folder?folder.color:5)+(S.activeCat===catName?' active':'');
    pill.innerHTML='<span class="pill-name">'+catName+'</span><span class="pill-cnt">'+catNotes.length+'</span><button class="pill-del">×</button>';
    pill.addEventListener('click',e=>{
      if(e.target.classList.contains('pill-del')){e.stopPropagation();deleteCategory(folderId,catName);return;}
      S.activeCat=S.activeCat===catName?null:catName;S.activeGroup=null;renderNotesTab();
    });
    catsRow.appendChild(pill);
  });
  const addCatPill=document.createElement('button');
  addCatPill.className='add-level-pill';addCatPill.textContent='+ kategoria';
  addCatPill.addEventListener('click',()=>openAddLevel('category',folderId,null,null));
  catsRow.appendChild(addCatPill);
  wrap.appendChild(catsRow);

  // Aktywna kategoria — grupy (poziom 3)
  if(S.activeCat&&cats.includes(S.activeCat)){
    const groups=S.tree[folderId][S.activeCat]?Object.keys(S.tree[folderId][S.activeCat]):[];
    const grpsRow=document.createElement('div');
    grpsRow.className='sublevel-pills-row';
    groups.forEach(groupName=>{
      const grpNotes=notes.filter(n=>n.category===S.activeCat&&n.group===groupName);
      const pill=document.createElement('div');
      pill.className='level-pill lv2 cc'+(folder?folder.color:5)+(S.activeGroup===groupName?' active':'');
      pill.innerHTML='<span class="pill-name">'+groupName+'</span><span class="pill-cnt">'+grpNotes.length+'</span><button class="pill-del">×</button>';
      pill.addEventListener('click',e=>{
        if(e.target.classList.contains('pill-del')){e.stopPropagation();deleteGroup(folderId,S.activeCat,groupName);return;}
        S.activeGroup=S.activeGroup===groupName?null:groupName;renderNotesTab();
      });
      grpsRow.appendChild(pill);
    });
    const addGrpPill=document.createElement('button');
    addGrpPill.className='add-level-pill';addGrpPill.textContent='+ grupa';
    addGrpPill.addEventListener('click',()=>openAddLevel('group',folderId,S.activeCat,null));
    grpsRow.appendChild(addGrpPill);
    wrap.appendChild(grpsRow);

    // Aktywna grupa — tematy (poziom 4)
    if(S.activeGroup&&groups.includes(S.activeGroup)){
      const topics=S.tree[folderId][S.activeCat][S.activeGroup]||[];
      const topicsRow=document.createElement('div');
      topicsRow.className='sublevel-pills-row';
      topics.forEach(topicName=>{
        const topNotes=notes.filter(n=>n.category===S.activeCat&&n.group===S.activeGroup&&n.topic===topicName);
        const pill=document.createElement('div');
        pill.className='level-pill lv3 cc'+(folder?folder.color:5);
        pill.innerHTML='<span class="pill-name">'+topicName+'</span><span class="pill-cnt">'+topNotes.length+'</span><button class="pill-del">×</button>';
        pill.addEventListener('click',e=>{
          if(e.target.classList.contains('pill-del')){e.stopPropagation();deleteTopic(folderId,S.activeCat,S.activeGroup,topicName);return;}
        });
        topicsRow.appendChild(pill);
      });
      const addTopicPill=document.createElement('button');
      addTopicPill.className='add-level-pill';addTopicPill.textContent='+ temat';
      addTopicPill.addEventListener('click',()=>openAddLevel('topic',folderId,S.activeCat,S.activeGroup));
      topicsRow.appendChild(addTopicPill);
      wrap.appendChild(topicsRow);

      // Notatki z aktywnego tematu (jeśli kliknięty temat — tu można rozbudować)
      notes.filter(n=>n.category===S.activeCat&&n.group===S.activeGroup).forEach(n=>wrap.appendChild(buildCard(n)));
    } else {
      // Notatki z aktywnej kategorii bez grupy
      notes.filter(n=>n.category===S.activeCat&&!n.group).forEach(n=>wrap.appendChild(buildCard(n)));
    }
  } else {
    // Notatki bez kategorii
    notes.filter(n=>!n.category).forEach(n=>wrap.appendChild(buildCard(n)));
  }

  return wrap;
}

// ═══ NOTE CARD ═══
function buildCard(note, showCb=false){
  const card=document.createElement('div');
  card.className='note-card'+(note.pending?' pending':'');
  const d=new Date(note.ts);
  const t=d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const dt=d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'});
  const folderName=getFolderName(note.folder);
  let badge=folderName;
  if(note.category) badge+=' › '+note.category;
  if(note.group) badge+=' › '+note.group;
  if(note.topic) badge+=' › '+note.topic;
  const q=S.filter.q;
  const highlighted=q?hlText(esc(note.text),q):esc(note.text);

  card.innerHTML=
    '<div class="note-meta">'+
      (showCb?'<input type="checkbox" class="note-cb" data-id="'+note.id+'">':'')+
      '<span class="note-time">'+t+' · '+dt+'</span>'+
      '<span class="note-badge">'+badge+'</span>'+
      (note.pending?'<span class="note-ptag">⚠</span>':'')+
    '</div>'+
    '<div class="note-txt">'+highlighted+'</div>'+
    '<textarea class="note-ta" rows="3" style="display:none">'+esc(note.text)+'</textarea>'+
    '<div class="note-actions">'+
      '<button class="nbtn assign assign-btn">Przypisz</button>'+
      '<button class="nbtn edit-btn">Edytuj</button>'+
      (note.pending?'<button class="nbtn ok ok-btn">✓ OK</button>':'')+
      '<div class="fl"></div>'+
      '<button class="nbtn del del-btn">Usuń</button>'+
    '</div>';

  card.querySelector('.assign-btn').addEventListener('click',()=>openAssignModal(note.id));
  const eb=card.querySelector('.edit-btn'),tel=card.querySelector('.note-txt'),ta=card.querySelector('.note-ta');
  eb.addEventListener('click',()=>{
    if(ta.style.display==='none'){tel.style.display='none';ta.style.display='block';eb.textContent='Zapisz';ta.focus();}
    else{note.text=ta.value;tel.innerHTML=hlText(esc(ta.value),q);tel.style.display='block';ta.style.display='none';eb.textContent='Edytuj';save();}
  });
  const ob=card.querySelector('.ok-btn');
  if(ob) ob.addEventListener('click',()=>{note.pending=false;save();renderNotesTab();});
  card.querySelector('.del-btn').addEventListener('click',()=>{S.notes=S.notes.filter(n=>n.id!==note.id);save();renderNotesTab();});
  return card;
}

function getFolderName(id){const f=S.folders.find(f=>f.id===id);return f?f.name:id;}

function hlText(text,q){
  if(!q) return text;
  const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return text.replace(re,'<mark>$1</mark>');
}

// ═══ ASSIGN MODAL ═══
function openAssignModal(noteId){
  S.assignNoteId=noteId;
  fillFolderSelect('a-folder');
  hideAssignSelects('a');updateAssignSelects('a');
  openModal('m-assign');
}

function fillFolderSelect(id){
  const sel=document.getElementById(id);
  sel.innerHTML='';
  S.folders.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;sel.appendChild(o);});
}

function hideAssignSelects(prefix){
  ['cat','group','topic'].forEach(k=>{const el=document.getElementById(prefix+'-'+k);if(el)el.style.display='none';});
}

function updateAssignSelects(prefix){
  const folderId=document.getElementById(prefix+'-folder').value;
  const cats=S.tree[folderId]?Object.keys(S.tree[folderId]):[];
  const catSel=document.getElementById(prefix+'-cat');
  if(cats.length){
    catSel.style.display='block';
    catSel.innerHTML='<option value="">— bez kategorii —</option>';
    cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o);});
    const catVal=catSel.value;
    const groups=catVal&&S.tree[folderId][catVal]?Object.keys(S.tree[folderId][catVal]):[];
    const grpSel=document.getElementById(prefix+'-group');
    if(groups.length){
      grpSel.style.display='block';
      grpSel.innerHTML='<option value="">— bez grupy —</option>';
      groups.forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;grpSel.appendChild(o);});
      const grpVal=grpSel.value;
      const topics=grpVal&&S.tree[folderId][catVal][grpVal]?S.tree[folderId][catVal][grpVal]:[];
      const topSel=document.getElementById(prefix+'-topic');
      if(topics.length){
        topSel.style.display='block';
        topSel.innerHTML='<option value="">— bez tematu —</option>';
        topics.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;topSel.appendChild(o);});
      } else topSel.style.display='none';
    } else {grpSel.style.display='none';document.getElementById(prefix+'-topic').style.display='none';}
  } else {catSel.style.display='none';document.getElementById(prefix+'-group').style.display='none';document.getElementById(prefix+'-topic').style.display='none';}
}

function confirmAssign(){
  const note=S.notes.find(n=>n.id===S.assignNoteId);
  if(!note){closeModal('m-assign');return;}
  note.folder=document.getElementById('a-folder').value;
  note.category=document.getElementById('a-cat').value||null;
  note.group=document.getElementById('a-group').value||null;
  note.topic=document.getElementById('a-topic').value||null;
  note.pending=false;
  save();closeModal('m-assign');renderNotesTab();
}

// ═══ BULK MODAL ═══
function openBulkModal(source){
  S.bulkSource=source;
  const title=source==='pending'?'Przypisz nieprzypisane':'Przypisz notatki z folderu';
  document.getElementById('m-bulk-title').textContent=title;
  fillFolderSelect('b-folder');
  hideAssignSelects('b');updateAssignSelects('b');
  openModal('m-bulk');
}

function confirmBulk(){
  const folderId=document.getElementById('b-folder').value;
  const cat=document.getElementById('b-cat').value||null;
  const group=document.getElementById('b-group').value||null;
  const topic=document.getElementById('b-topic').value||null;
  let notesToAssign;
  if(S.bulkSource==='pending'){
    notesToAssign=S.notes.filter(n=>n.pending);
  } else {
    notesToAssign=S.notes.filter(n=>n.folder===S.bulkSource);
  }
  notesToAssign.forEach(n=>{n.folder=folderId;n.category=cat;n.group=group;n.topic=topic;n.pending=false;});
  save();closeModal('m-bulk');renderNotesTab();
}

// ═══ SEARCH ═══
function doSearch(q){
  const res=document.getElementById('search-results');
  const query=q.trim().toLowerCase();
  if(!query){res.innerHTML='<div class="empty-state">Wpisz frazę aby przeszukać</div>';return;}
  const found=S.notes.filter(n=>n.text.toLowerCase().includes(query)||getFolderName(n.folder).toLowerCase().includes(query)||(n.category&&n.category.toLowerCase().includes(query))||(n.group&&n.group.toLowerCase().includes(query))).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  if(!found.length){res.innerHTML='<div class="empty-state">Brak wyników</div>';return;}
  // Auto-otwieranie przy 1 wyniku
  if(found.length===1){res.innerHTML='';const card=buildCard(found[0]);if(q){const el=card.querySelector('.note-txt');if(el)el.innerHTML=hlText(esc(found[0].text),q);}res.appendChild(card);return;}
  res.innerHTML='';
  found.forEach(n=>{const card=buildCard(n);if(q){const el=card.querySelector('.note-txt');if(el)el.innerHTML=hlText(esc(n.text),q);}res.appendChild(card);});
}

function voiceSearch(inputId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const sr=new SR();sr.lang='pl-PL';
  sr.onresult=e=>{const q=e.results[0][0].transcript;document.getElementById(inputId).value=q;doSearch(q);};
  sr.start();
}

function clearFilter(){
  S.filter={q:'',folder:'',status:'',from:'',to:''};
  ['notes-q','f-cat','f-status','f-from','f-to'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderNotesTab();
}

// ═══ EXPORT / IMPORT ═══
function exportNotes(){
  const lines=['WHISPR — Eksport','Data: '+new Date().toLocaleDateString('pl-PL'),'','---',''];
  [...S.notes].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).forEach(n=>{
    const d=new Date(n.ts);
    lines.push('['+d.toLocaleDateString('pl-PL')+' '+d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+']');
    let loc=getFolderName(n.folder);if(n.category)loc+=' › '+n.category;if(n.group)loc+=' › '+n.group;if(n.topic)loc+=' › '+n.topic;
    lines.push('Kategoria: '+loc);lines.push(n.text);lines.push('');
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
    const lines=e.target.result.split('\n');let imported=0,i=0;
    while(i<lines.length){
      const match=lines[i].match(/^\[(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{2}:\d{2})\]/);
      if(match){
        const p=match[1].split('.');
        const ts=new Date(p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T'+match[2]+':00').toISOString();
        let folder='rozwoj',cat=null,group=null,topic=null;
        if(i+1<lines.length&&lines[i+1].startsWith('Kategoria:')){
          const parts=lines[i+1].replace('Kategoria:','').trim().split('›').map(s=>s.trim());
          const ff=S.folders.find(f=>f.name===parts[0]);if(ff)folder=ff.id;
          if(parts[1])cat=parts[1];if(parts[2])group=parts[2];if(parts[3])topic=parts[3];i+=2;
        } else i++;
        let text='';
        while(i<lines.length&&lines[i].trim()!==''&&!lines[i].match(/^\[/)){text+=lines[i]+' ';i++;}
        text=text.trim();
        if(text){S.notes.push({id:Date.now()+Math.random(),ts,text,folder,category:cat,group,topic,pending:false});imported++;}
      } else i++;
    }
    if(imported>0){save();renderNotesTab();alert('Zaimportowano '+imported+' notatek!');}
    else alert('Nie znaleziono notatek.');
    event.target.value='';
  };
  reader.readAsText(file);
}

// ═══ TIMER & WAVE ═══
function startTimer(){timerSec=0;document.getElementById('timer').textContent='0:00';timerInt=setInterval(()=>{timerSec++;const m=Math.floor(timerSec/60),s=timerSec%60;document.getElementById('timer').textContent=m+':'+String(s).padStart(2,'0');},1000);}
function resetTimer(){document.getElementById('timer').textContent='0:00';}
function startWave(){
  const canvas=document.getElementById('wave-canvas');const ctx=canvas.getContext('2d');canvas.classList.add('on');
  function draw(){waveAF=requestAnimationFrame(draw);ctx.clearRect(0,0,canvas.width,canvas.height);const bars=26;for(let i=0;i<bars;i++){const h=3+Math.random()*(canvas.height-6);const x=i*(canvas.width/bars);const y=(canvas.height-h)/2;ctx.fillStyle='#c9a84c';ctx.globalAlpha=0.3+Math.random()*0.7;ctx.beginPath();ctx.roundRect(x,y,5,h,2);ctx.fill();}ctx.globalAlpha=1;}
  draw();
}
function setRecUI(mode){
  const btn=document.getElementById('rec-btn');const outer=document.getElementById('rec-outer');
  const mic=document.getElementById('ic-mic');const stop=document.getElementById('ic-stop');const hint=document.getElementById('rec-hint');
  btn.className='rec-btn '+mode;outer.className='rec-outer '+mode;
  mic.style.display=mode==='idle'?'block':'none';stop.style.display=mode==='recording'?'block':'none';
  if(hint){hint.className='rec-hint'+(mode==='recording'?' on':'');hint.textContent=mode==='idle'?'Dotknij aby nagrać':'Nagrywam... dotknij aby zakończyć';}
}

// ═══ MODAL HELPERS ═══
function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}

function showErr(msg){const b=document.getElementById('err-box');if(b){b.textContent=msg;b.style.display='block';}}
function hideErr(){const b=document.getElementById('err-box');if(b)b.style.display='none';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
