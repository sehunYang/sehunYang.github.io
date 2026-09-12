/* 연수 페이지: /training/content.json 을 읽어 화면을 그립니다.
   내용은 /training/edit/ 에서 편집합니다. 이 파일은 손대지 않아도 됩니다. */
const CONTENT_URL='/training/content.json';
const TOKEN_KEY='shy_edit_token';
const root=document.documentElement;
const toggle=document.querySelector('#theme-toggle');
const main=document.querySelector('#main');
const saved=localStorage.getItem('theme');

if(saved)root.dataset.theme=saved;
else if(matchMedia('(prefers-color-scheme:dark)').matches)root.dataset.theme='dark';

toggle.addEventListener('click',()=>{
  root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('theme',root.dataset.theme);
});

/* 이 브라우저에 편집 토큰이 저장되어 있으면(=관리자) 메뉴에 편집 링크를 보여줍니다. */
if(localStorage.getItem(TOKEN_KEY))document.querySelector('#edit-link').hidden=false;

const el=(tag,attrs={},...children)=>{
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(v==null)continue;
    if(k==='class')node.className=v;
    else if(k==='text')node.textContent=v;
    else node.setAttribute(k,v);
  }
  node.append(...children.filter(c=>c!=null));
  return node;
};

/* **굵게** 표시만 지원하는 아주 작은 인라인 서식. 나머지는 모두 일반 글자로 취급합니다. */
function rich(text){
  const frag=document.createDocumentFragment();
  const parts=String(text??'').split(/\*\*(.+?)\*\*/);
  parts.forEach((part,i)=>{
    if(!part)return;
    frag.append(i%2?el('strong',{text:part}):document.createTextNode(part));
  });
  return frag;
}

function paragraphs(text,className){
  return String(text??'').split(/\n+/).map(s=>s.trim()).filter(Boolean)
    .map(line=>{const p=el('p',{class:className});p.append(rich(line));return p;});
}

function linkCard(link){
  const desc=el('small');desc.append(rich(link.desc));
  return el('a',{class:'training-link-card',href:link.url||'#',target:'_blank',rel:'noopener'},
    el('span',{},el('strong',{text:link.title||''}),desc),
    el('span',{'aria-hidden':'true',text:link.cta||'열기 ↗'}));
}

function render(data){
  if(data.meta){
    if(data.meta.title)document.title=data.meta.title;
    const d=document.querySelector('meta[name="description"]');
    if(d&&data.meta.description)d.content=data.meta.description;
  }
  const hero=data.hero||{},goal=data.goal||{};
  const nodes=[
    el('section',{class:'training-hero'},
      el('p',{class:'eyebrow',text:hero.eyebrow||''}),
      el('h1',{text:hero.title||''}),
      el('p',{class:'training-meta',text:hero.meta||''})),
    el('section',{'aria-labelledby':'goal-title'},
      el('p',{class:'eyebrow',text:goal.eyebrow||''}),
      el('h2',{id:'goal-title',text:goal.title||''}),
      ...paragraphs(goal.text,'training-goal'))
  ];
  (data.sections||[]).forEach((section,i)=>{
    const id=`section-title-${i}`;
    nodes.push(el('section',{'aria-labelledby':id},
      el('p',{class:'eyebrow',text:section.eyebrow||''}),
      el('h2',{id,text:section.title||''}),
      el('div',{class:'training-links'},...(section.links||[]).map(linkCard))));
  });
  main.replaceChildren(...nodes);
  main.removeAttribute('aria-busy');
}

function renderError(){
  main.replaceChildren(el('section',{class:'training-hero'},
    el('p',{class:'eyebrow',text:'Training Day'}),
    el('h1',{text:'오늘의 연수'}),
    el('p',{class:'training-meta',text:'내용을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'})));
  main.removeAttribute('aria-busy');
}

/* 편집기 미리보기 모드: 부모 창(편집기)이 보내주는 초안을 그대로 그립니다. */
const preview=new URLSearchParams(location.search).has('preview');
if(preview){
  document.querySelector('.site-header').hidden=true;
  document.querySelector('footer').hidden=true;
  addEventListener('message',e=>{
    if(e.origin!==location.origin||!e.data||e.data.type!=='training-preview')return;
    render(e.data.content);
  });
  if(window.parent!==window)window.parent.postMessage({type:'training-preview-ready'},location.origin);
}else{
  fetch(`${CONTENT_URL}?t=${Date.now()}`,{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error(r.status);return r.json();})
    .then(render)
    .catch(renderError);
}
