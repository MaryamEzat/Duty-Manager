export const qs = (selector,root=document) => root.querySelector(selector);
export const qsa = (selector,root=document) => [...root.querySelectorAll(selector)];
export const setText = (element,value) => { if(element) element.textContent = value ?? ''; };
