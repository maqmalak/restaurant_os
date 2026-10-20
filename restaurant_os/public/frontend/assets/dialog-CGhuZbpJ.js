import{c as r,X as f,j as p}from"./index-DMgzIKsY.js";import{j as e}from"./vendor-frappe-DFxqJRi9.js";import{r as m,a as y}from"./vendor-react-NulDNQOh.js";/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=r("ArrowLeft",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=r("History",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=r("Printer",[["path",{d:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",key:"143wyd"}],["path",{d:"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",key:"1itne7"}],["rect",{x:"6",y:"14",width:"12",height:"8",rx:"1",key:"1ue0tg"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=r("RotateCcw",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=r("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]),b={sm:"max-w-sm",md:"max-w-lg",lg:"max-w-2xl",xl:"max-w-4xl"},a=[];function L({open:o,onClose:t,title:s,description:n,children:h,className:x,size:u="md"}){const l=m.useRef(t);return l.current=t,m.useEffect(()=>{if(!o)return;const i=Symbol("dialog");a.push(i);const c=d=>{d.key==="Escape"&&a[a.length-1]===i&&l.current()};return document.addEventListener("keydown",c),document.body.style.overflow="hidden",()=>{document.removeEventListener("keydown",c);const d=a.indexOf(i);d!==-1&&a.splice(d,1),a.length===0&&(document.body.style.overflow="")}},[o]),o?y.createPortal(e.jsxs("div",{className:"fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6",children:[e.jsx("div",{className:"fixed inset-0 bg-black/65 backdrop-blur-sm",onClick:t,"aria-hidden":"true"}),e.jsxs("div",{role:"dialog","aria-modal":"true","aria-label":s,className:p("relative z-10 mt-10 w-full animate-fade-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10 sm:mt-16","dark:border-white/10 dark:bg-card dark:shadow-[0_24px_80px_rgb(0_0_0_/_0.6)]",b[u],x),children:[(s||n)&&e.jsxs("div",{className:"flex items-start justify-between gap-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] via-transparent to-transparent px-5 py-4",children:[e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("span",{className:"mt-0.5 h-5 w-1 shrink-0 rounded-full bg-primary","aria-hidden":"true"}),e.jsxs("div",{children:[s&&e.jsx("h2",{className:"text-base font-semibold tracking-tight",children:s}),n&&e.jsx("p",{className:"mt-0.5 text-sm text-muted-foreground",children:n})]})]}),e.jsx("button",{onClick:t,className:"rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground","aria-label":"Close",children:e.jsx(f,{className:"h-4 w-4"})})]}),e.jsx("div",{className:"p-5",children:h})]})]}),document.body):null}export{w as A,L as D,j as H,N as P,M as R,E as Z};
