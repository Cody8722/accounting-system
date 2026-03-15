/**
 * 匯出/匯入功能模組
 *
 * 功能：
 * - 匯出記帳記錄為 CSV / Excel / JSON 格式
 * - 從 JSON 備份檔匯入（去重，顯示結果摘要）
 * - 錯誤處理和用戶提示
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { showToast } from './utils.js';

/**
 * 匯出記帳記錄（支援 CSV / Excel 格式）
 * @param {string} format - 'csv'（預設）或 'xlsx'
 */
export async function exportAccountingRecords(format = 'csv') {
    try {
        // 發送匯出開始事件
        EventBus.emit(EVENTS.EXPORT_CSV_START);

        // 獲取篩選條件
        const startDate = document.getElementById('filter-start-date')?.value || '';
        const endDate = document.getElementById('filter-end-date')?.value || '';
        const type = document.getElementById('filter-type')?.value || '';

        // 建立查詢參數
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (type) params.append('type', type);
        params.append('format', format);

        // 呼叫匯出 API
        const response = await apiCall(`${backendUrl}/admin/api/accounting/export?${params.toString()}`);

        if (response.ok) {
            // 獲取檔案內容
            const blob = await response.blob();

            // 從 response headers 獲取檔案名稱
            const contentDisposition = response.headers.get('Content-Disposition');
            const defaultName = format === 'xlsx' ? '記帳記錄.xlsx' : format === 'json' ? '記帳備份.json' : '記帳記錄.csv';
            let filename = defaultName;
            if (contentDisposition) {
                // 優先用 filename*=UTF-8''...（RFC 5987，支援中文，後端已送出）
                const starMatch = /filename\*=UTF-8''([^;\r\n]+)/i.exec(contentDisposition);
                if (starMatch && starMatch[1]) {
                    filename = decodeURIComponent(starMatch[1].trim());
                } else {
                    // 退而求其次：filename="..."，需去掉引號
                    const matches = /filename=["']?([^"';\r\n]+)["']?/.exec(contentDisposition);
                    if (matches && matches[1]) {
                        filename = matches[1].trim();
                    }
                }
            }

            // 建立下載連結
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // 清理
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // 關閉下拉選單
            const dropdown = document.getElementById('export-dropdown');
            if (dropdown) dropdown.classList.add('hidden');

            // 顯示成功訊息
            showToast('匯出成功！', 'success');

            // 發送匯出完成事件
            EventBus.emit(EVENTS.EXPORT_CSV_COMPLETE, {
                filename,
                filters: { startDate, endDate, type }
            });

        } else {
            const result = await response.json();
            throw new Error(result.error || '匯出失敗');
        }
    } catch (error) {
        console.error('匯出記錄失敗:', error);
        showToast(`匯出失敗: ${error.message}`, 'error');

        // 發送匯出失敗事件
        EventBus.emit(EVENTS.EXPORT_CSV_COMPLETE, {
            error: error.message
        });
    }
}

/**
 * 初始化匯出模組
 */
/**
 * 從 JSON 備份檔匯入記帳記錄
 */
export async function importAccountingRecords() {
    const fileInput = document.getElementById('import-file');
    if (!fileInput) return;
    fileInput.click();
}

async function handleImportFile(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.records || !Array.isArray(data.records)) {
            showToast('格式錯誤：找不到 records 欄位', 'error');
            return;
        }

        showToast('匯入中...', 'success');

        const response = await apiCall(`${backendUrl}/admin/api/accounting/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: data.records }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || '匯入失敗');
        }

        // 顯示結果彈窗
        showImportResult(result);

    } catch (error) {
        if (error instanceof SyntaxError) {
            showToast('檔案格式錯誤：不是有效的 JSON 檔案', 'error');
        } else {
            showToast(`匯入失敗: ${error.message}`, 'error');
        }
    }
}

function showImportResult({ imported, duplicates, invalid, total }) {
    const existing = document.getElementById('import-result-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'import-result-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl p-6 w-80 text-center">
            <h3 class="text-lg font-bold text-gray-800 mb-4">匯入完成</h3>
            <div class="space-y-2 text-sm text-left mb-5">
                <div class="flex justify-between"><span>✅ 新增</span><span class="font-semibold text-green-600">${imported} 筆</span></div>
                <div class="flex justify-between"><span>🔁 重複（已略過）</span><span class="font-semibold text-yellow-600">${duplicates} 筆</span></div>
                <div class="flex justify-between"><span>❌ 格式錯誤（已略過）</span><span class="font-semibold text-red-500">${invalid} 筆</span></div>
                <hr class="border-gray-200">
                <div class="flex justify-between"><span>共處理</span><span class="font-semibold">${total} 筆</span></div>
            </div>
            <button onclick="document.getElementById('import-result-modal').remove(); if(window.loadAccountingRecords) window.loadAccountingRecords(true,1);"
                class="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 font-medium transition">
                確定
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            if (window.loadAccountingRecords) window.loadAccountingRecords(true, 1);
        }
    });
}

export function initExport() {
    // 下拉選單切換
    const exportBtn = document.getElementById('export-records-btn');
    const exportDropdown = document.getElementById('export-dropdown');
    if (exportBtn && exportDropdown) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => {
            exportDropdown.classList.add('hidden');
        });
    }

    // 匯入檔案選擇
    const fileInput = document.getElementById('import-file');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleImportFile(file);
                fileInput.value = ''; // 允許再次選同一個檔案
            }
        });
    }

    // 暴露到全局
    window.exportAccountingRecords = exportAccountingRecords;
    window.importAccountingRecords = importAccountingRecords;

    console.log('✅ [Export] 匯出/匯入功能模組已初始化');
}
