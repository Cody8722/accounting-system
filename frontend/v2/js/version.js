/**
 * version.js — v2 版本號與本次更新的一行說明（單一來源）。
 *
 * 升版時（每次改動 v2 前端）順手更新這兩個常數：
 *   1. APP_VERSION：與 service-worker.js 的 CACHE_NAME 版號保持一致
 *   2. RELEASE_NOTE：本次更新的一行簡短說明，會顯示在「已更新」提示 Toast
 *
 * 刻意只保留最新一行、不做完整 CHANGELOG；使用者升版後看到的就是這一行。
 */
export const APP_VERSION = '1.15.1';
export const RELEASE_NOTE = '縮小標題襯線字體範圍：僅側欄品牌名稱使用，其餘頁面標題改回原字型';
