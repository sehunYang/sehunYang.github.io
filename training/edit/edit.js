/* 연수 페이지 편집기
   - /training/content.json 을 GitHub API로 읽고 씁니다. (서버 없음, 정적 사이트)
   - 쓰기 권한은 브라우저에 저장된 본인 GitHub 토큰으로만 생깁니다. 토큰이 없으면 아무것도 저장할 수 없습니다.
   - 저장하면 GitHub Pages가 다시 빌드되어 약 1분 안에 사이트에 반영됩니다. */
const REPO='sehunYang/sehunYang.github.io';
const BRANCH='main';
const FILE='training/content.json';
const API=`https://api.github.com/repos/${REPO}/contents/${FILE}`;
const LIVE_URL='/training/content.json';
const TOKEN_KEY='shy_edit_token';

const $=s=>document.querySelector(s);
const authView=$('#auth'),editorView=$('#editor'),toolbar=$('#toolbar');
const tokenForm=$('#token-form'),tokenInput=$('#token-input'),tokenStatus=$('#token-status');
const form=$('#edit-form'),sectionsBox=$('#sections'),saveStatus=$('#save-status');
const saveBtn=$('#save'),reloadBtn=$('#reload'),previewFrame=$('#preview-frame');

let token=localStorage.getItem(TOKEN_KEY)||'';
let data=null,sha='',baseline='',dirty=false,previewReady=false,busy=false;

/* ---------- 테마 (다른 페이지와 동일) ---------- */
const root=document.documentElement,toggle=$('#theme-toggle');
const savedTheme=localStorage.getItem('theme');
if(savedTheme)root.dataset.theme=savedTheme;
else if(matchMedia('(prefers-color-scheme:dark)').matches)root.dataset.theme='dark';
toggle.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';localStorage.setItem('theme',root.dataset.theme);syncPreviewTheme();});
function syncPreviewTheme(){try{previewFrame.contentDocument.documentElement.dataset.theme=root.dataset.theme;}catch{}}

/* ---------- 작은 도우미 ---------- */
const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v==null)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else n.setAttribute(k,v);}n.append(...children.filter(c=>c!=null));return n;};
const encode=s=>btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
const decode=b=>new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const getPath=(obj,path)=>path.split('.').reduce((o,k)=>o?.[k],obj);
const setPath=(obj,path,value)=>{const keys=path.split('.');const last=keys.pop();const target=keys.reduce((o,k)=>(o[k]??={}),obj);target[last]=value;};
const serialize=d=>JSON.stringify(d,null,2)+'\n';

const toast=el('div',{class:'toast',role:'status','aria-live':'polite','aria-atomic':'true'});document.body.append(toast);let toastTimer;
function showToast(msg){toast.textContent=msg;toast.classList.add('is-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),2600);}

function setStatus(node,message,kind){node.textContent=message;node.className=`edit-status${kind?` is-${kind}`:''}`;}

function normalize(d){
  d=d&&typeof d==='object'?d:{};
  d.meta={title:'',description:'',...(d.meta||{})};
  d.hero={eyebrow:'',title:'',meta:'',...(d.hero||{})};
  d.goal={eyebrow:'',title:'',text:'',...(d.goal||{})};
  d.sections=Array.isArray(d.sections)?d.sections:[];
  d.sections.forEach(s=>{s.eyebrow??='';s.title??='';s.links=Array.isArray(s.links)?s.links:[];s.links.forEach(l=>{l.title??='';l.desc??='';l.cta??='';l.url??='';});});
  return d;
}

/* ---------- GitHub API ---------- */
const headers=()=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});

function apiError(status){
  if(status===401)return '토큰이 올바르지 않거나 만료되었습니다. 토큰을 다시 확인해 주세요.';
  if(status===404)return '토큰에 sehunYang.github.io 저장소 접근 권한이 없습니다. 토큰의 Repository access 설정을 확인해 주세요.';
  if(status===403)return '권한이 부족합니다. 토큰의 Contents 권한이 Read and write인지 확인해 주세요.';
  if(status===409)return '다른 곳에서 먼저 저장된 내용이 있습니다. 되돌리기를 눌러 최신 내용을 불러온 뒤 다시 저장해 주세요.';
  return `GitHub 응답 오류 (${status})`;
}

async function fetchFile(){
  let r;
  try{r=await fetch(`${API}?ref=${BRANCH}`,{headers:headers(),cache:'no-store'});}
  catch{throw new Error('네트워크에 연결할 수 없습니다.');}
  if(!r.ok)throw new Error(apiError(r.status));
  const json=await r.json();
  return {sha:json.sha,text:decode(json.content)};
}

async function putFile(text,currentSha){
  let r;
  try{r=await fetch(API,{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({message:'content(training): 연수 페이지 수정 (사이트 편집기)',content:encode(text),sha:currentSha,branch:BRANCH})});}
  catch{throw new Error('네트워크에 연결할 수 없습니다.');}
  if(!r.ok)throw new Error(apiError(r.status));
  const json=await r.json();
  return json.content.sha;
}

/* ---------- 화면 전환 ---------- */
function showAuth(message,kind){
  authView.hidden=false;editorView.hidden=true;toolbar.hidden=true;
  setStatus(tokenStatus,message||'',kind);
  tokenInput.value='';
  tokenInput.focus();
}

async function showEditor(){
  authView.hidden=true;editorView.hidden=false;toolbar.hidden=false;
  await load();
}

async function load(){
  setBusy(true);setStatus(saveStatus,'불러오는 중…');
  try{
    const file=await fetchFile();
    sha=file.sha;
    data=normalize(JSON.parse(file.text));
    baseline=serialize(data);
    setDirty(false);
    bindForm();renderSections();sendPreview();
    setStatus(saveStatus,'현재 사이트 내용을 불러왔습니다.');
  }catch(e){
    setStatus(saveStatus,e.message,'error');
    if(/토큰|권한/.test(e.message)){localStorage.removeItem(TOKEN_KEY);token='';showAuth(e.message,'error');}
  }finally{setBusy(false);}
}

function setBusy(v){busy=v;saveBtn.disabled=v||!dirty;reloadBtn.disabled=v;}
function setDirty(v){dirty=v;saveBtn.disabled=busy||!v;saveBtn.textContent=v?'사이트에 저장':'저장됨';}
function markChanged(){setDirty(serialize(data)!==baseline);if(dirty)setStatus(saveStatus,'저장하지 않은 변경 사항이 있습니다.');schedulePreview();}

/* ---------- 폼 ↔ 데이터 ---------- */
function bindForm(){
  form.querySelectorAll('[data-path]').forEach(input=>{
    input.value=getPath(data,input.dataset.path)??'';
    input.oninput=()=>{setPath(data,input.dataset.path,input.value);markChanged();};
  });
}

function field(label,obj,key,opts={}){
  const input=el(opts.multiline?'textarea':'input',{placeholder:opts.placeholder,rows:opts.rows,inputmode:opts.inputmode});
  input.value=obj[key]??'';
  input.addEventListener('input',()=>{obj[key]=input.value;markChanged();});
  return el('label',{},document.createTextNode(label+' '),input);
}

function tools(list,index,onChange,label){
  const move=(from,to)=>{const [item]=list.splice(from,1);list.splice(to,0,item);onChange();};
  const up=el('button',{type:'button',text:'↑ 위로','aria-label':`${label} 위로 이동`});up.disabled=index===0;up.onclick=()=>move(index,index-1);
  const down=el('button',{type:'button',text:'↓ 아래로','aria-label':`${label} 아래로 이동`});down.disabled=index===list.length-1;down.onclick=()=>move(index,index+1);
  const del=el('button',{type:'button',class:'is-danger',text:'삭제','aria-label':`${label} 삭제`});
  del.onclick=()=>{if(del.dataset.armed){list.splice(index,1);onChange();return;}del.dataset.armed='1';del.textContent='정말 삭제?';setTimeout(()=>{del.dataset.armed='';del.textContent='삭제';},3000);};
  return el('div',{class:'edit-tools'},up,down,del);
}

function renderSections(){
  const rerender=()=>{renderSections();markChanged();};
  sectionsBox.replaceChildren(...data.sections.map((section,si)=>{
    const links=el('div',{class:'edit-links'},...section.links.map((link,li)=>el('div',{class:'edit-link'},
      el('div',{class:'edit-row'},field('카드 제목',link,'title',{placeholder:'연수 자료 모음'}),field('버튼 문구',link,'cta',{placeholder:'다운로드 ↗'})),
      field('카드 설명',link,'desc',{placeholder:'슬라이드와 실습 파일을 내려받습니다.'}),
      field('연결 주소',link,'url',{placeholder:'https://',inputmode:'url'}),
      tools(section.links,li,rerender,`링크 ${li+1}`))));
    const addLink=el('button',{type:'button',class:'button secondary edit-add',text:'+ 링크 추가'});
    addLink.onclick=()=>{section.links.push({title:'',desc:'',cta:'접속 ↗',url:''});rerender();sectionsBox.querySelectorAll('.edit-link')[Array.from(sectionsBox.querySelectorAll('.edit-link')).length-1]?.querySelector('input')?.focus();};
    return el('fieldset',{},
      el('legend',{text:`링크 묶음 ${si+1}`}),
      el('div',{class:'edit-row'},field('영문 구분명',section,'eyebrow',{placeholder:'Materials'}),field('제목',section,'title',{placeholder:'연수 자료'})),
      links,addLink,
      tools(data.sections,si,rerender,`링크 묶음 ${si+1}`));
  }));
}

$('#add-section').addEventListener('click',()=>{data.sections.push({eyebrow:'Links',title:'',links:[{title:'',desc:'',cta:'접속 ↗',url:''}]});renderSections();markChanged();sectionsBox.lastElementChild?.querySelector('input')?.focus();});

/* ---------- 미리보기 ---------- */
let previewTimer;
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(sendPreview,150);}
function sendPreview(){if(!previewReady||!data)return;previewFrame.contentWindow.postMessage({type:'training-preview',content:data},location.origin);syncPreviewTheme();}
addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='training-preview-ready')return;previewReady=true;sendPreview();});

/* ---------- 저장 ---------- */
async function save(){
  if(busy||!dirty)return;
  setBusy(true);setStatus(saveStatus,'GitHub에 저장하는 중…');
  data.updatedAt=new Date().toISOString();
  const text=serialize(data);
  try{
    try{sha=await putFile(text,sha);}
    catch(e){
      if(!/먼저 저장된/.test(e.message))throw e;
      // 다른 곳에서 먼저 저장했다면 최신 sha로 한 번 더 시도합니다. 내 편집 내용이 우선합니다.
      const latest=await fetchFile();sha=await putFile(text,latest.sha);
    }
    baseline=text;setDirty(false);showToast('저장했습니다. 곧 사이트에 반영됩니다.');
    setStatus(saveStatus,'GitHub에 저장했습니다. 사이트 반영을 기다리는 중… (보통 1분 이내)');
    const live=await waitForLive(data.updatedAt);
    if(live){
      setStatus(saveStatus,'사이트에 반영되었습니다 ✓ ','ok');
      saveStatus.append(el('a',{href:'/training/',target:'_blank',rel:'noopener',text:'연수 페이지 열기 ↗'}));
    }else{
      setStatus(saveStatus,'저장은 완료됐지만 아직 반영을 확인하지 못했습니다. 잠시 후 연수 페이지를 새로고침해 확인해 주세요.');
    }
  }catch(e){
    setStatus(saveStatus,e.message,'error');setDirty(true);
  }finally{setBusy(false);}
}

async function waitForLive(stamp){
  const deadline=Date.now()+5*60*1000;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,8000));
    try{const r=await fetch(`${LIVE_URL}?t=${Date.now()}`,{cache:'no-store'});if(r.ok&&(await r.json()).updatedAt===stamp)return true;}catch{}
  }
  return false;
}

saveBtn.addEventListener('click',save);
reloadBtn.addEventListener('click',()=>{
  if(busy)return;
  if(dirty&&!reloadBtn.dataset.armed){reloadBtn.dataset.armed='1';reloadBtn.textContent='변경 사항을 버릴까요?';setTimeout(()=>{reloadBtn.dataset.armed='';reloadBtn.textContent='되돌리기';},4000);return;}
  reloadBtn.dataset.armed='';reloadBtn.textContent='되돌리기';load();
});
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();}});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
form.addEventListener('submit',e=>e.preventDefault());

/* ---------- 토큰 ---------- */
tokenForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const value=tokenInput.value.trim();
  if(!value)return;
  setStatus(tokenStatus,'토큰을 확인하는 중…');
  tokenForm.querySelector('button').disabled=true;
  token=value;
  try{
    await fetchFile();
    localStorage.setItem(TOKEN_KEY,token);
    await showEditor();
  }catch(err){token='';setStatus(tokenStatus,err.message,'error');}
  finally{tokenForm.querySelector('button').disabled=false;}
});

$('#forget-token').addEventListener('click',()=>{localStorage.removeItem(TOKEN_KEY);token='';data=null;showAuth('이 브라우저에서 토큰을 삭제했습니다.');});

/* ---------- 시작 ---------- */
if(token)showEditor();else showAuth();
