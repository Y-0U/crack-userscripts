// ==UserScript==
// @name         🗨️크랙 대사 수신자
// @namespace    https://crack.wrtn.ai/
// @version      1.0.0
// @description  채팅방별 인물 등록, 대사별 수신자/제외대상 선택, 원문에 수신자 표기 적용. 입력창을 대체하지 않습니다.
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
 'use strict';
 if (window.__crackDialogueTargetsV1) return;
 window.__crackDialogueTargetsV1 = true;
 const KEY='crack-dialogue-targets-v1';
 const host=document.createElement('div');host.id='cdt-host';host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483600';
 const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML=`<style>
 :host{font:13px system-ui,-apple-system,sans-serif;color:#27232d}*{box-sizing:border-box}button,input,textarea{font:inherit}
 .cdt-button{pointer-events:auto;position:fixed;z-index:3;border:1px solid #ded4e9;background:#fff;color:#322a42;box-shadow:0 3px 14px #0002;border-radius:20px;padding:7px 11px;cursor:pointer;font-weight:700}
 .cdt-chip{pointer-events:auto;position:fixed;z-index:2;border:1px solid #c8bfd1;background:#fff;color:#43374f;border-radius:8px;padding:3px 7px;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 8px #0003;cursor:pointer;font-size:12px}
 .cdt-chip.on{background:#49355c;color:white;border-color:#49355c}
 .cdt-shade{position:fixed;inset:0;background:#0009;pointer-events:auto;display:none;align-items:center;justify-content:center;padding:15px;z-index:5}
 .cdt-dialog{width:min(530px,100%);max-height:90dvh;overflow:auto;background:white;border-radius:17px;padding:18px;color:#2a2530;box-shadow:0 15px 60px #0005}
 .cdt-title{font-size:17px;font-weight:750;margin:0 0 10px}.cdt-hint{font-size:12px;color:#766f7a;line-height:1.6;margin:7px 0}
 .cdt-row{display:flex;gap:7px;align-items:center;margin:9px 0;flex-wrap:wrap}.cdt-grow{flex:1;min-width:120px}
 .cdt-dialog textarea,.cdt-dialog input{width:100%;padding:9px;border:1px solid #dad3df;border-radius:8px;background:white;color:#27232d}
 .cdt-dialog textarea{min-height:110px;resize:vertical}.cdt-action{padding:9px 12px;border:1px solid #d9d0e0;background:white;color:#2d2533;border-radius:8px;cursor:pointer}
 .cdt-action.primary{background:#463454;color:white;border-color:#463454}.cdt-preview{background:#f7f4f9;padding:10px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}
 .cdt-line{border-bottom:1px solid #f0edf3;padding:9px 0}.cdt-lineText{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
 .cdt-dropdown{position:fixed;z-index:4;pointer-events:auto;background:white;color:#27232d;border:1px solid #d8cfdf;border-radius:10px;box-shadow:0 5px 24px #0004;max-height:230px;overflow:auto;min-width:145px;max-width:min(260px,90vw);padding:5px}
 .cdt-option{display:block;width:100%;text-align:left;border:0;background:white;color:#29232e;padding:8px 10px;cursor:pointer;border-radius:6px}.cdt-option:hover{background:#f0eaf4}
 @media(max-width:680px){.cdt-button{padding:6px 10px;font-size:12px}.cdt-chip{font-size:11px;padding:3px 5px}.cdt-dialog{max-height:92dvh}}
 </style><button class="cdt-button" style="display:none">🎯 수신자</button><div id="chips"></div><div id="dropdown"></div><div class="cdt-shade"><div class="cdt-dialog"></div></div>`;
 document.documentElement.append(host);
 const button=shadow.querySelector('.cdt-button'), chips=shadow.querySelector('#chips'), menu=shadow.querySelector('#dropdown'),shade=shadow.querySelector('.cdt-shade'),dialog=shadow.querySelector('.cdt-dialog');
 const safeJSON=(v,fallback)=>{try{return JSON.parse(v)}catch{return fallback}};
 let db=safeJSON(localStorage.getItem(KEY),{});if(!db||typeof db!=='object')db={};
 let active=null,room='',selectedKeys=new Map(),lastText='',lastRoom='',timer=0,settingsOpen=false,menuOpen=false;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('[크랙 대사 수신자] 저장 실패',e)}};
 const getRoom=()=>location.pathname+location.search;
 const config=()=>{if(!db[room])db[room]={characters:[]};return db[room]};
 function getEditor(){
  const nodes=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(x=>{
   if(host.contains(x)||!x.isConnected||x.disabled||x.readOnly)return false;
   const r=x.getBoundingClientRect(),st=getComputedStyle(x);
   return r.width>120&&r.height>20&&r.bottom>0&&r.top<innerHeight&&st.visibility!=='hidden'&&st.display!=='none';
  });
  // Prefer the visible message composer near the bottom, but not a search box.
  return nodes.sort((a,b)=>{
   const score=e=>{const r=e.getBoundingClientRect();return (e.tagName==='TEXTAREA'?150:0)+(e.isContentEditable?90:0)+r.top/10+(r.bottom>innerHeight*.50?80:0)-(e.closest('[role="dialog"]')?500:0)-(/검색|search/i.test(e.getAttribute('placeholder')||'')?500:0)};
   return score(b)-score(a);
  })[0]||null;
 }
 function valueOf(e){return e?.isContentEditable?e.innerText:(e?.value||'')}
 function setValue(e,value){
  if(!e)return;
  if(e.isContentEditable){e.focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);
   try{document.execCommand('insertText',false,value)}catch{e.textContent=value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}))}
  }else{const p=Object.getPrototypeOf(e),desc=Object.getOwnPropertyDescriptor(p,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
   desc?.set?.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();
  }
 }
 // Double quotes, Korean typographic quotes, and single-line dialogue. Existing narrative is left untouched.
 function findQuotes(text){const re=/("[^"\n]+"|“[^”\n]+”|「[^」\n]+」)/g;const result=[];let m;
  while((m=re.exec(text))!==null)result.push({start:m.index,end:m.index+m[0].length,text:m[0]});return result;
 }
 const keyOf=q=>String(q.start)+':'+q.text;
 const choiceLabel=v=>!v?'대상':v.endsWith('::except')?v.slice(0,-8)+'−':v;
 const labelExpanded=v=>!v?'':v.endsWith('::except')?`[${v.slice(0,-8)}를 제외한 현장 전원에게] `:`[${v}에게] `;
 function transform(text){const quotes=findQuotes(text);let out='',offset=0;for(const q of quotes){out+=text.slice(offset,q.start);const v=selectedKeys.get(keyOf(q))||'';out+=labelExpanded(v)+q.text;offset=q.end;}return out+text.slice(offset)}
 function reconcile(oldText,newText){if(oldText===newText)return;const oldQuotes=findQuotes(oldText),next=findQuotes(newText),oldArr=oldQuotes.map(q=>({text:q.text,val:selectedKeys.get(keyOf(q))||''}));
  const fresh=new Map(),used=new Set();next.forEach((q,i)=>{let found=-1;if(oldArr[i]?.text===q.text&&!used.has(i))found=i;
   if(found<0)found=oldArr.findIndex((r,j)=>r.text===q.text&&!used.has(j));if(found>=0){used.add(found);if(oldArr[found].val)fresh.set(keyOf(q),oldArr[found].val)}});selectedKeys=fresh;
 }
 function hideMenu(){menu.replaceChildren();menuOpen=false}
 function pick(q,rect){hideMenu();menuOpen=true;const choices=[['','지정 없음']];for(const name of config().characters){choices.push([name,name],[name+'::except',name+'− (제외한 현장 전원)'])}
  if(choices.length===1)choices.push(['','⚙️ 먼저 캐릭터를 등록해 주세요']);
  const dd=document.createElement('div');dd.className='cdt-dropdown';dd.style.cssText=`left:${Math.max(7,Math.min(innerWidth-268,rect.left))}px;top:${Math.max(7,Math.min(innerHeight-244,rect.bottom+3))}px`;
  for(const [val,label]of choices){const b=document.createElement('button');b.className='cdt-option';b.textContent=label;b.onclick=()=>{if(val)selectedKeys.set(keyOf(q),val);else selectedKeys.delete(keyOf(q));hideMenu();renderChips()};dd.append(b)}menu.append(dd);
 }
 function posTextarea(e,offset){
  // Hidden mirror uses identical text metrics, padding and scroll to locate a quoted substring.
  const style=getComputedStyle(e),r=e.getBoundingClientRect();const m=document.createElement('div');m.style.cssText='position:fixed;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;word-break:'+style.wordBreak+';';
  for(const p of ['font','fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','textTransform','textIndent','textAlign','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderLeftWidth','boxSizing','tabSize'])m.style[p]=style[p];
  m.style.width=r.width+'px';m.style.left=r.left+'px';m.style.top=r.top+'px';m.style.border='0';m.style.paddingTop=style.paddingTop;m.style.paddingLeft=style.paddingLeft;
  const prior=document.createTextNode(valueOf(e).slice(0,offset));const anchor=document.createElement('span');anchor.textContent='\u200b';m.append(prior,anchor);document.body.append(m);
  const at=anchor.getBoundingClientRect();const y=at.top-e.scrollTop;const x=at.left-e.scrollLeft;m.remove();return {x,y,height:parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.4};
 }
 function posContenteditable(e,offset){const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n,remain=offset;while((n=walker.nextNode())){if(remain<=n.textContent.length){const rg=document.createRange();rg.setStart(n,Math.min(remain,n.length));rg.setEnd(n,Math.min(remain+1,n.length));const r=rg.getBoundingClientRect();return {x:r.left,y:r.top,height:r.height||18}}remain-=n.textContent.length}return null}
 function renderChips(){chips.replaceChildren();if(!active||settingsOpen)return;const txt=valueOf(active),qs=findQuotes(txt);if(qs.length>40)return;
  const r=active.getBoundingClientRect();for(const q of qs){const at=active.isContentEditable?posContenteditable(active,q.start):posTextarea(active,q.start);if(!at||at.y<r.top-4||at.y>r.bottom-4)continue;
   const b=document.createElement('button');b.className='cdt-chip'+(selectedKeys.has(keyOf(q))?' on':'');b.textContent=choiceLabel(selectedKeys.get(keyOf(q)));b.title=q.text;
   // Position in the composer gutter. Button floats to the left of the selected quotation.
   let x=at.x-110;if(x<5)x=Math.min(innerWidth-110,r.right-110);
   b.style.left=Math.max(5,Math.min(innerWidth-118,x))+'px';b.style.top=Math.max(5,at.y-3)+'px';b.onclick=ev=>{ev.stopPropagation();pick(q,b.getBoundingClientRect())};chips.append(b);
  }
 }
 function update(){if(settingsOpen)return;const candidate=getEditor();const nextRoom=getRoom();if(nextRoom!==room){room=nextRoom;selectedKeys.clear();lastText='';hideMenu()}
  if(candidate!==active){active=candidate;selectedKeys.clear();lastText='';hideMenu()}
  if(!active){button.style.display='none';chips.replaceChildren();return}
  const r=active.getBoundingClientRect();button.style.display='block';button.style.left=Math.max(8,Math.min(innerWidth-105,r.right-105))+'px';button.style.top=Math.max(5,r.top-36)+'px';
  const txt=valueOf(active);if(txt!==lastText){reconcile(lastText,txt);lastText=txt}renderChips();
 }
 const close=()=>{settingsOpen=false;shade.style.display='none';dialog.replaceChildren();update()};
 function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
 function action(label,fn,primary=false){const b=node('button',label,'cdt-action'+(primary?' primary':''));b.onclick=fn;return b}
 function openSettings(){if(!active)return;settingsOpen=true;hideMenu();chips.replaceChildren();shade.style.display='flex';dialog.replaceChildren();
  dialog.append(node('h2','🎯 대사 수신자 설정','cdt-title'));
  dialog.append(node('p','이 채팅방에 등장하는 캐릭터를 한 줄에 한 명씩 입력해 주세요. 이름 하나로 ‘이름’과 ‘이름−’ 토글이 자동 생성돼요.','cdt-hint'));
  const input=node('textarea');input.value=config().characters.join('\n');dialog.append(input);
  const row=node('div',undefined,'cdt-row');dialog.append(row);
  row.append(action('캐릭터 저장',()=>{config().characters=[...new Set(input.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean))];save();hideMenu();showSettingsList();},true),action('닫기',close));
  const list=node('div');list.id='cdt-options';dialog.append(list);
  dialog.append(node('p','대사 앞의 작은 ‘대상’ 버튼에서 지정해요. “이름−”는 그 인물을 제외한 현재 장면의 전원에게 하는 말이에요.','cdt-hint'));
  dialog.append(node('p','전송 전에 아래의 “수신자 반영”을 누르면, 선택한 대사에만 [A에게] 같은 짧은 표기가 실제 입력창에 삽입돼요. 지정하지 않은 대사는 그대로 유지됩니다.','cdt-hint'));
  dialog.append(action('선택한 수신자 반영',()=>{apply();close()},true));
  function showSettingsList(){list.textContent='등록됨: '+(config().characters.flatMap(n=>[n,n+'−']).join(' · ')||'없음')}showSettingsList();
 }
 function apply(){if(!active)return;const before=valueOf(active),after=transform(before);if(after===before)return;
  setValue(active,after);selectedKeys.clear();lastText=after;renderChips();
 }
 button.addEventListener('click',openSettings);
 shade.addEventListener('pointerdown',e=>{if(e.target===shade)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsOpen)close()});
 document.addEventListener('pointerdown',e=>{if(menuOpen&&!menu.contains(e.target)&&!chips.contains(e.target))hideMenu()},true);
 document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,60)},true);
 document.addEventListener('scroll',()=>{if(!settingsOpen)update()},true);
 window.addEventListener('resize',()=>{if(!settingsOpen)update()});
 // Convenient button next to the composer: optional explicit application before sending.
 const applyButton=node('button','✓ 반영','cdt-button');applyButton.style.display='none';shadow.append(applyButton);
 applyButton.addEventListener('click',()=>{apply();update()});
 function tick(){update();if(!active||settingsOpen){applyButton.style.display='none';return}const r=active.getBoundingClientRect();applyButton.style.display='block';applyButton.style.left=Math.max(5,Math.min(innerWidth-210,r.right-200))+'px';applyButton.style.top=Math.max(5,r.top-36)+'px'}
 setInterval(tick,1000);tick();
})();
