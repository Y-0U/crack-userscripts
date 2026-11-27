// ==UserScript==
// @name         크랙 메시지 마크다운 원문 복사 (PC·모바일)
// @namespace    https://crack.wrtn.ai/userscripts/original-raw-copy
// @version      1.2.0
// @description  내가 보낸 메시지의 '분기 / 수정 / 삭제' 메뉴에 '복사'를 추가하고, 마크다운 원문을 복사합니다.
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-idle
// @inject-into  content
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setClipboard
// @grant        GM.setClipboard
// @connect      crack-api.wrtn.ai
// @connect      contents-api.wrtn.ai
// ==/UserScript==

(() => {
  'use strict';
  const INSTANCE_KEY = '__crackOriginalMessageCopy_v120';
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = true;

  const GROUP_SELECTOR = '[data-message-group-id], [data-message-id]';
  const MENU_SELECTOR = '[role="menu"]';
  const TRIGGER_SELECTOR = '[aria-haspopup="menu"],[data-state][aria-controls],button[aria-label*="옵션"],button[title*="옵션"]';
  const gmModern = typeof GM !== 'undefined' && GM ? GM : null;
  const gmRequestAPI = typeof GM_xmlhttpRequest === 'function'
    ? GM_xmlhttpRequest
    : typeof gmModern?.xmlHttpRequest === 'function' ? gmModern.xmlHttpRequest.bind(gmModern) : null;
  const gmClipboardAPI = typeof GM_setClipboard === 'function'
    ? GM_setClipboard
    : typeof gmModern?.setClipboard === 'function' ? gmModern.setClipboard.bind(gmModern) : null;
  const OWN_ITEM_ID = 'data-cmc-original-copy';
  let lastOrigin = null;
  let queued = false;
  let toastTimer = 0;
  let copyPending = false;
  // 원문을 미리 조회하면 메뉴를 누르는 즉시 클립보드 쓰기를 시작할 수 있어
  // iOS Safari에서 사용자 제스처 제한에 걸릴 가능성을 낮춘다.
  const prefetched = new Map();
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const cacheKey = origin => `${origin.chatId}/${origin.messageId}`;
  function prefetchOriginal(origin) {
    if (!origin || chatIdFromUrl() !== origin.chatId) return null;
    const key = cacheKey(origin);
    const cached = prefetched.get(key);
    if (cached && Date.now() - cached.at < 90000) return cached.promise;
    const promise = fetchOriginal(origin.chatId, origin.messageId);
    prefetched.set(key, { at: Date.now(), promise });
    if (prefetched.size > 16) prefetched.delete(prefetched.keys().next().value);
    promise.catch(() => { if (prefetched.get(key)?.promise === promise) prefetched.delete(key); });
    return promise;
  }

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeId = value => typeof value === 'string' && value.length > 0 && value.length < 220 && value !== 'temp';

  function chatIdFromUrl() {
    const path = location.pathname;
    const patterns = [
      /^\/stories\/[^/]+\/episodes\/([^/?#]+)/,
      /^\/characters\/[^/]+\/chats\/([^/?#]+)/,
      /^\/u\/[^/]+\/c\/([^/?#]+)/,
    ];
    for (const re of patterns) {
      const m = path.match(re);
      if (m) return decodeURIComponent(m[1]);
    }
    return '';
  }

  function findGroup(node) {
    if (!(node instanceof Element)) return null;
    return node.closest(GROUP_SELECTOR);
  }

  function makeOrigin(group, trigger = null) {
    const chatId = chatIdFromUrl();
    const messageId = group?.getAttribute('data-message-group-id') || group?.getAttribute('data-message-id') || '';
    if (!safeId(chatId) || !safeId(messageId)) return null;
    return { chatId, messageId, triggerId: trigger?.id || '', group, href: location.href, at: Date.now() };
  }

  function findContextFromMenu(menu) {
    const labelId = menu.getAttribute('aria-labelledby') || '';
    if (labelId) {
      const trigger = document.getElementById(labelId);
      const group = findGroup(trigger);
      if (group) {
        const fromTrigger = makeOrigin(group, trigger);
        if (fromTrigger) return fromTrigger;
      }
    }
    if (lastOrigin && Date.now() - lastOrigin.at < 12000 && lastOrigin.href === location.href) {
      // iOS Safari의 Radix 메뉴는 aria-labelledby와 실제 터치 지점의
      // 버튼 ID가 다르거나 존재하지 않을 수 있다. 현재 열린 메뉴가
      // 사용자의 '수정/삭제' 메뉴인지 검사한 뒤에만 최근 메시지를 사용한다.
      if (!labelId || !lastOrigin.triggerId || labelId === lastOrigin.triggerId ||
          isMyMessageMenu(menu)) return lastOrigin;
    }
    return null;
  }

  function visible(node) {
    if (!node?.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getAttribute('data-state') !== 'closed';
  }

  function menuItems(menu) {
    return [...menu.querySelectorAll('[role="menuitem"],button')].filter(el => !el.hasAttribute(OWN_ITEM_ID));
  }

  function isMyMessageMenu(menu) {
    const labels = menuItems(menu).map(el => clean(el.textContent));
    // 수정과 삭제가 모두 있는 사용자 메시지 메뉴에만 붙임.
    return labels.includes('수정') && labels.includes('삭제') && (labels.includes('분기') || labels.length < 8);
  }

  function addCopyMenuItem(menu, origin) {
    if (!isMyMessageMenu(menu)) return;
    const prev = menu.querySelector(`[${OWN_ITEM_ID}]`);
    if (prev) {
      prev.__cmcOrigin = origin;
      prefetchOriginal(origin);
      return;
    }
    const items = menuItems(menu);
    const edit = items.find(el => clean(el.textContent) === '수정');
    const del = items.find(el => clean(el.textContent) === '삭제');
    const template = edit || del;
    if (!template) return;

    // 기존 크랙 메뉴와 동일한 행 스타일을 활용하되, 기존 버튼의 동작은 복제하지 않음.
    const row = document.createElement('div');
    row.setAttribute(OWN_ITEM_ID, '1');
    row.setAttribute('role', 'menuitem');
    row.setAttribute('tabindex', '-1');
    row.setAttribute('aria-label', '마크다운 원문 복사');
    row.className = template.className || '';
    row.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;min-height:36px;padding:6px 12px;user-select:none;-webkit-user-select:none;';
    row.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>복사</span>`;
    row.__cmcOrigin = origin;
    prefetchOriginal(origin);

    row.addEventListener('pointerdown', event => { event.stopPropagation(); }, true);
    row.addEventListener('mousedown', event => { event.stopPropagation(); }, true);
    row.addEventListener('touchstart', event => { event.stopPropagation(); }, {passive:true, capture:true});
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        row.click();
      }
    });
    row.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target = row.__cmcOrigin;
      if (!target || copyPending) return;
      copyPending = true;
      row.style.opacity = '.55';
      try {
        if (chatIdFromUrl() !== target.chatId) throw new Error('채팅방이 변경되었어요. 다시 시도해 주세요.');
        const cached = prefetched.get(cacheKey(target));
        const original = await (cached?.promise || prefetchOriginal(target));
        if (!original) throw new Error('원문이 비어 있어요.');
        try {
          // iOS에서는 성공 여부를 확정할 수 없는 GM_setClipboard를 사용하지 않는다.
          // 페이지의 표준 Clipboard API를 사용하고 읽기 확인이 불가능하면
          // '복사 완료'라고 말하지 않고 직접 복사 창을 제공한다.
          const result = await putOnClipboard(original);
          if (result === 'verified') {
            showToast('마크다운 원문 복사를 확인했어요 ✓');
          } else if (result === 'unverified') {
            showManualCopy(original, '자동 복사를 요청했지만 클립보드 반영 여부를 확인할 수 없어요. 붙여넣기가 안 된다면 아래 「전체 선택」으로 복사해 주세요.');
            showToast('클립보드 확인이 제한되어 직접 복사 창도 열었어요.');
          } else {
            showToast('마크다운 원문을 복사했어요 ✓');
          }
        } catch (error) {
          showManualCopy(original);
          showToast('자동 복사가 제한되어 직접 복사 창을 열었어요.');
        }
      } catch (error) {
        console.warn('[크랙 마크다운 복사]', error);
        showToast('복사 실패: ' + (error?.message || String(error)), true);
      } finally {
        copyPending = false;
        row.style.opacity = '';
      }
    }, true);

    if (del && del.parentElement) del.before(row);
    else if (edit) edit.after(row);
    else menu.append(row);
  }

  function scanMenus() {
    for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
      if (!visible(menu) || !isMyMessageMenu(menu)) continue;
      const origin = findContextFromMenu(menu);
      if (!origin) continue;
      addCopyMenuItem(menu, origin);
    }
  }

  function scheduleScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scanMenus(); });
  }

  function captureOrigin(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target instanceof Element ? event.target :
      path.find(node => node instanceof Element) || null;
    if (!target || target.closest(`[${OWN_ITEM_ID}]`)) return;
    // Safari의 합성 이벤트/Shadow DOM에서도 실제 메시지 그룹을 추적한다.
    const group = findGroup(target) || path.map(findGroup).find(Boolean);
    if (!group) return;
    const trigger = target.closest(TRIGGER_SELECTOR) ||
      path.find(node => node instanceof Element && node.matches(TRIGGER_SELECTOR)) || null;
    // 메뉴 버튼을 누르거나 모바일에서 메시지를 꾹 누르는 경우 모두 추적.
    const origin = makeOrigin(group, trigger);
    if (origin) {
      lastOrigin = origin;
      if (trigger) setTimeout(scheduleScan, 20);
    }
  }

  document.addEventListener('pointerdown', captureOrigin, true);
  document.addEventListener('touchstart', captureOrigin, {capture:true, passive:true});
  document.addEventListener('contextmenu', captureOrigin, true);
  document.addEventListener('click', event => {
    captureOrigin(event);
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(TRIGGER_SELECTOR)) setTimeout(scheduleScan, 20);
  }, true);

  const observer = new MutationObserver(mutations => {
    if (!lastOrigin || Date.now() - lastOrigin.at > 12000) return;
    // 메뉴가 포털로 나타나거나 React가 내용을 새로 그렸을 때 다시 주입.
    if (mutations.some(m => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) scheduleScan();
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});
  scheduleScan();

  function getCookie(name) {
    try {
      const prefix = `${name}=`;
      return document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix))?.slice(prefix.length) || '';
    } catch { return ''; }
  }

  function gmRequest(url, headers) {
    return new Promise((resolve, reject) => {
      if (!gmRequestAPI) {
        reject(new Error('Userscripts의 GM 네트워크 기능을 사용할 수 없어요.'));
        return;
      }
      let finished = false;
      const done = (error, response) => {
        if (finished) return;
        finished = true;
        if (error) { reject(error); return; }
        if (!response || !(response.status >= 200 && response.status < 300)) {
          reject(new Error(`API ${response?.status || '연결 실패'}`)); return;
        }
        try {
          const raw = typeof response.responseText === 'string' ? response.responseText
            : typeof response.response === 'string' ? response.response
            : response.response && typeof response.response === 'object' ? null : '';
          resolve(raw === null ? response.response : JSON.parse(raw));
        } catch {
          reject(new Error('원문 응답을 해석할 수 없어요.'));
        }
      };
      const options = {
        method:'GET', url, headers, timeout:12000,
        onload: response => done(null, response),
        onerror: () => done(new Error('API 연결 실패')),
        ontimeout: () => done(new Error('API 응답 시간 초과')),
        onabort: () => done(new Error('API 요청 취소')),
      };
      try {
        const handle = gmRequestAPI(options);
        // iOS Userscripts의 GM.xmlHttpRequest는 Promise를 반환할 수 있음.
        if (handle && typeof handle.then === 'function') {
          Promise.resolve(handle).then(response => done(null, response), error => done(error));
        }
      } catch (error) { done(error); }
    });
  }

  async function requestJson(url) {
    const token = getCookie('access_token');
    const headers = {Accept:'application/json',platform:'web','wrtn-locale':'ko-KR'};
    if (token) {
      try { headers.Authorization = 'Bearer ' + decodeURIComponent(token); }
      catch { headers.Authorization = 'Bearer ' + token; }
    }
    // Safari에서는 기본 GM 요청이 제공되지 않는 설치도 있어서
    // 로그인된 페이지의 fetch를 먼저 사용하고 GM을 대체 경로로 사용한다.
    // PC에서는 기존 GM 경로도 그대로 지원한다.
    let firstError = null;
    try {
      const response = await fetch(url, {method:'GET',headers,credentials:'include',mode:'cors'});
      if (!response.ok) throw new Error(`API ${response.status}`);
      return await response.json();
    } catch (error) { firstError = error; }
    if (!gmRequestAPI) throw firstError;
    try { return await gmRequest(url, headers); }
    catch (error) { throw new Error(`${error.message} (페이지 연결: ${firstError?.message || '실패'})`); }
  }

  function unwrapMessage(result) {
    // 응답이 {data:{message:{content}}}, {data:{content}}, {message:{content}} 등일 수 있음.
    const variants = [result?.data?.message, result?.data?.data?.message, result?.message, result?.data, result];
    return variants.find(v => v && typeof v === 'object' && (typeof v.content === 'string' || typeof v.message === 'string')) || null;
  }

  function readContent(message, requestedId) {
    if (!message) return null;
    const returnedId = message._id || message.id || message.messageId || '';
    if (returnedId && String(returnedId) !== requestedId) return null;
    const role = String(message.role || message.speaker || '').toLowerCase();
    if (role && !['user','human','member','usermessage'].includes(role)) return null;
    if (typeof message.content === 'string') return message.content;
    if (typeof message.message === 'string') return message.message;
    return null;
  }

  async function fetchOriginal(chatId, messageId) {
    const ch = encodeURIComponent(chatId), msg = encodeURIComponent(messageId);
    const urls = [
      `https://crack-api.wrtn.ai/crack-gen/v3/chats/${ch}/messages/${msg}`,
      `https://crack-api.wrtn.ai/crack-gen/character-chats/${ch}/messages/${msg}`,
      `https://contents-api.wrtn.ai/character-chat/v3/chats/${ch}/messages/${msg}`,
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        const raw = unwrapMessage(await requestJson(url));
        const text = readContent(raw, messageId);
        if (typeof text === 'string') return text;
      } catch (error) { lastError = error; }
    }
    // 일부 서버 버전에서는 단일 메시지 엔드포인트가 없어서 최근 메시지 목록으로 보완.
    try {
      const result = await requestJson(`https://crack-api.wrtn.ai/crack-gen/v3/chats/${ch}/messages?limit=100`);
      const list = result?.data?.messages || result?.messages || [];
      const found = Array.isArray(list) ? list.find(m => String(m._id || m.id || m.messageId) === messageId) : null;
      const text = readContent(found, messageId);
      if (typeof text === 'string') return text;
    } catch (error) { lastError = error; }
    throw new Error(lastError ? '원문 API 조회에 실패했어요. 크랙 로그인 상태를 확인해 주세요.' : '이 메시지의 원문을 찾지 못했어요.');
  }

  async function putOnClipboard(text) {
    if (isIOS) {
      if (!navigator.clipboard?.writeText) throw new Error('Safari 클립보드 API 없음');
      await navigator.clipboard.writeText(text);
      // 읽기 권한은 쓰기 권한과 별개이므로 readText 실패는 예상 가능한 상황.
      if (navigator.clipboard?.readText) {
        try {
          const pasted = await navigator.clipboard.readText();
          if (pasted === text) return 'verified';
          throw new Error('클립보드에 원문이 반영되지 않았어요.');
        } catch (error) {
          if (error?.message?.includes('반영되지')) throw error;
          return 'unverified';
        }
      }
      return 'unverified';
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return 'written';
      } catch (_) { /* PC에서 GM 경로 재시도 */ }
    }
    if (gmClipboardAPI) {
      await Promise.resolve(gmClipboardAPI(text, 'text'));
      return 'written';
    }
    throw new Error('클립보드 쓰기 API 없음');
  }

  function showToast(message, isError = false) {
    document.getElementById('cmc-toast')?.remove();
    const toast = document.createElement('div');
    toast.id='cmc-toast';
    toast.textContent=message;
    toast.style.cssText=`position:fixed;bottom:max(70px,calc(env(safe-area-inset-bottom) + 70px));left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(90vw,420px);border-radius:14px;padding:12px 16px;background:${isError?'#6d3030':'#2d3039'};color:#fff;font:600 13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 5px 22px #0003;text-align:center;white-space:pre-wrap;pointer-events:none;`;
    document.documentElement.append(toast);
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.remove(),isError?4500:2200);
  }

  function showManualCopy(text, explanation = '자동 복사가 제한되어 있어요. 아래 원문을 길게 누르거나 선택해서 복사해 주세요.') {
    document.getElementById('cmc-manual-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'cmc-manual-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    const pane = document.createElement('section');
    pane.style.cssText = 'width:min(530px,100%);max-height:85vh;background:#fff;color:#24252b;border-radius:17px;padding:18px;box-shadow:0 12px 50px #0004;display:flex;flex-direction:column;gap:12px;font:14px/1.5 system-ui,-apple-system,sans-serif;box-sizing:border-box;';
    const heading = document.createElement('strong');
    heading.textContent = '마크다운 원문 복사';
    const help = document.createElement('div');
    help.textContent = explanation;
    const field = document.createElement('textarea');
    field.readOnly = true;
    field.value = text;
    field.style.cssText = 'min-height:200px;max-height:50vh;width:100%;resize:vertical;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;padding:11px;font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap;color:#222;background:#fbfbfc;';
    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;';
    const selectBtn=document.createElement('button');
    selectBtn.textContent='전체 선택';
    const copyBtn=document.createElement('button');
    copyBtn.textContent='다시 복사';
    const closeBtn=document.createElement('button');
    closeBtn.textContent='닫기';
    for (const button of [selectBtn,copyBtn,closeBtn]) button.style.cssText='border:1px solid #ddd;border-radius:8px;background:#f8f7f9;color:#222;font:600 13px system-ui;padding:10px;cursor:pointer;';
    selectBtn.onclick=()=>{field.focus();field.select();};
    copyBtn.onclick=async()=>{
      try {
        const result=await putOnClipboard(text);
        if(result==='verified'||result==='written'){
          showToast('마크다운 원문 복사 완료 ✓');backdrop.remove();return;
        }
      }catch(_){ /* 사용자 선택으로 이동 */ }
      field.focus();field.select();field.setSelectionRange(0,field.value.length);
      // execCommand는 보조 경로지만 성공 반환값만으로 신뢰할 수 없어
      // iOS에서는 반드시 수동 복사 상태를 유지한다.
      if(!isIOS) {
        try {if(document.execCommand('copy')){showToast('원문을 복사했어요 ✓');backdrop.remove();return;}}catch(_){}
      }
      showToast('원문을 전체 선택했어요. iPhone 복사 메뉴를 눌러 주세요.');
    };
    closeBtn.onclick=()=>backdrop.remove();
    actions.append(selectBtn,copyBtn,closeBtn);pane.append(heading,help,field,actions);backdrop.append(pane);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)backdrop.remove();});
    document.documentElement.append(backdrop);
  }
})();
