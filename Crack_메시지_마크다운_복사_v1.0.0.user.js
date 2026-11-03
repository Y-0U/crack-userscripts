// ==UserScript==
// @name         크랙 메시지 마크다운 원문 복사
// @namespace    https://crack.wrtn.ai/userscripts/original-raw-copy
// @version      1.0.0
// @description  내가 보낸 메시지의 '분기 / 수정 / 삭제' 메뉴에 '복사'를 추가하고, 마크다운 원문을 복사합니다.
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      crack-api.wrtn.ai
// @connect      contents-api.wrtn.ai
// ==/UserScript==

(() => {
  'use strict';
  const INSTANCE_KEY = '__crackOriginalMessageCopy_v100';
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = true;

  const GROUP_SELECTOR = '[data-message-group-id], [data-message-id]';
  const MENU_SELECTOR = '[role="menu"]';
  const TRIGGER_SELECTOR = '[aria-haspopup="menu"],button[aria-label="메시지 옵션"],button[title="메시지 옵션"]';
  const OWN_ITEM_ID = 'data-cmc-original-copy';
  let lastOrigin = null;
  let queued = false;
  let toastTimer = 0;
  let copyPending = false;

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
      if (!labelId || !lastOrigin.triggerId || labelId === lastOrigin.triggerId) return lastOrigin;
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

    row.addEventListener('pointerdown', event => { event.stopPropagation(); }, true);
    row.addEventListener('mousedown', event => { event.stopPropagation(); }, true);
    row.addEventListener('touchstart', event => { event.stopPropagation(); }, {passive:true, capture:true});
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
        const original = await fetchOriginal(target.chatId, target.messageId);
        if (!original) throw new Error('원문이 비어 있어요.');
        try {
          await putOnClipboard(original);
          showToast('마크다운 원문을 복사했어요 ✓');
        } catch (error) {
          showManualCopy(original);
          showToast('복사 권한이 없어 직접 복사 창을 열었어요.');
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
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const group = findGroup(target);
    if (!group) return;
    const trigger = target.closest(TRIGGER_SELECTOR);
    // 메뉴 버튼을 누르거나 모바일에서 메시지를 꾹 누르는 경우 모두 추적.
    const origin = makeOrigin(group, trigger);
    if (origin) {
      lastOrigin = origin;
      if (trigger) setTimeout(scheduleScan, 20);
    }
  }

  document.addEventListener('pointerdown', captureOrigin, true);
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
      const options = {
        method:'GET', url, headers, timeout:12000, withCredentials:true,
        onload: response => {
          if (response.status < 200 || response.status >= 300) return reject(new Error(`API ${response.status}`));
          try { resolve(JSON.parse(response.responseText)); }
          catch { reject(new Error('원문 응답을 해석할 수 없어요.')); }
        },
        onerror: () => reject(new Error('API 연결 실패')),
        ontimeout: () => reject(new Error('API 응답 시간 초과')),
      };
      try {
        if (typeof GM_xmlhttpRequest === 'function') return void GM_xmlhttpRequest(options);
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') return void GM.xmlHttpRequest(options);
        reject(new Error('확장 프로그램 API를 사용할 수 없어요.'));
      } catch (error) { reject(error); }
    });
  }

  async function requestJson(url) {
    const token = getCookie('access_token');
    const headers = {Accept:'application/json',platform:'web','wrtn-locale':'ko-KR'};
    if (token) {
      try { headers.Authorization = 'Bearer ' + decodeURIComponent(token); }
      catch { headers.Authorization = 'Bearer ' + token; }
    }
    try { return await gmRequest(url, headers); }
    catch (firstError) {
      try {
        const response = await fetch(url, {method:'GET',headers,credentials:'include',mode:'cors'});
        if (!response.ok) throw new Error(`API ${response.status}`);
        return await response.json();
      } catch { throw firstError; }
    }
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
    // 관리자에서 제공하는 클립보드 API를 먼저 사용해 iOS의 비동기 권한 문제를 피함.
    if (typeof GM_setClipboard === 'function') {
      await Promise.resolve(GM_setClipboard(text, 'text'));
      return;
    }
    if (typeof GM !== 'undefined' && typeof GM.setClipboard === 'function') {
      await GM.setClipboard(text, 'text');
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('클립보드 권한 없음');
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

  function showManualCopy(text) {
    document.getElementById('cmc-manual-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'cmc-manual-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    const pane = document.createElement('section');
    pane.style.cssText = 'width:min(530px,100%);max-height:85vh;background:#fff;color:#24252b;border-radius:17px;padding:18px;box-shadow:0 12px 50px #0004;display:flex;flex-direction:column;gap:12px;font:14px/1.5 system-ui,-apple-system,sans-serif;box-sizing:border-box;';
    const heading = document.createElement('strong');
    heading.textContent = '마크다운 원문 복사';
    const help = document.createElement('div');
    help.textContent = '자동 복사가 제한되어 있어요. 아래 원문을 길게 누르거나 선택해서 복사해 주세요.';
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
    copyBtn.onclick=async()=>{try{await putOnClipboard(text);showToast('마크다운 원문을 복사했어요 ✓');backdrop.remove();}catch{field.focus();field.select();try{if(document.execCommand('copy')){showToast('복사했어요 ✓');backdrop.remove();return;}}catch{}showToast('원문을 선택했어요. 복사 메뉴를 이용해 주세요.');}};
    closeBtn.onclick=()=>backdrop.remove();
    actions.append(selectBtn,copyBtn,closeBtn);pane.append(heading,help,field,actions);backdrop.append(pane);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)backdrop.remove();});
    document.documentElement.append(backdrop);
  }
})();
