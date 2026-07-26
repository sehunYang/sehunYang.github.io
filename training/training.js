const root=document.documentElement;
const toggle=document.querySelector('#theme-toggle');
const saved=localStorage.getItem('theme');

if(saved)root.dataset.theme=saved;
else if(matchMedia('(prefers-color-scheme:dark)').matches)root.dataset.theme='dark';

toggle.addEventListener('click',()=>{
  root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('theme',root.dataset.theme);
});
