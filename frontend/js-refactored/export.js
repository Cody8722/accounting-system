/**
 * 匯出功能模組 - 處理記帳記錄匯出（CSV）
 *
 * 功能：
 * - 匯出記帳記錄為 CSV 格式
 * - 支援篩選條件（日期範圍、類型）
 * - 自動下載檔案
 * - 錯誤處理和用戶提示
 *
 * 使用事件驅動架構解耦依賴
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
            const defaultName = format === 'xlsx' ? '記帳記錄.xlsx' : '記帳記錄.csv';
            let filename = defaultName;
            if (contentDisposition) {
                const matches = /filename=([^;]+)/.exec(contentDisposition);
                if (matches && matches[1]) {
                    filename = matches[1].trim();
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
export function initExport() {
    // 下拉選單切換
    const exportBtn = document.getElementById('export-records-btn');
    const exportDropdown = document.getElementById('export-dropdown');
    if (exportBtn && exportDropdown) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown.classList.toggle('hidden');
        });
        // 點選其他地方關閉下拉
        document.addEventListener('click', () => {
            exportDropdown.classList.add('hidden');
        });
    }

    // 暴露到全局（供 HTML onclick 使用）
    window.exportAccountingRecords = exportAccountingRecords;

    console.log('✅ [Export] 匯出功能模組已初始化');
}
