/**
 * charts.js — 自製輕量互動 SVG 圖表（不引外部依賴）。
 * donut：分類佔比（hover 高亮該段、圓心即時更新）
 * bars：月度收支比較（hover 淡出其他 + tooltip）
 * line：支出趨勢折線（crosshair + tooltip）
 * flowTree：單一錢包資金流向樹（銀行/現金/受限資金 + 三種明確關聯邊，靜態顯示）
 */

import { fmtMoney } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx, cy, rOut, rIn, a0, a1) {
  const [x0, y0] = polar(cx, cy, rOut, a1);
  const [x1, y1] = polar(cx, cy, rOut, a0);
  const [x2, y2] = polar(cx, cy, rIn, a0);
  const [x3, y3] = polar(cx, cy, rIn, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${rOut} ${rOut} 0 ${large} 0 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 ${large} 1 ${x3} ${y3} Z`;
}

/**
 * Catmull-Rom／Cardinal 雲線轉 SVG cubic-bezier path（Cody Design System 品牌識別：
 * 圖表連接線一律用有機曲線，不用直線/直角）。tension 對齊 d3 curveCardinal 的定義，
 * 0 為標準 Catmull-Rom、越接近 1 越貼近直線；points 至少 2 個點。
 * 端點以複製邊界點取代真正的鏡射外插，簡單、穩定，不會有 overshoot。
 */
function catmullRomPath(points, tension = 0) {
  if (points.length < 2) return '';
  const scale = (1 - tension) / 6;
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) * scale, c1y = p1.y + (p2.y - p0.y) * scale;
    const c2x = p2.x - (p3.x - p1.x) * scale, c2y = p2.y - (p3.y - p1.y) * scale;
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * 甜甜圈圖。data:[{label,value,color}]
 * onSelect(item|null) 回報目前 hover/選取項（供外部更新圓心）。
 */
export function donut(container, data, { size = 200, onSelect } = {}) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2, rOut = size / 2 - 4, rIn = rOut - 26;
  const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });

  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx, cy, r: (rOut + rIn) / 2, fill: 'none', stroke: 'var(--fill)', 'stroke-width': rOut - rIn }));
    container.appendChild(svg);
    if (onSelect) onSelect(null);
    return;
  }

  let angle = 0;
  const segs = [];
  data.forEach((d) => {
    const sweep = d.value / total * 360;
    const path = svgEl('path', { d: arcPath(cx, cy, rOut, rIn, angle, angle + sweep - (data.length > 1 ? 1.5 : 0)), fill: d.color, style: 'cursor:pointer;transition:opacity .18s' });
    const item = { ...d, pct: d.value / total * 100 };
    path.addEventListener('mouseenter', () => { segs.forEach((s) => s.style.opacity = '.25'); path.style.opacity = '1'; onSelect && onSelect(item); });
    path.addEventListener('click', () => { segs.forEach((s) => s.style.opacity = '.25'); path.style.opacity = '1'; onSelect && onSelect(item); });
    svg.appendChild(path);
    segs.push(path);
    angle += sweep;
  });
  svg.addEventListener('mouseleave', () => { segs.forEach((s) => s.style.opacity = '1'); onSelect && onSelect(null); });
  container.appendChild(svg);
  if (onSelect) onSelect(null);
}

function tip(container) {
  let t = container.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip hidden'; container.appendChild(t); }
  return t;
}

/**
 * 月度收支長條。rows:[{label, income, expense}]
 */
export function bars(container, rows, { height = 200 } = {}) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const t = tip(container);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const W = container.clientWidth || 320;
  const padB = 26, plot = height - padB;
  const gw = W / rows.length;
  const svg = svgEl('svg', { width: '100%', height, viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none' });

  rows.forEach((r, i) => {
    const cxg = i * gw + gw / 2;
    const bw = Math.min(16, gw / 3.2);
    const inc = svgEl('rect', { x: cxg - bw - 2, y: plot - (r.income / max) * plot, width: bw, height: (r.income / max) * plot, rx: 3, fill: 'var(--income)', style: 'transition:opacity .18s' });
    const exp = svgEl('rect', { x: cxg + 2, y: plot - (r.expense / max) * plot, width: bw, height: (r.expense / max) * plot, rx: 3, fill: 'var(--expense)', style: 'transition:opacity .18s' });
    const hit = svgEl('rect', { x: i * gw, y: 0, width: gw, height, fill: 'transparent', style: 'cursor:pointer' });
    const lbl = svgEl('text', { x: cxg, y: height - 8, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted2)', 'font-family': 'IBM Plex Mono' });
    lbl.textContent = r.label.slice(-2);
    hit.addEventListener('mousemove', (e) => {
      svg.querySelectorAll('rect').forEach((el) => { if (el !== inc && el !== exp && el.getAttribute('fill') !== 'transparent') el.style.opacity = '.2'; });
      const rect = container.getBoundingClientRect();
      t.classList.remove('hidden');
      t.style.left = `${e.clientX - rect.left}px`; t.style.top = `${e.clientY - rect.top}px`;
      t.innerHTML = `${r.label}<br>收 ${fmtMoney(r.income)} · 支 ${fmtMoney(r.expense)}`;
    });
    hit.addEventListener('mouseleave', () => { svg.querySelectorAll('rect').forEach((el) => el.style.opacity = '1'); t.classList.add('hidden'); });
    svg.append(inc, exp, hit, lbl);
  });
  container.appendChild(svg);
}

/**
 * 折線圖。points:[{label, value}]
 */
export function line(container, points, { height = 190, color = 'var(--accent)' } = {}) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const t = tip(container);
  const W = container.clientWidth || 320;
  const padX = 10, padT = 12, padB = 24, plot = height - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.value));
  const xs = points.map((_, i) => padX + (points.length === 1 ? W / 2 : (i * (W - padX * 2)) / (points.length - 1)));
  const ys = points.map((p) => padT + plot - (p.value / max) * plot);
  const svg = svgEl('svg', { width: '100%', height, viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none' });

  let d = '', area = '';
  xs.forEach((x, i) => { d += `${i ? 'L' : 'M'}${x} ${ys[i]} `; });
  area = `${d} L${xs[xs.length - 1]} ${padT + plot} L${xs[0]} ${padT + plot} Z`;
  svg.appendChild(svgEl('path', { d: area, fill: color, opacity: 0.08 }));
  svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  const cross = svgEl('line', { y1: padT, y2: padT + plot, stroke: 'var(--border-strong)', 'stroke-dasharray': '3 3', style: 'display:none' });
  const dot = svgEl('circle', { r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, style: 'display:none' });
  svg.append(cross, dot);
  points.forEach((p, i) => {
    const lbl = svgEl('text', { x: xs[i], y: height - 6, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted2)', 'font-family': 'IBM Plex Mono' });
    lbl.textContent = p.label.slice(-2);
    svg.appendChild(lbl);
  });
  const hit = svgEl('rect', { x: 0, y: 0, width: W, height, fill: 'transparent', style: 'cursor:crosshair' });
  hit.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    let idx = 0, best = Infinity;
    xs.forEach((x, i) => { const dd = Math.abs(x - mx); if (dd < best) { best = dd; idx = i; } });
    cross.setAttribute('x1', xs[idx]); cross.setAttribute('x2', xs[idx]); cross.style.display = '';
    dot.setAttribute('cx', xs[idx]); dot.setAttribute('cy', ys[idx]); dot.style.display = '';
    t.classList.remove('hidden');
    t.style.left = `${e.clientX - rect.left}px`; t.style.top = `${ys[idx]}px`;
    t.innerHTML = `${points[idx].label}<br>${fmtMoney(points[idx].value)}`;
  });
  hit.addEventListener('mouseleave', () => { cross.style.display = 'none'; dot.style.display = 'none'; t.classList.add('hidden'); });
  svg.appendChild(hit);
  container.appendChild(svg);
}

/**
 * 資金流向樹（單一錢包）。data 為 GET /admin/api/wallets/<id>/flow-tree 的回應：
 * { wallet_name, locations:{bank:{balance},cash:{balance}}, restricted_locked_total,
 *   edges:{auto_withdrawal,restricted_split,restricted_unlock} }（每個 edge 為 {count,amount}）
 *
 * 版面是貨真價實的「根 → 三個子節點」樹，不是三個節點互連的流程圖：
 *   根節點＝錢包總覽（名稱 + 銀行/現金加總），三個子節點＝銀行／現金／受限資金。
 *   三條分支線完全同款（同色、同粗細、同一套曲線公式）——分支代表「錢包底下
 *   有這三個桶」的從屬關係，本身沒有「發生/沒發生」的狀態，不需要用不同線
 *   風格區分；哪些事件真的發生過，改成寫進對應節點卡片內的一行子文字
 *   （自動提領→現金卡片；拆分/解鎖→受限資金卡片），事件次數為 0 就直接不
 *   顯示那行，不再用「尚未發生」的弱對比文字硬撐畫面。
 *   每個節點卡片是實線／虛線，只看這個節點自己的金額是不是 0——受限資金不
 *   會因為「類別特殊」就固定給搶眼配色，銀行/現金也不會因為「位置」就永遠
 *   最顯眼；純粹依金額決定視覺權重，跟哪一種節點無關。
 */
export function flowTree(container, data) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const W = container.clientWidth || 320;

  const defs = svgEl('defs');
  const arrow = svgEl('marker', { id: 'flow-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  arrow.appendChild(svgEl('path', { d: 'M0 0 L10 5 L0 10 Z', fill: 'var(--accent)' }));
  defs.appendChild(arrow);
  // 卡片極淺陰影（Cody Design System：白底/16px 圓角/髮絲邊框/極淺陰影，絕不用重陰影）；
  // 只有「有錢」的實線卡片才上陰影，虛線的空卡片刻意不上陰影，陰影本身也是視覺權重的一部分
  const shadow = svgEl('filter', { id: 'flow-card-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  shadow.appendChild(svgEl('feDropShadow', { dx: 0, dy: 1, stdDeviation: 2, 'flood-opacity': 0.12 }));
  defs.appendChild(shadow);

  const rootW = 168, rootH = 50, rootY = 12;
  const rootX = (W - rootW) / 2;
  const gapAfterRoot = 34;
  const childY = rootY + rootH + gapAfterRoot;
  const childH = 96;
  const sidePad = 12, childGap = 10;
  const childW = Math.max(84, (W - sidePad * 2 - childGap * 2) / 3);
  const bankX = sidePad;
  const cashX = sidePad + childW + childGap;
  const restrictedX = sidePad + (childW + childGap) * 2;
  const H = childY + childH + 16;

  const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  svg.appendChild(defs);

  function balanceText(v) { return `${v >= 0 ? '' : '−'}${fmtMoney(Math.abs(v))}`; }

  /** 分支線：從根部先垂直探出一段，再彎向子節點——模擬樹枝「先往下長，再分岔」
   * 的自然生長感，弧度因此有邏輯意義（子節點離中軸越遠，彎的幅度自然越大），
   * 不是「兩端點對齊、卻硬要畫成弧線」那種說不出理由的彎。 */
  function branchPath(x1, y1, x2, y2) {
    const midY = y1 + (y2 - y1) * 0.55;
    return catmullRomPath([{ x: x1, y: y1 }, { x: x1, y: midY }, { x: x2, y: y2 }], 0.42);
  }

  function card(x, y, w, h, lines, filled) {
    const g = svgEl('g');
    g.appendChild(svgEl('rect', {
      x, y, width: w, height: h, rx: 16, fill: 'var(--surface)',
      stroke: filled ? 'var(--border-strong)' : 'var(--border)',
      'stroke-width': 1, 'stroke-dasharray': filled ? '' : '4 4',
      filter: filled ? 'url(#flow-card-shadow)' : '',
    }));
    // 依內容行數（2~4 行）在固定卡高內垂直置中，卡片高度統一、內容多寡不影響對齊
    const LH = { label: 17, amount: 22, sub: 16 };
    const blockH = lines.reduce((s, l) => s + LH[l.kind], 0);
    let cy = y + (h - blockH) / 2;
    for (const l of lines) {
      cy += LH[l.kind];
      const attrs = {
        x: x + w / 2, y: cy - LH[l.kind] * 0.32, 'text-anchor': 'middle',
        'font-size': l.kind === 'amount' ? 16 : l.kind === 'label' ? 12 : 11,
        'font-weight': l.kind === 'amount' ? 600 : l.kind === 'sub' ? 500 : 400,
        fill: l.color,
      };
      if (l.kind === 'amount') attrs['font-family'] = 'IBM Plex Mono';
      const t = svgEl('text', attrs);
      t.textContent = l.text;
      g.appendChild(t);
    }
    return g;
  }

  function nodeLines(label, amount, filled, subs) {
    const lines = [
      { kind: 'label', text: label, color: filled ? 'var(--muted)' : 'var(--faint)' },
      { kind: 'amount', text: balanceText(amount), color: filled ? (amount >= 0 ? 'var(--text)' : 'var(--expense)') : 'var(--muted)' },
    ];
    for (const s of subs) lines.push({ kind: 'sub', text: s, color: 'var(--text3)' });
    return lines;
  }

  const bankBal = data.locations.bank.balance;
  const cashBal = data.locations.cash.balance;
  const lockedTotal = data.restricted_locked_total;
  const rootTotal = bankBal + cashBal;

  const bankFilled = bankBal !== 0;
  const cashFilled = cashBal !== 0;
  const lockedFilled = lockedTotal !== 0;

  // 事件子文字：自動提領只看有沒有發生過（跟現金目前餘額無關）；拆分/解鎖則
  // 綁在「目前是否還有鎖定中金額」——已經全部解鎖時卡片整個降權，連同這兩行
  // 一起收起來，不留半殘的歷史紀錄佔位置。
  const cashSubs = data.edges.auto_withdrawal.count > 0
    ? [`自動提領 ${fmtMoney(data.edges.auto_withdrawal.amount)}`] : [];
  const restrictedSubs = lockedFilled
    ? [`拆分 ${fmtMoney(data.edges.restricted_split.amount)}`, `解鎖 ${fmtMoney(data.edges.restricted_unlock.amount)}`] : [];

  const rootBottomX = W / 2, rootBottomY = rootY + rootH;
  [bankX, cashX, restrictedX].forEach((cx) => {
    svg.appendChild(svgEl('path', {
      d: branchPath(rootBottomX, rootBottomY, cx + childW / 2, childY),
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round',
      'marker-end': 'url(#flow-arrow)',
    }));
  });

  svg.appendChild(card(rootX, rootY, rootW, rootH, [
    { kind: 'label', text: data.wallet_name, color: 'var(--muted)' },
    { kind: 'amount', text: balanceText(rootTotal), color: rootTotal >= 0 ? 'var(--text)' : 'var(--expense)' },
  ], rootTotal !== 0));

  svg.appendChild(card(bankX, childY, childW, childH, nodeLines('銀行', bankBal, bankFilled, []), bankFilled));
  svg.appendChild(card(cashX, childY, childW, childH, nodeLines('現金', cashBal, cashFilled, cashSubs), cashFilled));
  svg.appendChild(card(restrictedX, childY, childW, childH, nodeLines('受限資金', lockedTotal, lockedFilled, restrictedSubs), lockedFilled));

  // 進場動畫：140-320ms、--ease-organic，靜態圖表也維持統一的動畫語彙
  svg.style.opacity = '0';
  container.appendChild(svg);
  requestAnimationFrame(() => {
    svg.style.transition = 'opacity 280ms var(--ease-organic)';
    svg.style.opacity = '1';
  });
}
