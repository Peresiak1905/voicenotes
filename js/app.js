// WHISPR 2.4

const VER = '2.4';

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

let S = {
  selectedNotes: new Set(),
  notes:[], folders:[...DEFAULT_FOLDERS], tree:{},
  activeFolder:null, activeCat:null, activeGroup:null,
  assignNoteId:null, bulkSource:null,
  filter:{q:'',folder:'',status:'',from:'',to:''},
  isRec:false,
};

let rec=null, timerInt=null, timerSec=0, waveAF=null, transcript='', interim='';
let _addCtx=null;

// ═══ INIT ═══
function init(){
  try{ migrate(); } catch(e){ console.log('migrate error',e); }
  try{ load(); } catch(e){ console.log('load error',e); }
  setDate();
  try{ renderNotesTab(); } catch(e){ console.log('render error',e); }
  try{ bind(); } catch(e){ console.log('bind error',e); }
}

function migrate(){
  ['vn_notes','whispr_notes','w21_notes','w23_notes','w24_notes'].forEach(k=>{
    try{
      const d=localStorage.getItem(k); if(!d) return;
      const arr=JSON.parse(d); if(!Array.isArray(arr)||!arr.length) return;
      const ex=JSON.parse(localStorage.getItem('w241_notes')||'[]');
      const ids=new Set(ex.map(n=>String(n.id)));
      const newOnes=arr.filter(n=>!ids.has(String(n.id))).map(n=>({
        id:n.id, ts:n.ts||new Date().toISOString(), text:n.text||'', pending:!!n.pending,
        folder:n.folder||n.category||'praca',
        category:n.category2||n.subcategory||null,
        group:n.group||n.subsubcategory||null,
        topic:n.topic||null,
      }));
      if(newOnes.length){
        localStorage.setItem('w241_notes',JSON.stringify([...ex,...newOnes]));
        console.log('Migrated '+newOnes.length+' from '+k);
      }
    }catch(e){ console.log('migrate '+k,e); }
  });
}

function load(){
  const n=localStorage.getItem('w241_notes');
  const f=localStorage.getItem('w241_folders');
  const t=localStorage.getItem('w241_tree');
  if(n) S.notes=JSON.parse(n);
  if(f) S.folders=JSON.parse(f);
  if(t) S.tree=JSON.parse(t);
}

function save(){
  localStorage.setItem('w241_notes',JSON.stringify(S.notes));
  localStorage.setItem('w241_folders',JSON.stringify(S.folders));
  localStorage.setItem('w241_tree',JSON.stringify(S.tree));
}

// ═══ BIND ═══
function el(id){ return document.getElementById(id); }

function on(id, ev, fn){
  const e=el(id);
  if(e) e.addEventListener(ev,fn);
  else console.warn('Missing element:',id);
}

function bind(){
  // Nawigacja
  document.querySelectorAll('.bnav').forEach(b=>{
    b.addEventListener('click',()=>switchTab(b.dataset.tab));
  });
  document.querySelectorAll('.back-btn').forEach(b=>{
    b.addEventListener('click',()=>switchTab(b.dataset.tab));
  });

  on('search-pill-btn','click',()=>switchTab('search'));
  on('home-voice-btn','click',e=>{e.stopPropagation();switchTab('search');setTimeout(()=>voiceSearch('search-q'),200);});
  on('rec-btn','click',toggleRec);
  on('export-btn','click',exportNotes);
  on('import-btn','click',()=>el('import-file')&&el('import-file').click());
  on('import-file','change',importNotes);
  on('notes-q','input',e=>{S.filter.q=e.target.value;renderNotesTab();});
  on('filter-btn','click',()=>{const p=el('filters-panel');if(p)p.style.display=p.style.display==='none'?'flex':'none';});
  on('f-cat','change',e=>{S.filter.folder=e.target.value;renderNotesTab();});
  on('f-status','change',e=>{S.filter.status=e.target.value;renderNotesTab();});
  on('f-from','change',e=>{S.filter.from=e.target.value;renderNotesTab();});
  on('f-to','change',e=>{S.filter.to=e.target.value;renderNotesTab();});
  on('fclear-btn','click',clearFilter);
  on('add-folder-btn','click',()=>openAdd('folder',null,null,null));
  on('bulk-btn','click',()=>openBulk('pending'));
  on('search-q','input',e=>doSearch(e.target.value));
  on('search-voice-btn','click',()=>voiceSearch('search-q'));
  on('m-addlevel-cancel','click',()=>closeModal('m-addlevel'));
  on('m-addlevel-ok','click',confirmAdd);
  on('m-addlevel-name','keydown',e=>{if(e.key==='Enter')confirmAdd();if(e.key==='Escape')closeModal('m-addlevel');});
  on('m-assign-cancel','click',()=>closeModal('m-assign'));
  on('m-assign-ok','click',confirmAssign);
  on('a-folder','change',()=>updateSels('a'));
  on('a-cat','change',()=>updateSels('a'));
  on('a-group','change',()=>updateSels('a'));
  on('m-bulk-cancel','click',()=>closeModal('m-bulk'));
  on('m-bulk-ok','click',confirmBulk);
  on('b-folder','change',()=>updateSels('b'));
  on('b-cat','change',()=>updateSels('b'));
  on('b-group','change',()=>updateSels('b'));
}

// ═══ NAWIGACJA ═══
function switchTab(tab){
  if(!tab) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
  const tabEl=el('tab-'+tab);
  if(tabEl) tabEl.classList.add('active');
  document.querySelectorAll('[data-tab="'+tab+'"]').forEach(b=>{
    if(b.classList.contains('bnav')) b.classList.add('active');
  });
  if(tab==='notes') renderNotesTab();
  if(tab==='search') setTimeout(()=>{const sq=el('search-q');if(sq)sq.focus();},150);
}

function setDate(){
  const e=el('logo-date');
  if(e) e.textContent=new Date().toLocaleDateString('pl-PL',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}

// ═══ NAGRYWANIE ═══
function toggleRec(){ S.isRec ? stopRec() : startRec(); }

function startRec(){
  hideErr(); transcript=''; interim=''; setLive('Zacznij mówić...');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showErr('Twoja przeglądarka nie obsługuje nagrywania. Użyj Chrome lub Safari.'); return; }

  rec=new SR();
  rec.lang='pl-PL';
  rec.continuous=true;
  rec.interimResults=true;

  rec.onstart=()=>{
    S.isRec=true;
    setRecUI('recording');
    startTimer();
    startWave();
  };

  rec.onresult=(e)=>{
    let f='',i='';
    for(let j=e.resultIndex;j<e.results.length;j++){
      const t=e.results[j][0].transcript;
      if(e.results[j].isFinal) f+=t+' '; else i+=t;
    }
    transcript+=f; interim=i;
    const p=(transcript+i).trim();
    setLive(p||'Nagrywam...');
    const h=el('rec-hint');
    if(h){ h.textContent=p.length>50?'...'+p.slice(-50):p||'Nagrywam...'; h.className='rec-hint on'; }
  };

  rec.onerror=(e)=>{
    console.log('rec error',e.error);
    if(e.error==='not-allowed') showErr('Brak dostępu do mikrofonu. Zezwól w ustawieniach Chrome.');
    else if(e.error==='no-speech') {} // ignoruj
    else if(e.error!=='aborted') showErr('Błąd nagrywania: '+e.error);
    if(e.error==='not-allowed'||e.error==='service-not-allowed'){ cleanRec(); }
  };

  rec.onend=()=>{ if(S.isRec){ try{ rec.start(); }catch(e){ console.log('restart err',e); } } };

  try{ rec.start(); }
  catch(e){ showErr('Nie można uruchomić mikrofonu: '+e.message); }
}

function stopRec(){
  S.isRec=false;
  if(rec){ rec.onend=null; try{ rec.stop(); }catch(e){} rec=null; }
  cleanRec();
  const text=(transcript+' '+interim).trim();
  if(text){
    const note={
      id:Date.now()+Math.random(), ts:new Date().toISOString(),
      text, folder:classify(text),
      category:null, group:null, topic:null, pending:true
    };
    S.notes.push(note);
    save();
    showErr(''); hideErr();
  } else {
    showErr('Nic nie nagrano. Spróbuj ponownie.');
  }
}

function cleanRec(){
  clearInterval(timerInt); cancelAnimationFrame(waveAF);
  const wc=el('wave-canvas'); if(wc) wc.classList.remove('on');
  setRecUI('idle'); resetTimer(); setLive('Zacznij mówić...');
}

function setLive(t){ const e=el('live-txt'); if(e) e.textContent=t; }

function classify(text){
  const l=text.toLowerCase(); let best='praca',score=0;
  for(const[id,kws] of Object.entries(KW)){
    if(!S.folders.find(f=>f.id===id)) continue;
    let s=0; for(const k of kws){ if(l.includes(k)) s++; }
    if(s>score){ score=s; best=id; }
  }
  return best;
}

// ═══ RENDER NOTES ═══
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

  const pending=notes.filter(n=>n.pending);
  const ps=el('pending-section'), pl=el('pending-list'), pc=el('pending-cnt');
  if(ps&&pending.length){
    ps.style.display='block';
    if(pc) pc.textContent=pending.length;
    if(pl){ pl.innerHTML=''; pending.forEach(n=>pl.appendChild(buildCard(n,true))); }
  } else if(ps) ps.style.display='none';

  renderFoldersGrid(notes.filter(n=>!n.pending));

  const ac=el('active-content');
  if(ac){
    ac.innerHTML='';
    if(S.activeFolder){
      const folderNotes=notes.filter(n=>!n.pending&&n.folder===S.activeFolder);
      ac.appendChild(buildFolderContent(S.activeFolder, folderNotes));
    }
  }
}

function renderFilterFolders(){
  const sel=el('f-cat'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Wszystkie</option>';
  S.folders.forEach(f=>{
    const o=document.createElement('option');
    o.value=f.id; o.textContent=f.name;
    if(f.id===cur) o.selected=true;
    sel.appendChild(o);
  });
}

function renderFoldersGrid(notes){
  const grid=el('folders-grid'); if(!grid) return;
  grid.innerHTML='';
  S.folders.forEach(folder=>{
    const count=notes.filter(n=>n.folder===folder.id).length;
    const pill=document.createElement('div');
    pill.className='lvl-pill lv0 cc'+folder.color+(S.activeFolder===folder.id?' sel':'');
    pill.innerHTML='<span class="pname">'+folder.name+'</span><span class="pcnt">'+count+'</span><button class="pdel">×</button>';

    pill.querySelector('.pdel').addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm('Usunąć folder "'+folder.name+'"?')){
        S.notes.forEach(n=>{ if(n.folder===folder.id) n.folder='praca'; });
        S.folders=S.folders.filter(f=>f.id!==folder.id);
        if(S.activeFolder===folder.id){ S.activeFolder=null; }
        save(); renderNotesTab();
      }
    });

    pill.addEventListener('click',e=>{
      if(e.target.classList.contains('pdel')) return;
      S.activeFolder = S.activeFolder===folder.id ? null : folder.id;
      S.activeCat=null; S.activeGroup=null;
      renderNotesTab();
      // Scroll do zawartości
      setTimeout(()=>{
        const ac=el('active-content');
        const sc=el('notes-scroll');
        if(ac&&sc&&S.activeFolder){
          sc.scrollTo({top:ac.offsetTop-20, behavior:'smooth'});
        }
      },100);
    });
    grid.appendChild(pill);
  });
}

// ═══ FOLDER CONTENT ═══
function buildFolderContent(folderId, notes){
  const folder=S.folders.find(f=>f.id===folderId);
  const wrap=document.createElement('div');

  // Header
  const hdr=document.createElement('div');
  hdr.className='active-content-hdr';
  const bk=document.createElement('button');
  bk.className='cbk';
  bk.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 18 9 12 15 6"/></svg>';
  bk.addEventListener('click',()=>{ S.activeFolder=null; S.activeCat=null; S.activeGroup=null; renderNotesTab(); });
  const tt=document.createElement('span');
  tt.className='ctitle'; tt.textContent=folder?folder.name:'';
  const bb=document.createElement('button');
  bb.className='cbulk'; bb.textContent='Przypisz zbiorczo';
  bb.addEventListener('click',()=>openBulk(folderId));
  hdr.appendChild(bk); hdr.appendChild(tt); hdr.appendChild(bb);
  wrap.appendChild(hdr);

  const cc=folder?folder.color:5;

  // Kategorie (lv1)
  const cats=S.tree[folderId]?Object.keys(S.tree[folderId]):[];
  const cRow=document.createElement('div'); cRow.className='pills-grid';
  cats.forEach(cat=>{
    const cn=notes.filter(n=>n.category===cat).length;
    const p=document.createElement('div');
    p.className='lvl-pill lv1 cc'+cc+(S.activeCat===cat?' sel':'');
    p.innerHTML='<span class="pname">'+cat+'</span><span class="pcnt">'+cn+'</span><button class="pdel">×</button>';
    p.querySelector('.pdel').addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm('Usunąć kategorię "'+cat+'"?')){
        S.notes.forEach(n=>{ if(n.folder===folderId&&n.category===cat){ n.category=null; n.group=null; n.topic=null; }});
        if(S.tree[folderId]) delete S.tree[folderId][cat];
        if(S.activeCat===cat){ S.activeCat=null; S.activeGroup=null; }
        save(); renderNotesTab();
      }
    });
    p.addEventListener('click',e=>{
      if(e.target.classList.contains('pdel')) return;
      S.activeCat = S.activeCat===cat ? null : cat;
      S.activeGroup=null; renderNotesTab();
    });
    cRow.appendChild(p);
  });
  const addC=document.createElement('button');
  addC.className='add-lvl-pill'; addC.textContent='+ kategoria';
  addC.addEventListener('click',()=>openAdd('category',folderId,null,null));
  cRow.appendChild(addC);
  wrap.appendChild(cRow);

  // Grupy (lv2) — jeśli aktywna kategoria
  if(S.activeCat&&cats.includes(S.activeCat)){
    const groups=S.tree[folderId][S.activeCat]?Object.keys(S.tree[folderId][S.activeCat]):[];
    const gRow=document.createElement('div'); gRow.className='pills-grid';
    groups.forEach(grp=>{
      const gn=notes.filter(n=>n.category===S.activeCat&&n.group===grp).length;
      const p=document.createElement('div');
      p.className='lvl-pill lv2 cc'+cc+(S.activeGroup===grp?' sel':'');
      p.innerHTML='<span class="pname">'+grp+'</span><span class="pcnt">'+gn+'</span><button class="pdel">×</button>';
      p.querySelector('.pdel').addEventListener('click',e=>{
        e.stopPropagation();
        if(confirm('Usunąć grupę "'+grp+'"?')){
          S.notes.forEach(n=>{ if(n.folder===folderId&&n.category===S.activeCat&&n.group===grp){ n.group=null; n.topic=null; }});
          if(S.tree[folderId]&&S.tree[folderId][S.activeCat]) delete S.tree[folderId][S.activeCat][grp];
          if(S.activeGroup===grp) S.activeGroup=null;
          save(); renderNotesTab();
        }
      });
      p.addEventListener('click',e=>{
        if(e.target.classList.contains('pdel')) return;
        S.activeGroup = S.activeGroup===grp ? null : grp;
        renderNotesTab();
      });
      gRow.appendChild(p);
    });
    const addG=document.createElement('button');
    addG.className='add-lvl-pill'; addG.textContent='+ grupa';
    addG.addEventListener('click',()=>openAdd('group',folderId,S.activeCat,null));
    gRow.appendChild(addG);
    wrap.appendChild(gRow);

    // Tematy (lv3) — jeśli aktywna grupa
    if(S.activeGroup&&groups.includes(S.activeGroup)){
      const topics=S.tree[folderId][S.activeCat][S.activeGroup]||[];
      const tRow=document.createElement('div'); tRow.className='pills-grid';
      topics.forEach(top=>{
        const tn=notes.filter(n=>n.category===S.activeCat&&n.group===S.activeGroup&&n.topic===top).length;
        const p=document.createElement('div');
        p.className='lvl-pill lv3 cc'+cc;
        p.innerHTML='<span class="pname">'+top+'</span><span class="pcnt">'+tn+'</span><button class="pdel">×</button>';
        p.querySelector('.pdel').addEventListener('click',e=>{
          e.stopPropagation();
          if(confirm('Usunąć temat "'+top+'"?')){
            S.notes.forEach(n=>{ if(n.category===S.activeCat&&n.group===S.activeGroup&&n.topic===top) n.topic=null; });
            S.tree[folderId][S.activeCat][S.activeGroup]=topics.filter(t=>t!==top);
            save(); renderNotesTab();
          }
        });
        tRow.appendChild(p);
      });
      const addT=document.createElement('button');
      addT.className='add-lvl-pill'; addT.textContent='+ temat';
      addT.addEventListener('click',()=>openAdd('topic',folderId,S.activeCat,S.activeGroup));
      tRow.appendChild(addT);
      wrap.appendChild(tRow);
      // Notatki z aktywnej grupy
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
  const isSel=S.selectedNotes.has(String(note.id));
  card.className='note-card'+(note.pending?' pending':'')+(isSel?' selected':'');
  const d=new Date(note.ts);
  const t=d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const dt=d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'});
  const fn=getFolderName(note.folder);
  let badge=fn;
  if(note.category) badge+=' › '+note.category;
  if(note.group) badge+=' › '+note.group;
  if(note.topic) badge+=' › '+note.topic;
  const q=S.filter.q;
  const ht=q?hlText(esc(note.text),q):esc(note.text);

  const cbChecked=isSel?'checked':'';
  card.innerHTML=
    '<div class="note-meta">'+
      '<input type="checkbox" class="note-cb" data-id="'+note.id+'" '+cbChecked+'>'+
      '<span class="ntime">'+t+' · '+dt+'</span>'+
      '<span class="nbadge">'+badge+'</span>'+
      (note.pending?'<span class="nptag">⚠</span>':'')+
    '</div>'+
    '<div class="ntxt">'+ht+'</div>'+
    '<textarea class="nta" rows="3" style="display:none">'+esc(note.text)+'</textarea>'+
    '<div class="nactions">'+
      '<button class="nb asgn asgn-btn">Przypisz</button>'+
      '<button class="nb edit-btn">Edytuj</button>'+
      (note.pending?'<button class="nb ok ok-btn">✓ OK</button>':'')+
      '<div class="fl"></div>'+
      '<button class="nb del del-btn">Usuń</button>'+
    '</div>';

  card.querySelector('.asgn-btn').addEventListener('click',()=>openAssignModal(note.id));
  const eb=card.querySelector('.edit-btn'), tEl=card.querySelector('.ntxt'), ta=card.querySelector('.nta');
  eb.addEventListener('click',()=>{
    if(ta.style.display==='none'){ tEl.style.display='none'; ta.style.display='block'; eb.textContent='Zapisz'; ta.focus(); }
    else{ note.text=ta.value; tEl.innerHTML=hlText(esc(ta.value),q); tEl.style.display='block'; ta.style.display='none'; eb.textContent='Edytuj'; save(); }
  });
  const ob=card.querySelector('.ok-btn');
  if(ob) ob.addEventListener('click',()=>{ note.pending=false; save(); renderNotesTab(); });
  card.querySelector('.del-btn').addEventListener('click',()=>{ S.notes=S.notes.filter(n=>n.id!==note.id); save(); renderNotesTab(); });
  return card;
}

function getFolderName(id){ const f=S.folders.find(f=>f.id===id); return f?f.name:id; }
function hlText(text,q){ if(!q) return text; const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'); return text.replace(re,'<mark>$1</mark>'); }

// ═══ ADD LEVEL ═══
function openAdd(type,folderId,catName,groupName){
  _addCtx={type,folderId,catName,groupName};
  const titles={folder:'Nowy folder',category:'Nowa kategoria',group:'Nowa grupa',topic:'Nowy temat'};
  const t=el('m-addlevel-title'); if(t) t.textContent=titles[type]||'Nowy';
  const n=el('m-addlevel-name'); if(n) n.value='';
  openModal('m-addlevel');
  setTimeout(()=>{ const n=el('m-addlevel-name'); if(n) n.focus(); },150);
}

function confirmAdd(){
  const val=(el('m-addlevel-name').value||'').trim();
  if(!val||!_addCtx) return;
  const {type,folderId,catName,groupName}=_addCtx;
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
    if(!S.tree[folderId]||!S.tree[folderId][catName]||!S.tree[folderId][catName][groupName]) return;
    if(!S.tree[folderId][catName][groupName].includes(val)) S.tree[folderId][catName][groupName].push(val);
  }
  save(); closeModal('m-addlevel'); renderNotesTab();
}

// ═══ ASSIGN ═══
function openAssignModal(noteId){
  S.assignNoteId=noteId;
  buildAssignModal('a', null, null, null);
  openModal('m-assign');
}

function buildAssignModal(pfx, selFolderId, selCat, selGroup){
  const fs=el(pfx+'-folder');
  if(!fs) return;

  // Folder
  const fId=selFolderId||fs.value||S.folders[0]?.id||'';
  fs.innerHTML='';
  S.folders.forEach(f=>{
    const o=document.createElement('option');
    o.value=f.id; o.textContent=f.name;
    if(f.id===fId) o.selected=true;
    fs.appendChild(o);
  });

  // Kategoria
  const cs=el(pfx+'-cat');
  const cats=S.tree[fId]?Object.keys(S.tree[fId]):[];
  if(cs){
    if(cats.length){
      cs.style.display='block';
      cs.innerHTML='<option value="">— bez kategorii —</option>';
      cats.forEach(c=>{
        const o=document.createElement('option');
        o.value=c; o.textContent=c;
        if(c===selCat) o.selected=true;
        cs.appendChild(o);
      });
    } else {
      cs.style.display='none'; cs.innerHTML='<option value="">— brak kategorii —</option>';
    }
  }
  const catVal=cs&&cats.length?cs.value:'';

  // Grupa
  const gs=el(pfx+'-group');
  const groups=catVal&&S.tree[fId]&&S.tree[fId][catVal]?Object.keys(S.tree[fId][catVal]):[];
  if(gs){
    if(catVal&&groups.length){
      gs.style.display='block';
      gs.innerHTML='<option value="">— bez grupy —</option>';
      groups.forEach(g=>{
        const o=document.createElement('option');
        o.value=g; o.textContent=g;
        if(g===selGroup) o.selected=true;
        gs.appendChild(o);
      });
    } else {
      gs.style.display='none'; gs.innerHTML='';
    }
  }
  const grpVal=gs&&gs.style.display!=='none'?gs.value:'';

  // Temat
  const ts=el(pfx+'-topic');
  const topics=catVal&&grpVal&&S.tree[fId]&&S.tree[fId][catVal]&&S.tree[fId][catVal][grpVal]?S.tree[fId][catVal][grpVal]:[];
  if(ts){
    if(catVal&&grpVal&&topics.length){
      ts.style.display='block';
      ts.innerHTML='<option value="">— bez tematu —</option>';
      topics.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;ts.appendChild(o);});
    } else {
      ts.style.display='none'; ts.innerHTML='';
    }
  }
}

function confirmAssign(){
  const note=S.notes.find(n=>n.id===S.assignNoteId);
  if(!note){ closeModal('m-assign'); return; }
  note.folder=el('a-folder').value||note.folder;
  note.category=(el('a-cat')&&el('a-cat').style.display!=='none')?el('a-cat').value||null:null;
  note.group=(el('a-group')&&el('a-group').style.display!=='none')?el('a-group').value||null:null;
  note.topic=(el('a-topic')&&el('a-topic').style.display!=='none')?el('a-topic').value||null:null;
  note.pending=false;
  save(); closeModal('m-assign'); renderNotesTab();
}

// ═══ SELECT BAR ═══
function renderSelectBar(){
  let bar=document.getElementById('select-bar');
  if(S.selectedNotes.size>0){
    if(!bar){
      bar=document.createElement('div');
      bar.id='select-bar';
      bar.style.cssText='position:fixed;bottom:var(--nav);left:0;right:0;max-width:480px;margin:0 auto;background:var(--bg3);border-top:1px solid var(--goldb);padding:10px 20px;display:flex;align-items:center;gap:10px;z-index:20';
      bar.innerHTML='<span style="flex:1;font-size:13px;color:var(--gold)" id="sel-cnt"></span>'+
        '<button onclick="S.selectedNotes.clear();renderNotesTab();renderSelectBar()" style="background:none;border:1px solid var(--bdr2);border-radius:8px;color:var(--w3);font-family:var(--fb);font-size:12px;padding:6px 12px;cursor:pointer">Odznacz</button>'+
        '<button onclick="openBulkSelected()" style="background:var(--golda);border:1.5px solid var(--gold);border-radius:8px;color:var(--gold2);font-family:var(--fb);font-size:12px;padding:6px 14px;cursor:pointer">Przypisz zaznaczone</button>';
      document.querySelector('.app').appendChild(bar);
    }
    document.getElementById('sel-cnt').textContent='Zaznaczono: '+S.selectedNotes.size;
  } else {
    if(bar) bar.remove();
  }
}

function openBulkSelected(){
  if(S.selectedNotes.size===0){
    alert('Zaznacz najpierw notatki checkboxami.');
    return;
  }
  buildAssignModal('b',null,null,null);
  const t=document.getElementById('m-bulk-title');
  if(t) t.textContent='Przypisz zaznaczone ('+S.selectedNotes.size+')';
  openModal('m-bulk');
}

// ═══ BULK ═══
function openBulk(source){
  S.bulkSource=source;
  const t=el('m-bulk-title');
  if(t) t.textContent=source==='pending'?'Przypisz nieprzypisane':'Przypisz notatki z folderu';
  fillSel('b-folder');
  hideSelects('b');
  updateSels('b');
  openModal('m-bulk');
}

function confirmBulk(){
  const fId=el('b-folder').value;
  const cat=(el('b-cat')&&el('b-cat').style.display!=='none')?el('b-cat').value||null:null;
  const grp=(el('b-group')&&el('b-group').style.display!=='none')?el('b-group').value||null:null;
  const top=(el('b-topic')&&el('b-topic').style.display!=='none')?el('b-topic').value||null:null;
  const toAssign=S.bulkSource==='pending'?S.notes.filter(n=>n.pending):S.notes.filter(n=>n.folder===S.bulkSource);
  toAssign.forEach(n=>{ n.folder=fId; n.category=cat; n.group=grp; n.topic=top; n.pending=false; });
  save(); closeModal('m-bulk'); renderNotesTab();
}

// ═══ SEARCH ═══
function doSearch(q){
  const res=el('search-results'); if(!res) return;
  const query=q.trim().toLowerCase();
  if(!query){ res.innerHTML='<div class="empty-state">Wpisz frazę aby przeszukać</div>'; return; }
  const found=S.notes.filter(n=>
    n.text.toLowerCase().includes(query)||
    getFolderName(n.folder).toLowerCase().includes(query)||
    (n.category&&n.category.toLowerCase().includes(query))||
    (n.group&&n.group.toLowerCase().includes(query))
  ).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  if(!found.length){ res.innerHTML='<div class="empty-state">Brak wyników</div>'; return; }
  res.innerHTML='';
  found.forEach(n=>{
    const card=buildCard(n);
    if(q){ const tEl=card.querySelector('.ntxt'); if(tEl) tEl.innerHTML=hlText(esc(n.text),q); }
    res.appendChild(card);
  });
  if(found.length===1) res.firstChild&&res.firstChild.scrollIntoView&&res.firstChild.scrollIntoView({behavior:'smooth'});
}

function voiceSearch(inputId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showErr('Brak obsługi głosu.'); return; }
  const sr=new SR(); sr.lang='pl-PL';
  sr.onresult=e=>{ const q=e.results[0][0].transcript; const inp=el(inputId); if(inp){ inp.value=q; doSearch(q); } };
  sr.onerror=e=>console.log('voice search error',e.error);
  try{ sr.start(); } catch(e){ console.log('voice search start err',e); }
}

function clearFilter(){
  S.filter={q:'',folder:'',status:'',from:'',to:''};
  ['notes-q','f-cat','f-status','f-from','f-to'].forEach(id=>{ const e=el(id); if(e) e.value=''; });
  renderNotesTab();
}

// ═══ EXPORT/IMPORT ═══
function exportNotes(){
  const lines=['WHISPR v'+VER+' — Eksport','Data: '+new Date().toLocaleDateString('pl-PL'),'','---',''];
  [...S.notes].sort((a,b)=>new Date(b.ts)-new Date(a.ts)).forEach(n=>{
    const d=new Date(n.ts);
    lines.push('['+d.toLocaleDateString('pl-PL')+' '+d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+']');
    let loc=getFolderName(n.folder);
    if(n.category) loc+=' › '+n.category;
    if(n.group) loc+=' › '+n.group;
    if(n.topic) loc+=' › '+n.topic;
    lines.push('Kategoria: '+loc); lines.push(n.text); lines.push('');
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='whispr-'+new Date().toISOString().slice(0,10)+'.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importNotes(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    const lines=e.target.result.split('\n'); let imported=0,i=0;
    while(i<lines.length){
      const match=lines[i].match(/^\[(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{2}:\d{2})\]/);
      if(match){
        const p=match[1].split('.');
        const ts=new Date(p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T'+match[2]+':00').toISOString();
        let folder='praca',cat=null,grp=null,top=null;
        if(i+1<lines.length&&lines[i+1].startsWith('Kategoria:')){
          const parts=lines[i+1].replace('Kategoria:','').trim().split('›').map(s=>s.trim());
          const ff=S.folders.find(f=>f.name===parts[0]); if(ff) folder=ff.id;
          if(parts[1]) cat=parts[1]; if(parts[2]) grp=parts[2]; if(parts[3]) top=parts[3];
          i+=2;
        } else i++;
        let text='';
        while(i<lines.length&&lines[i].trim()!==''&&!lines[i].match(/^\[/)){ text+=lines[i]+' '; i++; }
        text=text.trim();
        if(text){ S.notes.push({id:Date.now()+Math.random(),ts,text,folder,category:cat,group:grp,topic:top,pending:false}); imported++; }
      } else i++;
    }
    if(imported>0){ save(); renderNotesTab(); alert('Zaimportowano '+imported+' notatek!'); }
    else alert('Nie znaleziono notatek w pliku.');
    event.target.value='';
  };
  reader.readAsText(file);
}

// ═══ TIMER & WAVE ═══
function startTimer(){
  timerSec=0; el('timer').textContent='0:00';
  timerInt=setInterval(()=>{ timerSec++; const m=Math.floor(timerSec/60),s=timerSec%60; el('timer').textContent=m+':'+String(s).padStart(2,'0'); },1000);
}
function resetTimer(){ const t=el('timer'); if(t) t.textContent='0:00'; }

function startWave(){
  const canvas=el('wave-canvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  canvas.classList.add('on');
  function draw(){
    waveAF=requestAnimationFrame(draw);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<26;i++){
      const h=3+Math.random()*(canvas.height-6);
      const x=i*(canvas.width/26); const y=(canvas.height-h)/2;
      ctx.fillStyle='#c9a84c'; ctx.globalAlpha=0.3+Math.random()*0.7;
      ctx.beginPath(); ctx.roundRect(x,y,5,h,2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  draw();
}

function setRecUI(mode){
  const btn=el('rec-btn'); const outer=el('rec-outer');
  const mic=el('ic-mic'); const stop=el('ic-stop'); const hint=el('rec-hint');
  if(btn) btn.className='rec-btn '+mode;
  if(outer) outer.className='rec-outer '+mode;
  if(mic) mic.style.display=mode==='idle'?'block':'none';
  if(stop) stop.style.display=mode==='recording'?'block':'none';
  if(hint){ hint.className='rec-hint'+(mode==='recording'?' on':''); hint.textContent=mode==='idle'?'Dotknij aby nagrać':'Nagrywam... dotknij aby zakończyć'; }
}

// ═══ MODALS ═══
function openModal(id){ const e=el(id); if(e) e.style.display='flex'; }
function closeModal(id){ const e=el(id); if(e) e.style.display='none'; }
function showErr(msg){ const b=el('err-box'); if(b){ b.textContent=msg; b.style.display=msg?'block':'none'; } }
function hideErr(){ showErr(''); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Start
document.addEventListener('DOMContentLoaded', init);
