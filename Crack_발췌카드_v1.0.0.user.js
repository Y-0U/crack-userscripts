// ==UserScript==
// @name         크랙 발췌 카드 | 문장 발췌 & 검열 프리셋
// @namespace    https://crack.wrtn.ai/
// @version      1.0.0
// @description  크랙 문장 선택 → 발췌 카드 (1440x1440 PNG). 검열 프리셋, 기본/커스텀 배경, Pretendard/부크크 명조 Light, 웹폰트 지원.
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__crackExcerptCardV100) return;
  window.__crackExcerptCardV100 = true;

  const KEY = 'crack-excerpt-card-v1';
  const FONT_BOOKK = 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/BookkMyungjo-Lt.woff2';
  const FONT_PRETENDARD = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2';
  const DEFAULTS = { theme:'cream', align:'center', font:'pretendard', size:70, titleSize:30, spacing:24,
    presets:[{id:'general',name:'기본 검열',rules:[]}], activePreset:'none', customFonts:[] };
  const THEMES = {
    cream:{name:'크림',bg:'#F3EEE7',fg:'#302D2A',sub:'#81786D'},
    paper:{name:'종이',bg:'#F9F7F2',fg:'#36332D',sub:'#827F75'},
    night:{name:'밤',bg:'#242631',fg:'#F4F0E9',sub:'#C1B7B3'},
    lavender:{name:'라벤더',bg:'#E5DDEB',fg:'#3C3345',sub:'#81738B'},
    blue:{name:'안개',bg:'#DEE8EA',fg:'#29383C',sub:'#637D82'}
  };
  const clean = s => String(s ?? '').replace(/\u00a0/g,' ').trim();
  const clone = o => JSON.parse(JSON.stringify(o));
  function load() {
    try {
      const v=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(DEFAULTS),...v, presets:Array.isArray(v.presets)?v.presets:clone(DEFAULTS.presets),customFonts:Array.isArray(v.customFonts)?v.customFonts:[]};
    } catch {return clone(DEFAULTS);}
  }
  let settings=load();
  const persist=()=>{try {localStorage.setItem(KEY,JSON.stringify(settings));} catch(e) {status('설정 저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요.');}};
  let selected='', original='', currentTitle='', modalOpen=false, triggerTimer=0, rendering=0, bgImage=null, bgURL=null;
  const el=(tag,attrs={},text)=>{const n=document.createElement(tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v); if(text!==undefined)n.textContent=text; return n;};
  const host=el('div',{id:'crack-excerpt-card-root'}); host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483644';
  const root=host.attachShadow({mode:'open'});
  document.documentElement.append(host);
  const css=el('style');css.textContent=`
    :host{all:initial;color-scheme:light;font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif}
    *{box-sizing:border-box} button,input,select,textarea{font:inherit} button{cursor:pointer}
    .bubble{position:fixed;display:none;pointer-events:auto;z-index:4;border:0;border-radius:40px;padding:10px 17px;color:#fff;background:#302d3f;box-shadow:0 5px 22px #0004;font-size:14px;font-weight:700;white-space:nowrap}
    .backdrop{position:fixed;inset:0;display:none;pointer-events:auto;background:#0009;align-items:center;justify-content:center;padding:12px;z-index:3}
    .panel{background:#fff;color:#24222a;border-radius:19px;box-shadow:0 16px 60px #0005;width:min(910px,100%);max-height:min(92dvh,920px);display:flex;flex-direction:column;overflow:hidden;font-size:14px}
    .head{padding:14px 19px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ede9ee;flex-shrink:0}
    .head strong{font-size:17px}.head button{border:0;background:transparent;font-size:24px;line-height:1;padding:2px 8px}
    .main{display:grid;grid-template-columns:minmax(230px,1fr) minmax(275px,1fr);gap:18px;padding:18px;overflow:auto}
    .previewCol{min-width:0}.preview{display:block;width:100%;aspect-ratio:1;object-fit:contain;box-shadow:0 3px 14px #0002;border-radius:5px;background:#eee}
    .meta{font-size:12px;color:#655f70;margin:9px 0;overflow-wrap:anywhere}.status{font-size:12px;color:#a34040;min-height:1.4em;margin:7px 0}
    .settings{display:flex;flex-direction:column;gap:12px;min-width:0}
    .group{display:flex;flex-direction:column;gap:6px}.group>label{font-weight:700;font-size:13px}
    .row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.row>*{min-width:0}
    button.small,button.chip{padding:8px 11px;border:1px solid #d8d3dd;border-radius:9px;background:#fff;color:#292431;font-size:13px}
    button.chip.active{background:#312d41;color:white;border-color:#312d41}
    input[type=text],input[type=url],select,textarea{width:100%;padding:9px 10px;border:1px solid #d9d5dc;border-radius:9px;background:#fff;color:#24222a;min-height:38px;font-size:13px}
    textarea{resize:vertical;min-height:66px} input[type=range]{width:100%;accent-color:#5d4d75}
    .rule{display:grid;grid-template-columns:1fr 18px 1fr 30px;align-items:center;gap:5px;margin:4px 0}.rule span{text-align:center}
    .rule button{border:0;background:#f5eef0;border-radius:7px;height:31px}
    .footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #ede9ee;flex-shrink:0;flex-wrap:wrap}
    .primary{padding:11px 16px;background:#302d40;border:0;border-radius:10px;color:#fff;font-weight:700}.secondary{padding:11px 14px;background:#f3f1f4;border:0;border-radius:10px;color:#292431}
    .hint{font-size:11px;color:#797380;line-height:1.5}.subhead{font-size:13px;font-weight:700;border-top:1px solid #eee;padding-top:12px}
    @media(max-width:650px){.backdrop{padding:0;align-items:flex-end}.panel{border-radius:18px 18px 0 0;width:100%;max-height:95dvh}.main{display:flex;flex-direction:column;padding:13px;gap:10px}.previewCol{width:min(320px,88%);margin:0 auto}.settings{padding-bottom:8px}.head{padding:12px 15px}}
  `;root.append(css);
  const bubble=el('button',{type:'button',class:'bubble'},'✦ 발췌');root.append(bubble);
  const backdrop=el('div',{class:'backdrop'});root.append(backdrop);
  const panel=el('div',{class:'panel',role:'dialog','aria-label':'크랙 발췌 카드 편집기'});backdrop.append(panel);
  const head=el('div',{class:'head'});head.append(el('strong',{},'✦ 발췌 카드'),el('button',{type:'button','aria-label':'닫기'},'×'));panel.append(head);
  const main=el('div',{class:'main'});panel.append(main);
  const previewCol=el('div',{class:'previewCol'});main.append(previewCol);
  const canvas=el('canvas',{width:'1440',height:'1440',class:'preview'});previewCol.append(canvas);
  const info=el('div',{class:'meta'});previewCol.append(info);
  const stat=el('div',{class:'status','aria-live':'polite'});previewCol.append(stat);
  const settingsCol=el('div',{class:'settings'});main.append(settingsCol);
  const footer=el('div',{class:'footer'});panel.append(footer);
  const closeBtn=head.querySelector('button');
  const mark=(name)=>{const l=el('label',{},name);return l;};
  const group=(name)=>{const div=el('div',{class:'group'});if(name)div.append(mark(name));settingsCol.append(div);return div;};
  const row=(parent)=>{const x=el('div',{class:'row'});parent.append(x);return x;};
  const btn=(parent,label,fn,className='small')=>{const b=el('button',{type:'button',class:className},label);b.addEventListener('click',fn);parent.append(b);return b;};
  const titleLabel=el('div',{class:'meta'});previewCol.insertBefore(titleLabel,info);
  const quoteGroup=group('선택한 문장 (이미지에만 반영)');
  const quoteBox=el('textarea',{rows:'3','aria-label':'발췌 문장'});quoteGroup.append(quoteBox);
  quoteBox.addEventListener('input',scheduleRender);
  const presetGroup=group('검열 프리셋');const presetRow=row(presetGroup);
  const presetSelect=el('select',{'aria-label':'검열 프리셋'});presetSelect.style.flex='1';presetRow.append(presetSelect);
  btn(presetRow,'새 프리셋',()=>{
    const name=prompt('새 프리셋 이름을 입력해 주세요.');if(!name?.trim())return;
    const id='p'+Date.now();settings.presets.push({id,name:name.trim(),rules:[]});settings.activePreset=id;persist();refreshPresets();scheduleRender();
  });
  const presetActions=row(presetGroup);
  btn(presetActions,'이름 변경',()=>{
    const p=activePreset();if(!p)return;
    const next=prompt('프리셋 이름',p.name);if(!next?.trim())return;p.name=next.trim();persist();refreshPresets();
  });
  btn(presetActions,'프리셋 삭제',()=>{
    const p=activePreset();if(!p || !confirm(`'${p.name}' 프리셋을 삭제할까요?`))return;
    settings.presets=settings.presets.filter(x=>x.id!==p.id);settings.activePreset='none';persist();refreshPresets();scheduleRender();
  });
  presetSelect.addEventListener('change',()=>{settings.activePreset=presetSelect.value;persist();refreshRules();scheduleRender();});
  const ruleGroup=group('단어 치환 규칙');const ruleContainer=el('div');ruleGroup.append(ruleContainer);
  btn(ruleGroup,'+ 단어 치환 추가',()=>{const p=activePreset();if(!p){status('먼저 새 프리셋을 만들어 주세요.');return;}p.rules.push({from:'',to:''});persist();refreshRules();},'small');
  const themeGroup=group('기본 디자인');const themeRow=row(themeGroup);
  for(const [id,th] of Object.entries(THEMES))btn(themeRow,th.name,()=>{settings.theme=id;persist();updateChips();scheduleRender();},'chip').dataset.theme=id;
  const bgGroup=group('커스텀 배경 이미지 (선택)');const bgRow=row(bgGroup);
  const bgInput=el('input',{type:'file',accept:'image/*'});bgInput.style.cssText='max-width:210px;font-size:12px';bgRow.append(bgInput);
  btn(bgRow,'배경 삭제',async()=>{bgImage=null;await putBackground(null);bgInput.value='';scheduleRender();});
  bgInput.addEventListener('change',async()=>{const file=bgInput.files?.[0];if(!file)return;try{bgImage=await imageFromBlob(file);await putBackground(file);scheduleRender();}catch(e){status('이미지를 불러올 수 없어요: '+e.message);}});
  const alignGroup=group('정렬');const alignRow=row(alignGroup);
  btn(alignRow,'왼쪽 정렬',()=>{settings.align='left';persist();updateChips();scheduleRender();},'chip').dataset.align='left';
  btn(alignRow,'가운데 정렬',()=>{settings.align='center';persist();updateChips();scheduleRender();},'chip').dataset.align='center';
  const fontGroup=group('글꼴');const fontRow=row(fontGroup);
  const fontSelect=el('select',{'aria-label':'글꼴 선택'});fontSelect.style.flex='1';fontRow.append(fontSelect);
  fontSelect.addEventListener('change',()=>{settings.font=fontSelect.value;persist();scheduleRender();});
  const fadd=el('div',{class:'group'});fontGroup.append(fadd);
  const fname=el('input',{type:'text',placeholder:'추가 폰트 이름'});
  const furl=el('input',{type:'url',placeholder:'웹폰트 CSS 또는 .woff2/.woff 주소 (https://...)'});
  const ffamily=el('input',{type:'text',placeholder:'CSS 주소일 때 font-family 이름 (선택)'});
  fadd.append(fname,furl,ffamily);
  const fontBtns=row(fadd);
  btn(fontBtns,'+ 웹폰트 등록',()=>{
    const name=fname.value.trim(),url=furl.value.trim();
    if(!name||!/^https:\/\//i.test(url)){status('폰트 이름과 https:// 주소를 입력해 주세요.');return;}
    if(!(/\.(woff2?|ttf|otf)(\?|#|$)/i.test(url)||/\.css(\?|#|$)/i.test(url))){status('웹폰트 파일(.woff/.woff2/.ttf/.otf) 또는 CSS(.css) 주소를 입력해 주세요.');return;}
    const id='font'+Date.now();settings.customFonts.push({id,name,url,family:ffamily.value.trim()||name});settings.font=id;persist();refreshFonts();scheduleRender();fname.value='';furl.value='';ffamily.value='';
  });
  btn(fontBtns,'선택 폰트 삭제',()=>{if(!settings.font.startsWith('font'))return;settings.customFonts=settings.customFonts.filter(x=>x.id!==settings.font);settings.font='pretendard';persist();refreshFonts();scheduleRender();});
  fontGroup.append(el('div',{class:'hint'},'직접 폰트 파일 URL 또는 .css 주소를 등록할 수 있어요. CSS 방식은 해당 CSS에 정의된 font-family 이름을 입력하면 정확해요.'));
  const sizeGroup=group('본문 글자 크기');const sizeRow=row(sizeGroup);
  const fontSlider=el('input',{type:'range',min:'40',max:'100',step:'2'});fontSlider.style.flex='1';sizeRow.append(fontSlider);
  const sizeVal=el('span',{},String(settings.size));sizeRow.append(sizeVal);
  fontSlider.addEventListener('input',()=>{settings.size=Number(fontSlider.value);sizeVal.textContent=String(settings.size);persist();scheduleRender();});
  footer.append(el('div',{class:'hint'},'1440 × 1440 PNG · 발췌문은 원본 대화에 반영되지 않아요.'));
  const shareBtn=btn(footer,'공유',()=>shareCard(),'secondary');
  btn(footer,'PNG 저장',()=>downloadCard(),'primary');
  btn(footer,'닫기',close,'secondary');
  closeBtn.addEventListener('click',close);
  backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalOpen)close();});
  function status(s){stat.textContent=s;}
  function activePreset(){return settings.presets.find(p=>p.id===settings.activePreset);}
  function refreshPresets(){presetSelect.replaceChildren();presetSelect.append(el('option',{value:'none'},'검열 없음'));
    for(const p of settings.presets)presetSelect.append(el('option',{value:p.id},p.name));
    if(!settings.presets.some(x=>x.id===settings.activePreset))settings.activePreset='none';presetSelect.value=settings.activePreset;refreshRules();
  }
  function refreshRules(){ruleContainer.replaceChildren();const p=activePreset();
    if(!p){ruleContainer.append(el('div',{class:'hint'},'검열을 적용하려면 프리셋을 선택해 주세요.'));return;}
    if(!p.rules.length)ruleContainer.append(el('div',{class:'hint'},'아직 치환 규칙이 없어요.'));
    p.rules.forEach((rule,index)=>{
      const div=el('div',{class:'rule'}),from=el('input',{type:'text',placeholder:'원래 단어'}),arrow=el('span',{},'→'),to=el('input',{type:'text',placeholder:'바꿀 단어'});
      from.value=rule.from;to.value=rule.to;
      from.addEventListener('input',()=>{rule.from=from.value;persist();scheduleRender();});
      to.addEventListener('input',()=>{rule.to=to.value;persist();scheduleRender();});
      const del=el('button',{type:'button','aria-label':'치환 삭제'},'×');del.addEventListener('click',()=>{p.rules.splice(index,1);persist();refreshRules();scheduleRender();});
      div.append(from,arrow,to,del);ruleContainer.append(div);
    });
  }
  function refreshFonts(){fontSelect.replaceChildren();fontSelect.append(el('option',{value:'pretendard'},'Pretendard (고딕)'),el('option',{value:'bookk'},'부크크 명조 Light'));
    for(const f of settings.customFonts)fontSelect.append(el('option',{value:f.id},f.name));
    if(![...fontSelect.options].some(x=>x.value===settings.font))settings.font='pretendard';fontSelect.value=settings.font;
  }
  function updateChips(){root.querySelectorAll('button[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===settings.theme));root.querySelectorAll('button[data-align]').forEach(b=>b.classList.toggle('active',b.dataset.align===settings.align));}
  function getQuote(){let s=quoteBox.value;const p=activePreset();if(p)for(const r of p.rules){if(r.from)s=s.split(r.from).join(r.to||'');}
    const chars=Array.from(s);return {text:chars.length>140?chars.slice(0,139).join('')+'⋯':s,length:chars.length,truncated:chars.length>140};
  }
  function getTitle(){
    const meta=document.querySelector('meta[property="og:title"]')?.content;
    const candidates=[
      ...document.querySelectorAll('[data-testid*="title" i], [class*="roomTitle"], [class*="chatTitle"], [class*="characterTitle"], header h1, header h2, main h1, main h2')
    ].filter(n=>!host.contains(n)&&n.getBoundingClientRect().width>0).map(n=>clean(n.textContent)).filter(t=>t.length>1&&t.length<85);
    let raw=candidates[0]||clean(meta)||clean(document.title)||'크랙 작품';
    raw=raw.replace(/\s*[-|｜]\s*(크랙|Crack|뤼튼|Wrtn)\s*$/i,'').trim();
    if(/^(크랙|Crack|뤼튼|Wrtn)$/i.test(raw))raw='작품명 확인 필요';
    return raw.slice(0,90);
  }
  function bubbleHide(){bubble.style.display='none';}
  function selectionText(){const s=window.getSelection();if(!s||s.isCollapsed||!s.rangeCount)return null;
    const a=s.anchorNode?.parentElement,f=s.focusNode?.parentElement;
    if((a&&host.contains(a))||(f&&host.contains(f)))return null;
    const text=clean(s.toString());if(!text)return null;
    const node=s.getRangeAt(0).commonAncestorContainer;const parent=node.nodeType===1?node:node.parentElement;
    if(parent?.closest('input,textarea,[contenteditable="true"],script,style'))return null;
    return {text,rect:s.getRangeAt(0).getBoundingClientRect()};
  }
  function showBubble(){if(modalOpen)return;const hit=selectionText();if(!hit){bubbleHide();return;}
    selected=hit.text;const rect=hit.rect;
    const top=Math.max(10,Math.min(window.innerHeight-58,rect.top-47));
    const left=Math.max(8,Math.min(window.innerWidth-100,rect.left+rect.width/2-43));
    bubble.style.top=top+'px';bubble.style.left=left+'px';bubble.style.display='block';
  }
  document.addEventListener('selectionchange',()=>{if(modalOpen)return;clearTimeout(triggerTimer);triggerTimer=setTimeout(showBubble,280);});
  document.addEventListener('pointerup',e=>{if(host.contains(e.target))return;clearTimeout(triggerTimer);triggerTimer=setTimeout(showBubble,90);},true);
  document.addEventListener('keyup',e=>{if(e.key==='Shift'||e.key.startsWith('Arrow'))setTimeout(showBubble,50);});
  document.addEventListener('scroll',()=>{if(!modalOpen)bubbleHide();},true);
  // Safari touch selection handles may not emit pointerup after final adjustment.
  document.addEventListener('touchend',()=>{if(!modalOpen)setTimeout(showBubble,430);},{passive:true});
  bubble.addEventListener('pointerdown',e=>e.preventDefault());
  bubble.addEventListener('click',()=>open());
  function close(){modalOpen=false;backdrop.style.display='none';bubbleHide();document.documentElement.style.removeProperty('overflow');}
  async function open(){if(!selected){const hit=selectionText();selected=hit?.text||'';}if(!selected)return;
    original=selected;currentTitle=getTitle();quoteBox.value=original;titleLabel.textContent='작품명: '+currentTitle;
    modalOpen=true;backdrop.style.display='flex';bubbleHide();document.documentElement.style.overflow='hidden';
    refreshPresets();refreshFonts();updateChips();fontSlider.value=String(settings.size);sizeVal.textContent=String(settings.size);
    bgImage=await getBackground();await render();
  }
  function loadFontFace(name,url,weight='400'){
    if(!/^https:\/\//i.test(url))return Promise.reject(new Error('HTTPS 폰트 주소만 허용돼요.'));
    if(!window.FontFace)return Promise.reject(new Error('이 브라우저는 웹폰트 로딩을 지원하지 않아요.'));
    const ff=new FontFace(name,`url("${url.replace(/"/g,'%22')}")`,{weight});
    return ff.load().then(x=>{document.fonts.add(x);return name;});
  }
  const fontCache=new Map();
  async function ensureFont(){const found=settings.customFonts.find(f=>f.id===settings.font);
    let key=settings.font,family='PretendardExcerpt',promise;
    if(settings.font==='bookk'){family='BookkExcerptLight';promise=()=>loadFontFace(family,FONT_BOOKK,'400');}
    else if(settings.font==='pretendard'){family='PretendardExcerpt';promise=()=>loadFontFace(family,FONT_PRETENDARD,'400');}
    else if(found){family=found.family;
      promise=()=>{if(/\.css(\?|#|$)/i.test(found.url)){
        if(!document.querySelector(`link[data-excerpt-font="${found.id}"]`)){
          const link=el('link',{rel:'stylesheet',href:found.url,'data-excerpt-font':found.id});document.head.append(link);
        }
        return document.fonts.load(`400 60px "${family.replace(/"/g,'')}"`,'가나다').then(()=>family);
      }
      family='UserExcerpt'+found.id;return loadFontFace(family,found.url,'400');};
    }else return 'sans-serif';
    if(!fontCache.has(key))fontCache.set(key,promise().catch(e=>{fontCache.delete(key);throw e;}));
    await fontCache.get(key);return family;
  }
  function wrap(ctx,text,maxWidth){const lines=[];
    for(const paragraph of text.split(/\r?\n/)){
      if(!paragraph){lines.push('');continue;}
      let line='';for(const ch of Array.from(paragraph)){
        if(line&&ctx.measureText(line+ch).width>maxWidth){lines.push(line.trimEnd());line=ch===' '?'':ch;}else line+=ch;
      }lines.push(line);
    }
    return lines.length?lines:[''];
  }
  function cover(ctx,img){const scale=Math.max(1440/img.width,1440/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(1440-w)/2,(1440-h)/2,w,h);}
  async function render(){if(!modalOpen)return;const seq=++rendering,statusBefore=stat.textContent;stat.textContent='';
    const {text,length,truncated}=getQuote();
    info.textContent=`${length}자 / 140자${truncated?' · 140자 이후는 ⋯로 처리':''} · 저장 크기 1440 × 1440px`;
    const theme=THEMES[settings.theme]||THEMES.cream;
    let family;try{family=await ensureFont();}catch(e){family=settings.font==='bookk'?'serif':'sans-serif';status('웹폰트를 불러오지 못했어요. 연결 상태나 폰트 URL을 확인해 주세요.');}
    if(seq!==rendering||!modalOpen)return;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,1440,1440);ctx.fillStyle=theme.bg;ctx.fillRect(0,0,1440,1440);
    if(bgImage){cover(ctx,bgImage);ctx.fillStyle=theme.fg==='#F4F0E9'?'rgba(0,0,0,.28)':'rgba(255,255,255,.18)';ctx.fillRect(0,0,1440,1440);}
    let size=settings.size,lines=[];const maxWidth=1120;
    do{ctx.font=`400 ${size}px "${family}"`;lines=wrap(ctx,text,maxWidth);if(lines.length*size*1.62+settings.titleSize*2+100<=1010)break;size-=2;}while(size>=30);
    ctx.font=`400 ${Math.max(30,size)}px "${family}"`;
    const lineHeight=Math.max(30,size)*1.62;const titleGap=100;const titleFont=settings.titleSize;
    const bodyHeight=lines.length*lineHeight;const totalHeight=bodyHeight+titleGap+titleFont*1.4;
    let y=(1440-totalHeight)/2+lineHeight*.78;
    const x=settings.align==='center'?720:160;
    ctx.textAlign=settings.align==='center'?'center':'left';ctx.textBaseline='alphabetic';ctx.fillStyle=theme.fg;
    for(const line of lines){ctx.fillText(line,x,y);y+=lineHeight;}
    ctx.fillStyle=theme.sub;ctx.font=`400 ${titleFont}px "${family}"`;ctx.fillText(currentTitle,x,y+titleGap-lineHeight*.2);
  }
  let renderTimer=0;
  function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,140);}
  function filename(){const s=(currentTitle||'발췌').replace(/[\\/:*?"<>|]/g,'_').slice(0,50);return `${s}_발췌_${Date.now()}.png`;}
  function toBlob(){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지 변환 실패')),'image/png'));}
  async function downloadCard(){try{await render();const blob=await toBlob();const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:filename()});a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('저장을 요청했어요. iPhone에서 다운로드가 안 보이면 공유 버튼도 이용해 보세요.');}catch(e){status('저장 실패: '+e.message);}}
  async function shareCard(){try{await render();const blob=await toBlob(),file=new File([blob],filename(),{type:'image/png'});
    if(!navigator.share||!navigator.canShare?.({files:[file]})){status('이 브라우저는 이미지 공유를 지원하지 않아요. PNG 저장을 눌러 주세요.');return;}
    await navigator.share({files:[file],title:currentTitle});
  }catch(e){if(e.name!=='AbortError')status('공유 실패: '+e.message);}}
  function imageFromBlob(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('지원하지 않는 이미지 형식'))};img.src=url;});}
  // Keep large background images out of localStorage; use IndexedDB instead.
  function backgroundDB(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('IndexedDB unavailable'));
    const request=indexedDB.open('crack-excerpt-card-backgrounds',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('assets');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });}
  async function putBackground(blob){try{const db=await backgroundDB();await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(blob,'background');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(e){if(blob)status('배경은 현재 사용할 수 있지만 다음 접속 때 저장되지 않을 수 있어요.');}}
  async function getBackground(){try{const db=await backgroundDB();const blob=await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readonly');const req=tx.objectStore('assets').get('background');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return blob?await imageFromBlob(blob):null;}catch{return null;}}
  refreshPresets();refreshFonts();updateChips();
})();
