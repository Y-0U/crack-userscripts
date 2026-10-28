// ==UserScript==
// @name         🗨️크랙 대사 수신자
// @namespace    https://crack.wrtn.ai/
// @version      1.1.0
// @description  채팅방별 인물 등록, 대사별 수신자/제외대상 선택, 원문에 수신자 표기 적용. 입력창을 대체하지 않습니다.
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
 'use strict';
 if (window.__crackDialogueTargetsV110) return;
 window.__crackDialogueTargetsV110 = true;
 const KEY='crack-dialogue-targets-v1';
 const host=document.createElement('div');host.id='cdt-host';host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483600';
 const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML=`<style>
 :host{font:13px system-ui,-apple-system,sans-serif;color:#27232d}*{box-sizing:border-box}button,input,textarea{font:inherit}
 .cdt-button{pointer-events:auto;position:fixed;z-index:3;border:1px solid #ded4e9;background:#fff;color:#322a42;box-shadow:0 3px 14px #0002;border-radius:20px;padding:7px 11px;cursor:pointer;font-weight:700}
 .cdt-chip{pointer-events:auto;position:fixed;z-index:2;border:1px solid #c8bfd1;background:#fff;color:#43374f;border-radius:8px;padding:3px 7px;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 8px #0003;cursor:pointer;font-size:12px}
 .cdt-chip.on{background:#49355c;color:white;border-color:#49355c}
 .cdt-rail{position:fixed;display:none;pointer-events:auto;z-index:3;background:rgba(255,255,255,.94);border:1px solid #d6cede;border-radius:13px;padding:5px;box-shadow:0 5px 16px #0002;backdrop-filter:blur(10px);align-items:center;gap:5px}
 .cdt-rail button{border:0;background:transparent;color:#392f45;border-radius:9px;padding:6px 8px;cursor:pointer;font-weight:700;font-size:12px;white-space:nowrap}
 .cdt-rail button:hover{background:#f1eaf6}
 .cdt-rail .cdt-apply{background:#49355c;color:#fff}
 .cdt-alert{position:fixed;max-width:min(330px,88vw);background:#322942;color:white;border-radius:12px;padding:10px 14px;box-shadow:0 6px 28px #0003;display:none;pointer-events:none;z-index:5;font-size:12px}
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
 </style><div class="cdt-rail"><button class="cdt-settings">⚙ 수신자</button><button class="cdt-apply">✓ 반영</button></div><div class="cdt-alert"></div><div id="chips"></div><div id="dropdown"></div><div class="cdt-shade"><div class="cdt-dialog"></div></div>`;
 document.documentElement.append(host);
 const rail=shadow.querySelector('.cdt-rail'), settingsButton=shadow.querySelector('.cdt-settings'), applyButton=shadow.querySelector('.cdt-apply'), alertBox=shadow.querySelector('.cdt-alert'), chips=shadow.querySelector('#chips'), menu=shadow.querySelector('#dropdown'),shade=shadow.querySelector('.cdt-shade'),dialog=shadow.querySelector('.cdt-dialog');
 const safeJSON=(v,fallback)=>{try{return JSON.parse(v)}catch{return fallback}};
 let db=safeJSON(localStorage.getItem(KEY),{});if(!db||typeof db!=='object')db={};
 let active=null,room='',selectedKeys=new Map(),lastText='',lastRoom='',timer=0,settingsOpen=false,menuOpen=false;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('[크랙 대사 수신자] 저장 실패',e)}};
 const getRoom=()=>location.pathname+location.search;
 const config=()=>{if(!db[room])db[room]={characters:[]};return db[room]};
 function getEditor(){
  const nodes=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"],.ProseMirror,[data-lexical-editor]')].filter(x=>{
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
  if(!e)return false;
  if(e.isContentEditable){
   e.focus();
   const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(e);
   selection.removeAllRanges();selection.addRange(range);
   let ok=false;
   try{ok=document.execCommand('insertText',false,value)}catch{}
   if(!ok || valueOf(e)!==value){
    // Fallback for custom editors that reject insertText. Try plain-text paste.
    try{e.focus();range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);ok=document.execCommand('insertHTML',false,escapeHTML(value).replace(/\n/g,'<br>'))}catch{}
   }
   if(valueOf(e)!==value){
    // Final fallback. Some editors will immediately normalize this on input.
    e.textContent=value;
   }
   e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }else{
   const p=Object.getPrototypeOf(e),desc=Object.getOwnPropertyDescriptor(p,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
   if(desc?.set)desc.set.call(e,value);else e.value=value;
   e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:value}));
   e.dispatchEvent(new Event('change',{bubbles:true}));e.focus();
  }
  return valueOf(e).replace(/\r\n/g,'\n')===value.replace(/\r\n/g,'\n');
 }
 const escapeHTML=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function notice(msg){alertBox.textContent=msg;alertBox.style.display='block';const r=active?.getBoundingClientRect();alertBox.style.left=Math.max(8,Math.min(innerWidth-340,(r?.right||innerWidth)-335))+'px';alertBox.style.top=Math.max(8,(r?.top||innerHeight-120)-45)+'px';clearTimeout(notice.t);notice.t=setTimeout(()=>alertBox.style.display='none',3600)}
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
 function renderChips(){
  chips.replaceChildren();if(!active||settingsOpen)return;
  const qs=findQuotes(valueOf(active));if(qs.length>40)return;
  const r=active.getBoundingClientRect();
  // Compact two-column overlay, anchored INSIDE the composer, not beside it.
  const top=r.top+43,step=27;
  const rows=Math.max(1,Math.floor((r.height-51)/step));
  const count=Math.min(qs.length,rows*2);
  qs.slice(0,count).forEach((q,i)=>{
   const val=selectedKeys.get(keyOf(q))||'';
   const b=document.createElement('button');b.className='cdt-chip'+(val?' on':'');
   b.textContent=`${i+1} · ${choiceLabel(val)}`;b.title=q.text;
   b.style.width='94px';b.style.maxWidth='94px';
   b.style.left=Math.max(8,Math.min(innerWidth-101,r.right-101-(i%2)*99))+'px';
   b.style.top=Math.max(8,Math.min(innerHeight-29,top+Math.floor(i/2)*step))+'px';
   b.onclick=ev=>{ev.stopPropagation();pick(q,b.getBoundingClientRect())};chips.append(b);
  });
  if(count<qs.length){const more=document.createElement('button');more.className='cdt-chip';more.textContent=`+${qs.length-count}개 대사`;more.title='입력창을 넓히면 더 많은 선택지가 보여요.';
   more.style.left=Math.max(8,r.right-102)+'px';more.style.top=Math.max(8,Math.min(innerHeight-29,r.bottom-29))+'px';
   more.onclick=()=>notice('입력창 높이를 늘리면 더 많은 대사의 수신자를 지정할 수 있어요.');chips.append(more)}
 }
 function update(){
  if(settingsOpen)return;
  const candidate=getEditor(),nextRoom=getRoom();
  if(nextRoom!==room){room=nextRoom;selectedKeys.clear();lastText='';hideMenu()}
  if(candidate!==active){active=candidate;selectedKeys.clear();lastText='';hideMenu()}
  if(!active){rail.style.display='none';chips.replaceChildren();return}
  const r=active.getBoundingClientRect();
  if(r.width<220||r.height<68){rail.style.display='none';chips.replaceChildren();return}
  rail.style.display='flex';
  rail.style.left=Math.max(8,Math.min(innerWidth-174,r.right-184))+'px';
  rail.style.top=Math.max(8,Math.min(innerHeight-43,r.top+5))+'px';
  const txt=valueOf(active);if(txt!==lastText){reconcile(lastText,txt);lastText=txt}
  renderChips();
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
  dialog.append(node('p','입력창 안 오른쪽의 ‘1 · 대상’ 버튼에서 지정해요. “이름−”는 그 인물을 제외한 현재 장면의 전원에게 하는 말이에요.','cdt-hint'));
  dialog.append(node('p','전송 전에 아래의 “수신자 반영”을 누르면, 선택한 대사에만 [A에게] 같은 짧은 표기가 실제 입력창에 삽입돼요. 지정하지 않은 대사는 그대로 유지됩니다.','cdt-hint'));
  dialog.append(action('선택한 수신자 반영',()=>{const ok=apply();if(ok)close()},true));
  function showSettingsList(){list.textContent='등록됨: '+(config().characters.flatMap(n=>[n,n+'−']).join(' · ')||'없음')}showSettingsList();
 }
 function apply(){
  if(!active){notice('입력창을 찾지 못했어요.');return false}
  const before=valueOf(active),after=transform(before);
  if(after===before){notice(selectedKeys.size?'이미 반영되었어요.':'먼저 대사 옆 번호 버튼에서 수신자를 선택해 주세요.');return false}
  // Don't clear choices until the actual editor content has updated.
  const ok=setValue(active,after);
  if(ok){selectedKeys.clear();lastText=after;renderChips();notice('✓ 입력창에 수신자를 반영했어요.');return true}
  notice('입력창 반영을 확인하지 못했어요. 복사해서 붙여넣을 수 있도록 설정을 열어 주세요.');
  showFallback(after);return false;
 }
 function showFallback(text){
   settingsOpen=true;shade.style.display='flex';dialog.replaceChildren();
   dialog.append(node('h2','수신자 문장 복사','cdt-title'),node('p','크랙 입력창에 자동 반영되지 않았어요. 아래 문장을 복사해서 붙여넣어 주세요.','cdt-hint'));
   const area=node('textarea');area.value=text;area.style.minHeight='180px';dialog.append(area);
   const actions=node('div',undefined,'cdt-row');
   actions.append(action('전체 복사',async()=>{try{await navigator.clipboard.writeText(area.value);notice('복사했어요.')}catch{area.select();document.execCommand('copy')}},true),action('닫기',close));dialog.append(actions);
 }

 settingsButton.addEventListener('click',openSettings);
 shade.addEventListener('pointerdown',e=>{if(e.target===shade)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsOpen)close()});
 document.addEventListener('pointerdown',e=>{if(!menuOpen)return;const path=e.composedPath?.()||[];if(!path.includes(menu)&&!path.includes(chips))hideMenu()},true);
 document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,60)},true);
 document.addEventListener('scroll',()=>{if(!settingsOpen)update()},true);
 window.addEventListener('resize',()=>{if(!settingsOpen)update()});
 applyButton.addEventListener('click',()=>{apply();if(!settingsOpen)update()});
 function tick(){if(!settingsOpen)update()}
 setInterval(tick,750);tick();
})();
