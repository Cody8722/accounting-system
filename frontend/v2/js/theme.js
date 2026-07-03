/**
 * theme.js — 主題管理：系統 / 亮 / 暗，存 localStorage。
 * data-theme 掛在 <html>，全 App 共用 CSS 變數。
 */

const KEY = 'v2-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

/** 目前選擇：'system' | 'light' | 'dark' */
export function getThemePref() { return localStorage.getItem(KEY) || 'system'; }

/** 實際套用的色系：'light' | 'dark' */
export function resolvedTheme() {
  const pref = getThemePref();
  if (pref === 'system') return media.matches ? 'dark' : 'light';
  return pref;
}

export function applyTheme() {
  const resolved = resolvedTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f0f12' : '#ffffff');
  listeners.forEach((fn) => fn(resolved, getThemePref()));
}

export function setThemePref(pref) {
  localStorage.setItem(KEY, pref);
  applyTheme();
}

/** 亮 ⇄ 暗 快速切換（供頂部按鈕） */
export function cycleTheme() {
  setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

/** 目前主題對應的切換圖示 */
export function themeToggleIcon() {
  return resolvedTheme() === 'dark' ? 'ti-sun' : 'ti-moon';
}

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initTheme() {
  media.addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); });
  applyTheme();
}
