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

/** 兩點間插入一個垂直於連線方向、偏移 bow px 的中繼點，讓 catmullRomPath 畫出來
 * 不是退化的直線，而是一段自然的弧——弧度刻意收斂（bow 預設 14px），維持
 * 品牌「極淺、克制」的調性，不做誇張的 S 彎。 */
function bowedPoints(x1, y1, x2, y2, bow) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return [{ x: x1, y: y1 }, { x: mx + nx * bow, y: my + ny * bow }, { x: x2, y: y2 }];
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
 * { locations:{bank:{balance},cash:{balance}}, restricted_locked_total,
 *   edges:{auto_withdrawal,restricted_split,restricted_unlock} }（每個 edge 為 {count,amount}）
 * 只呈現「已經記錄的明確關聯」的靜態加總，不做配對追蹤、不下鑽——次數為 0 的邊畫成
 * 灰色虛線代表「這個情境從未發生過」，避免跟「有發生但金額剛好是 0」混淆。
 */
export function flowTree(container, data) {
  container.innerHTML = '';
  container.style.position = 'relative';
  const W = container.clientWidth || 320;
  const H = 284;
  const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });

  const defs = svgEl('defs');
  [['flow-arrow', 'var(--accent)'], ['flow-arrow-muted', 'var(--border-strong)']].forEach(([id, fill]) => {
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    m.appendChild(svgEl('path', { d: 'M0 0 L10 5 L0 10 Z', fill }));
    defs.appendChild(m);
  });
  // 卡片極淺陰影（Cody Design System：白底/16px 圓角/髮絲邊框/極淺陰影，絕不用重陰影）
  const shadow = svgEl('filter', { id: 'flow-card-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  shadow.appendChild(svgEl('feDropShadow', { dx: 0, dy: 1, stdDeviation: 2, 'flood-opacity': 0.12 }));
  defs.appendChild(shadow);
  svg.appendChild(defs);

  const nodeW = 116, nodeH = 52;
  // 銀行/現金並排，中間縫隙在窄螢幕（手機）可能容不下自動提領的完整文字標籤，
  // 所以那條邊的標籤獨立放在整排上方（見下方 edgeLine 的 labelY 參數），
  // 不跟著線的中點走——節點方塊是後畫的、有底色，蓋在下面的文字會被裁切。
  const topLabelY = 16, topY = 40;
  const bankX = 12, cashX = W - 12 - nodeW;
  const restrictedX = (W - nodeW) / 2, restrictedY = 172;
  const midX = W / 2;

  function balanceColor(v) { return v >= 0 ? 'var(--text)' : 'var(--expense)'; }
  function balanceText(v) { return `${v >= 0 ? '' : '−'}${fmtMoney(Math.abs(v))}`; }

  function node(x, y, label, amountText, amountColor, { fill = 'var(--surface)', stroke = 'var(--border)' } = {}) {
    const g = svgEl('g');
    g.appendChild(svgEl('rect', { x, y, width: nodeW, height: nodeH, rx: 16, fill, stroke, 'stroke-width': 1, filter: 'url(#flow-card-shadow)' }));
    const t1 = svgEl('text', { x: x + nodeW / 2, y: y + 21, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--muted)' });
    t1.textContent = label;
    const t2 = svgEl('text', { x: x + nodeW / 2, y: y + 40, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 600, 'font-family': 'IBM Plex Mono', fill: amountColor });
    t2.textContent = amountText;
    g.append(t1, t2);
    return g;
  }

  function endpointLabel(y, label) {
    const g = svgEl('g');
    g.appendChild(svgEl('circle', { cx: midX, cy: y, r: 4, fill: 'var(--muted2)' }));
    const t = svgEl('text', { x: midX, y: y - 9, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 500, fill: 'var(--muted)' });
    t.textContent = label;
    g.appendChild(t);
    return g;
  }

  // 連接線一律走 Catmull-Rom 有機曲線（tension 0.42），不用直線/直角——
  // 品牌識別動機，即使兩端點對齊成一直線也刻意加一點弧度（見 bowedPoints）。
  // bow 給得夠大才看得出來是「刻意的曲線」而不是誤差；弧線穿過標籤文字的問題
  // 交給下面的 chip 背景處理，不必為了閃開文字而把弧度縮到幾乎看不出來。
  function edgeLine(x1, y1, x2, y2, label, e, { labelY, bow = 22 } = {}) {
    const active = e.count > 0;
    const g = svgEl('g');
    g.appendChild(svgEl('path', {
      d: catmullRomPath(bowedPoints(x1, y1, x2, y2, bow), 0.42), fill: 'none',
      stroke: active ? 'var(--accent)' : 'var(--border)',
      'stroke-width': active ? 2.25 : 1.5,
      'stroke-dasharray': active ? '' : '4 4',
      'stroke-linecap': 'round',
      'marker-end': `url(#${active ? 'flow-arrow' : 'flow-arrow-muted'})`,
    }));
    const t = svgEl('text', { x: (x1 + x2) / 2, y: labelY ?? (y1 + y2) / 2 - 6, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 500, fill: active ? 'var(--text3)' : 'var(--muted2)', 'data-chip': '1' });
    t.textContent = active ? `${label} · ${fmtMoney(e.amount)}（${e.count} 筆）` : `${label} · 尚未發生`;
    g.appendChild(t);
    return g;
  }

  const bankBal = data.locations.bank.balance;
  const cashBal = data.locations.cash.balance;

  // 銀行 → 現金：自動提領（線在兩節點中心高度，標籤獨立放上方，見上方註解）
  svg.appendChild(edgeLine(
    bankX + nodeW, topY + nodeH / 2, cashX, topY + nodeH / 2,
    '自動提領', data.edges.auto_withdrawal, { labelY: topLabelY, bow: 28 },
  ));
  // 收入 → 受限資金：拆分
  svg.appendChild(edgeLine(midX, 118, midX, restrictedY, '拆分', data.edges.restricted_split, { bow: 20 }));
  // 受限資金 → 支出：解鎖（跟拆分反向弧度，兩段合起來有輕微 S 型流動感）
  svg.appendChild(edgeLine(midX, restrictedY + nodeH, midX, 258, '解鎖', data.edges.restricted_unlock, { bow: -20 }));

  svg.appendChild(endpointLabel(112, '收入'));
  svg.appendChild(node(bankX, topY, '銀行', balanceText(bankBal), balanceColor(bankBal)));
  svg.appendChild(node(cashX, topY, '現金', balanceText(cashBal), balanceColor(cashBal)));
  // 受限資金是「狀態」不是「位置」，跟銀行/現金給同樣的純白卡片會分不出差別，
  // 用品牌 accent 的淺色調（--accent-soft）標出它是不同性質的節點——
  // 不是彩色左邊框（品牌規則明講絕不用），是整張卡片淺色調，克制但看得出來。
  svg.appendChild(node(restrictedX, restrictedY, '受限資金', balanceText(data.restricted_locked_total), 'var(--accent-soft-text)', { fill: 'var(--accent-soft)', stroke: 'var(--accent-soft-border)' }));
  svg.appendChild(endpointLabel(264, '支出'));

  // 進場動畫：140-320ms、--ease-organic，靜態圖表也維持統一的動畫語彙
  svg.style.opacity = '0';
  container.appendChild(svg);

  // 邊的標籤（拆分/解鎖/自動提領）疊在有機曲線上時，短邊的弧線會穿過文字——
  // 補一塊跟卡片同色的底色墊在文字後面，蓋掉線段，而不是靠縮小弧度硬躲開
  // （縮小弧度會違背「一律用有機曲線」的品牌規則，等於換句話說回到直線）。
  svg.querySelectorAll('text[data-chip]').forEach((t) => {
    const bbox = t.getBBox();
    const pad = 3;
    const rect = svgEl('rect', { x: bbox.x - pad, y: bbox.y - pad, width: bbox.width + pad * 2, height: bbox.height + pad * 2, rx: 4, fill: 'var(--surface)' });
    t.parentNode.insertBefore(rect, t);
  });

  requestAnimationFrame(() => {
    svg.style.transition = 'opacity 280ms var(--ease-organic)';
    svg.style.opacity = '1';
  });
}
