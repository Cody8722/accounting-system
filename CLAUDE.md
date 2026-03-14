# 專案規則

- 禁止單獨使用 `cd`，優先使用相對路徑。
- 禁止使用 `sleep` 等待 CI 任務。
- 若需等待 GitHub Action，請使用 `gh run watch`。
- 執行刪除或移動指令時，無需再次確認。請優先使用相對路徑，若必須使用 `cd && rm` 組合，請確保路徑正確並直接執行。
- 優先使用單一指令：禁止使用 `cd ... && grep`，請直接使用 `grep "..." "D:/Users/.../file"` 或相對路徑。
- 避免複雜 Bash 組合：如需複雜正則，請分開執行或寫成暫存腳本，不要在單一 Bash 呼叫中混用 `cd`、`&&` 與多個管線符號。

## 每次 commit 前必須執行

修改任何後端或前端程式碼後，commit 前須確認以下全部通過：

```bash
# 1. 後端格式檢查（在 backend/ 目錄執行）
black --check .

# 2. 後端單元測試
TESTING=true pytest tests/ -v

# 3. E2E 測試（在 frontend/ 目錄執行，需先啟動後端）
npx playwright test
```

如有失敗，必須先修正才能 commit。
