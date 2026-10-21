import { mountPassport } from './view.mjs';
const ready = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true})) : Promise.resolve();
await ready;
for (const root of document.querySelectorAll('[data-axo-passport]')) await mountPassport(root);
