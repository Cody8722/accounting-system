/**
 * pin.js — 電腦版概覽「卡片釘選（Pin）」互動。
 *
 * 視覺/手感由 Claude Design 打磨定案（見 frontend/v2/prototypes/pin-dashboard-prototype.html）；
 * 此處忠實移植其單一 requestAnimationFrame 動畫（FLIP 位移縮放 + 失焦模糊 + 字級/圖示尺寸逐幀插值
 * + chrome 收合 + 骨架佔位 + 標題 clone 疊層），並針對正式環境調整：
 *   - 尊重 prefers-reduced-motion：reduce 時直接切換版型/內容、不播動畫。
 *   - 「查看完整頁面」導頁改走 EventBus：emit('nav', view)。
 *
 * mountPinDeck(root, { onNav }) — root 為 .pindash 容器（內含 .top / .kpis / .deck > .card×4）。
 * 回傳 cleanup()（解除事件監聽、清除殘留 clone）。
 */

const MORPH_BLUR = 10;   // px，模糊峰值
const FLIP_DUR = 0.4;    // 秒，正常節奏
const HERO_LAG_POW = 1.7; // 非主角/chrome 的落後曲線指數
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function mountPinDeck(root, { onNav } = {}) {
  const deck = root.querySelector('.deck');
  if (!deck) return () => {};
  const cards = [...deck.querySelectorAll('.card')];
  const topEl = root.querySelector('.top');
  const kpisEl = root.querySelector('.kpis');
  const h1El = root.querySelector('h1');
  const subEl = root.querySelector('.sub');
  const kpiEls = [...root.querySelectorAll('.kpi')];

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pinned = null;
  let animating = false;

  function applyFrameLayout(pin) {
    // 釘選時同步收合上方 chrome（標題副標＋KPI 列），把讓出來的高度還給 deck，讓主角卡片真的變大。
    root.classList.toggle('compact', !!pin);
    if (!pin) {
      deck.classList.remove('pinned');
      cards.forEach((c) => { c.style.gridColumn = ''; c.style.gridRow = ''; c.style.maxWidth = ''; c.style.width = ''; c.style.margin = ''; c.style.justifySelf = ''; });
    } else {
      deck.classList.add('pinned');
      let col = 1;
      cards.forEach((c) => {
        if (c === pin) {
          c.style.gridColumn = '1 / -1'; c.style.gridRow = '1';
          c.style.maxWidth = 'min(1040px, 100%)'; c.style.width = '100%'; c.style.margin = '0'; c.style.justifySelf = 'center';
        } else {
          c.style.gridColumn = String(col++); c.style.gridRow = '2';
          c.style.maxWidth = ''; c.style.width = ''; c.style.margin = ''; c.style.justifySelf = '';
        }
      });
    }
  }

  function applyContentState(pin) {
    cards.forEach((c) => {
      const isPin = c === pin, isThumb = pin && c !== pin;
      c.classList.toggle('is-pinned', isPin);
      c.classList.toggle('is-thumb', isThumb);
      c.setAttribute('aria-pressed', isPin ? 'true' : 'false');
    });
  }

  const roleOf = (c, pin) => (c === pin ? 'pin' : (pin ? 'thumb' : 'grid'));
  const FONT_SIZES = {
    ctitle: { grid: 14.5, pin: 14.5, thumb: 13 },
    amt: { grid: 20, pin: 26, thumb: 15 },
    lab: { grid: 11, pin: 11, thumb: 9 },
    big: { grid: 20, pin: 24, thumb: 16 },
  };
  const SIZE_PX = {
    donutSvg: { grid: 128, pin: 128, thumb: 92 },
    txIcon: { grid: 29, pin: 29, thumb: 26 },
  };
  function fontLerpEntry(el, key, fromRole, toRole) {
    if (!el) return null;
    const from = FONT_SIZES[key][fromRole], to = FONT_SIZES[key][toRole];
    if (from === to) return null;
    return { el, from, to };
  }
  function sizeLerpEntries(c, selector, sizeKey, fromRole, toRole) {
    const from = SIZE_PX[sizeKey][fromRole], to = SIZE_PX[sizeKey][toRole];
    if (from === to) return [];
    return [...c.querySelectorAll(selector)].map((el) => ({ el, from, to }));
  }
  function extraFadeEntries(c, fromRole, toRole) {
    const before = fromRole !== 'thumb', after = toRole !== 'thumb';
    if (before === after) return [];
    return [...c.querySelectorAll('.thumb-hide')].map((el) => ({ el, from: before ? 1 : 0, to: after ? 1 : 0 }));
  }

  function togglePin(card) {
    if (animating) return;
    // 自癒性清理：清掉可能殘留的標題 clone、還原被隱藏的真實標題。
    [...deck.querySelectorAll(':scope > .chead')].forEach((el) => el.remove());
    cards.forEach((c) => { const h = c.querySelector('.chead'); if (h) h.style.visibility = ''; });

    const prevPinned = pinned;
    pinned = (pinned === card) ? null : card;
    const newHero = pinned;
    const oldHero = (prevPinned && prevPinned !== pinned) ? prevPinned : null;
    const movers = cards; // 四張卡都做 FLIP（允許交錯）
    const chromeChanging = (!!prevPinned) !== (!!pinned);
    const toCompact = !!pinned;

    if (reduce) {
      applyFrameLayout(pinned); applyContentState(pinned);
      cards.forEach((c) => {
        c.style.transform = ''; c.style.opacity = ''; c.classList.remove('ghost', 'morphing');
        const b = c.querySelector('.cbody'); if (b) b.style.filter = '';
        const h = c.querySelector('.chead'); if (h) h.style.visibility = '';
      });
      topEl.style.opacity = ''; topEl.style.filter = ''; topEl.style.transition = '';
      kpisEl.style.opacity = ''; kpisEl.style.filter = ''; kpisEl.style.transition = '';
      return;
    }

    const first = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    const headFirst = new Map(cards.map((c) => [c, c.querySelector('.chead').getBoundingClientRect()]));
    applyFrameLayout(pinned);
    const last = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    const headLast = new Map(cards.map((c) => [c, c.querySelector('.chead').getBoundingClientRect()]));
    const deckLastRect = deck.getBoundingClientRect();
    const deckPrevStyle = deck.getAttribute('style') || '';

    const moverData = movers.map((c) => {
      const f = first.get(c), l = last.get(c);
      const hf = headFirst.get(c), hl = headLast.get(c);
      const realHead = c.querySelector('.chead');
      const z = (c === card) ? 10 : 1;
      const clone = realHead.cloneNode(true);
      clone.style.cssText = 'position:fixed; margin:0; box-sizing:border-box;';
      clone.style.left = hf.left + 'px';
      clone.style.top = hf.top + 'px';
      clone.style.width = hf.width + 'px';
      clone.style.height = hf.height + 'px';
      clone.style.zIndex = String(z + 1);
      deck.appendChild(clone);
      realHead.style.visibility = 'hidden';

      const fromRole = roleOf(c, prevPinned), toRole = roleOf(c, pinned);
      const fontLerps = [
        fontLerpEntry(clone.querySelector('.ctitle'), 'ctitle', fromRole, toRole),
        fontLerpEntry(c.querySelector('.center .amt'), 'amt', fromRole, toRole),
        fontLerpEntry(c.querySelector('.center .lab'), 'lab', fromRole, toRole),
        fontLerpEntry(c.querySelector('.bud-total .big'), 'big', fromRole, toRole),
      ].filter(Boolean);
      const sizeLerps = [
        ...sizeLerpEntries(c, '.donut svg', 'donutSvg', fromRole, toRole),
        ...sizeLerpEntries(c, '.tx .ic', 'txIcon', fromRole, toRole),
      ];
      const extraFades = extraFadeEntries(c, fromRole, toRole);
      const skelOverlay = c.querySelector('.skel-overlay');
      const skelContent = c.querySelector('.skel-target');
      const isHero = (c === newHero) || (c === oldHero);

      return {
        card: c, first: f, last: l,
        dx: f.left - l.left, dy: f.top - l.top,
        sx0: (f.width / l.width) || 1, sy0: (f.height / l.height) || 1,
        realHead, clone, hf, hl, z, fontLerps, sizeLerps, extraFades, skelOverlay, skelContent, isHero,
        cbody: c.querySelector('.cbody'),
      };
    });

    cards.forEach((c) => {
      c.classList.remove('ghost');
      c.classList.add('morphing');
      c.style.transition = 'none';
      c.style.opacity = '';
      c.style.transformOrigin = 'top left';
      c.style.zIndex = (c === card) ? '10' : '1';
    });
    // 「查看完整頁面」按鈕：從主角變回縮圖時，一開始就先藏起來（不等動畫結束）。
    moverData.forEach((m) => {
      if (roleOf(m.card, prevPinned) === 'pin' && roleOf(m.card, pinned) !== 'pin') {
        const fl = m.card.querySelector('.full-link');
        if (fl) fl.style.display = 'none';
      }
    });
    if (chromeChanging) {
      topEl.style.transition = 'none'; kpisEl.style.transition = 'none';
      topEl.style.opacity = '.45'; kpisEl.style.opacity = '.45';
      deck.style.position = 'fixed';
      deck.style.left = deckLastRect.left + 'px';
      deck.style.top = deckLastRect.top + 'px';
      deck.style.width = deckLastRect.width + 'px';
      deck.style.height = deckLastRect.height + 'px';
    }
    moverData.forEach((m) => {
      m.card.style.transform = `translate(${m.dx}px,${m.dy}px) scale(${m.sx0},${m.sy0})`;
      if (m.cbody) { m.cbody.style.transition = 'none'; m.cbody.style.filter = 'blur(0px)'; }
    });

    animating = true;
    const durMs = FLIP_DUR * 1000;
    let start = null;

    function frame(ts) {
      if (start === null) start = ts;
      const raw = Math.min(1, (ts - start) / durMs);
      const eased = easeInOutSine(raw);
      moverData.forEach((m) => {
        const p = m.isHero ? eased : Math.pow(eased, HERO_LAG_POW);
        const focus = Math.sin(p * Math.PI);
        const tx = m.dx * (1 - p), ty = m.dy * (1 - p);
        const sx = m.sx0 + (1 - m.sx0) * p, sy = m.sy0 + (1 - m.sy0) * p;
        m.card.style.transform = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
        const cx = m.hf.left + (m.hl.left - m.hf.left) * p;
        const cy = m.hf.top + (m.hl.top - m.hf.top) * p;
        const cw = m.hf.width + (m.hl.width - m.hf.width) * p;
        const ch = m.hf.height + (m.hl.height - m.hf.height) * p;
        m.clone.style.width = cw + 'px';
        m.clone.style.height = ch + 'px';
        m.clone.style.transform = `translate(${cx - m.hf.left}px, ${cy - m.hf.top}px)`;
        if (m.cbody) m.cbody.style.filter = `blur(${(focus * MORPH_BLUR).toFixed(2)}px)`;
        m.fontLerps.forEach((fl) => { fl.el.style.fontSize = lerp(fl.from, fl.to, p).toFixed(2) + 'px'; });
        m.sizeLerps.forEach((sl) => { const v = lerp(sl.from, sl.to, p).toFixed(2) + 'px'; sl.el.style.width = v; sl.el.style.height = v; });
        m.extraFades.forEach((fe) => { fe.el.style.opacity = lerp(fe.from, fe.to, p).toFixed(2); });
        if (m.skelOverlay) {
          m.skelOverlay.style.opacity = (focus * 0.92).toFixed(2);
          if (m.skelContent) m.skelContent.style.opacity = (1 - focus * 0.92).toFixed(2);
        }
      });
      if (chromeChanging) {
        const chromeP = Math.pow(eased, HERO_LAG_POW);
        const t = toCompact ? chromeP : (1 - chromeP);
        const chromeFocus = Math.sin(chromeP * Math.PI);
        topEl.style.opacity = String(0.45 + 0.55 * chromeP);
        topEl.style.filter = `blur(${(chromeFocus * MORPH_BLUR).toFixed(2)}px)`;
        kpisEl.style.opacity = topEl.style.opacity;
        kpisEl.style.filter = topEl.style.filter;
        topEl.style.marginBottom = lerp(13, 6, t) + 'px';
        h1El.style.fontSize = lerp(21, 16, t) + 'px';
        subEl.style.opacity = lerp(1, 0, t);
        subEl.style.maxHeight = lerp(40, 0, t) + 'px';
        subEl.style.marginTop = lerp(3, 0, t) + 'px';
        kpisEl.style.gap = lerp(12, 8, t) + 'px';
        kpisEl.style.marginBottom = lerp(13, 8, t) + 'px';
        kpiEls.forEach((k) => {
          k.style.padding = lerp(11, 6, t).toFixed(1) + 'px ' + lerp(15, 12, t).toFixed(1) + 'px';
          const kl = k.querySelector('.kl'), kv = k.querySelector('.kv');
          if (kl) { kl.style.marginBottom = lerp(6, 1, t).toFixed(1) + 'px'; kl.style.fontSize = lerp(12, 10, t).toFixed(1) + 'px'; }
          if (kv) kv.style.fontSize = lerp(19, 14, t).toFixed(1) + 'px';
        });
      }
      if (raw < 1) { requestAnimationFrame(frame); return; }

      moverData.forEach((m) => {
        m.card.style.transform = ''; m.card.style.transformOrigin = ''; m.card.classList.remove('morphing');
        m.card.style.zIndex = '';
        if (m.cbody) { m.cbody.style.filter = ''; m.cbody.style.transition = ''; }
        m.fontLerps.forEach((fl) => { fl.el.style.fontSize = ''; });
        m.sizeLerps.forEach((sl) => { sl.el.style.width = ''; sl.el.style.height = ''; });
        m.extraFades.forEach((fe) => { fe.el.style.opacity = ''; });
        if (m.skelOverlay) m.skelOverlay.style.opacity = '';
        if (m.skelContent) m.skelContent.style.opacity = '';
        m.clone.remove();
        const fl = m.card.querySelector('.full-link');
        if (fl) fl.style.display = '';
        m.realHead.style.visibility = '';
      });
      if (chromeChanging) {
        topEl.style.opacity = ''; topEl.style.filter = ''; topEl.style.marginBottom = '';
        h1El.style.fontSize = '';
        subEl.style.opacity = ''; subEl.style.maxHeight = ''; subEl.style.marginTop = '';
        kpisEl.style.opacity = ''; kpisEl.style.filter = ''; kpisEl.style.gap = ''; kpisEl.style.marginBottom = '';
        kpiEls.forEach((k) => {
          k.style.padding = '';
          const kl = k.querySelector('.kl'), kv = k.querySelector('.kv');
          if (kl) { kl.style.marginBottom = ''; kl.style.fontSize = ''; }
          if (kv) kv.style.fontSize = '';
        });
        deck.setAttribute('style', deckPrevStyle);
      }
      applyContentState(pinned);
      animating = false;
    }
    requestAnimationFrame(frame);
  }

  const handlers = [];
  cards.forEach((card) => {
    const onClick = (e) => {
      const link = e.target.closest('.full-link');
      if (link) { e.stopPropagation(); if (onNav) onNav(link.dataset.nav); return; }
      togglePin(card);
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePin(card); } };
    card.addEventListener('click', onClick);
    card.addEventListener('keydown', onKey);
    handlers.push([card, onClick, onKey]);
  });

  return function cleanup() {
    handlers.forEach(([c, ck, k]) => { c.removeEventListener('click', ck); c.removeEventListener('keydown', k); });
    [...deck.querySelectorAll(':scope > .chead')].forEach((el) => el.remove());
  };
}
