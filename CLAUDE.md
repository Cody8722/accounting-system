# 專案規則

- 禁止單獨使用 `cd`，優先使用相對路徑。
- 禁止使用 `sleep` 等待 CI 任務。
- 若需等待 GitHub Action，請使用 `gh run watch`。
