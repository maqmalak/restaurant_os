import{r as d}from"./vendor-react-NulDNQOh.js";import{c as n,U as m,g as u}from"./index-D2o7bqri.js";import{F as h}from"./flame-BFwN9tJI.js";import{C as l}from"./cooking-pot-YSErVYJ8.js";/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=n("Croissant",[["path",{d:"m4.6 13.11 5.79-3.21c1.89-1.05 4.79 1.78 3.71 3.71l-3.22 5.81C8.8 23.16.79 15.23 4.6 13.11Z",key:"1ozxlb"}],["path",{d:"m10.5 9.5-1-2.29C9.2 6.48 8.8 6 8 6H4.5C2.79 6 2 6.5 2 8.5a7.71 7.71 0 0 0 2 4.83",key:"ffuyb5"}],["path",{d:"M8 6c0-1.55.24-4-2-4-2 0-2.5 2.17-2.5 4",key:"osnpzi"}],["path",{d:"m14.5 13.5 2.29 1c.73.3 1.21.7 1.21 1.5v3.5c0 1.71-.5 2.5-2.5 2.5a7.71 7.71 0 0 1-4.83-2",key:"1vubaw"}],["path",{d:"M18 16c1.55 0 4-.24 4 2 0 2-2.17 2.5-4 2.5",key:"wxr772"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=n("CupSoda",[["path",{d:"m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8",key:"8166m8"}],["path",{d:"M5 8h14",key:"pcz4l3"}],["path",{d:"M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0",key:"yjz344"}],["path",{d:"m12 8 1-6h2",key:"3ybfa4"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=n("Fish",[["path",{d:"M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z",key:"15baut"}],["path",{d:"M18 12v.5",key:"18hhni"}],["path",{d:"M16 17.93a9.77 9.77 0 0 1 0-11.86",key:"16dt7o"}],["path",{d:"M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33",key:"l9di03"}],["path",{d:"M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4",key:"1kjonw"}],["path",{d:"m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98",key:"1zlm23"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=n("Salad",[["path",{d:"M7 21h10",key:"1b0cd5"}],["path",{d:"M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z",key:"4rw317"}],["path",{d:"M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1",key:"10xrj0"}],["path",{d:"m13 12 4-4",key:"1hckqy"}],["path",{d:"M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2",key:"1p4srx"}]]),x=t=>t.item.price+t.modifiers.reduce((a,e)=>{var i;const o=t.item.modifiers.find(s=>s.group===e.group);return a+(((i=o==null?void 0:o.options.find(s=>s.name===e.name))==null?void 0:i.price)??0)},0),F=t=>t.map(a=>({item_code:a.item.item_code,qty:a.qty,modifiers:a.modifiers,notes:a.notes}));function w(t){return t.modifiers.flatMap(a=>{const e=a.options.filter(o=>o.default);return e.length?e.map(o=>({group:a.group,name:o.name})):a.required&&a.options[0]?[{group:a.group,name:a.options[0].name}]:[]})}function z(t){const[a,e]=d.useState(null),[o,i]=d.useState("");return d.useEffect(()=>{let s=!0;const p=()=>u("restaurant_os.api.online.menu",t?{branch:t}:void 0).then(r=>s&&e(r)).catch(r=>s&&i(String((r==null?void 0:r.message)??r)));p();const c=setInterval(p,6e4);return()=>{s=!1,clearInterval(c)}},[t]),{menu:a,error:o}}const I=(t,a="PKR")=>`${a==="PKR"?"Rs":a} ${Math.round(t).toLocaleString()}`,M=[[/bbq|grill|tikka|kabab/i,h],[/handi|curry|karahi/i,l],[/fish|sea/i,k],[/breakfast|paratha|bakery/i,f],[/drink|beverage|juice|tea|coffee/i,y],[/side|add-on|salad|extra/i,C]],q=t=>{var a;return((a=M.find(([e])=>e.test(t)))==null?void 0:a[1])??m},P="@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');";export{P as S,F as a,q as c,w as d,x as l,I as m,z as u};
