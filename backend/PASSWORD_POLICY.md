# 密碼安全策略

## 📋 概述

本系統採用嚴格的密碼驗證規則，確保用戶帳號安全。所有密碼要求都可以通過環境變數進行配置。

## 🔒 預設密碼要求

### 基本要求
- ✅ **最小長度**: 12 個字元
- ✅ **大寫字母**: 必須包含 A-Z
- ✅ **小寫字母**: 必須包含 a-z
- ✅ **數字**: 必須包含 0-9
- ✅ **特殊符號**: 必須包含 !@#$%^&*() 等

### 安全檢查
- ❌ **重複字符**: 不能有 3 個或以上相同字符（如 `aaa`、`111`）
- ❌ **連續字符**: 不能有 4 個或以上連續字符（如 `abcd`、`1234`、`dcba`）
- ❌ **鍵盤模式**: 不能使用鍵盤相鄰按鍵（如 `qwer`、`asdf`、`1qaz`）
- ❌ **常見密碼**: 拒絕 50+ 個常見弱密碼
- ❌ **個人資訊**: 不能包含 Email 地址或姓名
- ❌ **數學模式**: 不能使用費式數列、平方數等（如 `112358`、`1491625`）
- ❌ **中文拼音**: 不能使用常見中文拼音（如 `woaini`、`zhongguo`）
- ✅ **複雜度**: 熵值需達到 50 bits 以上

## 📊 密碼強度評級

密碼會根據通過的檢查項目數量進行評級：

| 通過率 | 評級 | 顏色 | 建議 |
|--------|------|------|------|
| < 40% | 弱 | 🔴 紅色 | 請增加字符種類和長度 |
| 40-69% | 中 | 🟡 黃色 | 建議添加更多複雜字符 |
| 70-89% | 強 | 🔵 藍色 | 良好，可以使用 |
| ≥ 90% | 非常強 | 🟢 綠色 | 優秀！ |

## 🎯 即時密碼驗證

註冊時，系統會即時顯示密碼強度和未通過的規則：

```
密碼要求：
✅ 至少 12 個字元
✅ 包含大寫字母 (A-Z)
✅ 包含小寫字母 (a-z)
✅ 包含數字 (0-9)
❌ 包含特殊符號 (!@#$%^&* 等)  ← 未通過
✅ 無重複字符 (如 aaa)
✅ 無連續字符 (如 abcd, 1234)
...

強度：強 ███████████░░░ 85%
```

## ⚙️ 配置管理

### 查看當前配置

```bash
python manage_password_rules.py show
```

輸出範例：
```
============================================================================================
📋 當前密碼規則配置
============================================================================================
min_length                | 📊 12       | 最小密碼長度
require_uppercase         | ✅ 啟用     | 需要大寫字母
require_lowercase         | ✅ 啟用     | 需要小寫字母
require_digit             | ✅ 啟用     | 需要數字
require_special           | ✅ 啟用     | 需要特殊符號
check_repeating           | ✅ 啟用     | 檢查重複字符
check_sequential          | ✅ 啟用     | 檢查連續字符
check_keyboard_pattern    | ✅ 啟用     | 檢查鍵盤模式
check_common_passwords    | ✅ 啟用     | 檢查常見密碼
check_personal_info       | ✅ 啟用     | 檢查個人資訊
check_math_patterns       | ✅ 啟用     | 檢查數學模式
check_chinese_pinyin      | ✅ 啟用     | 檢查中文拼音
min_entropy               | 📊 50       | 最小熵值（複雜度）
max_repeating             | 📊 2        | 最大允許重複次數
max_sequential            | 📊 3        | 最大允許連續次數
============================================================================================

👥 用戶統計:
   總用戶數: 5
   需要更新密碼: 0
```

### 啟用/禁用規則

```bash
# 啟用規則（在 .env 中設定為 true）
python manage_password_rules.py enable require_special

# 禁用規則（在 .env 中設定為 false）
python manage_password_rules.py disable check_chinese_pinyin
```

**注意**: 修改 `.env` 檔案後，需要重啟後端服務才能生效。

### 強制用戶更新密碼

當密碼規則變更後，可以強制所有現有用戶更新密碼：

```bash
python manage_password_rules.py force-update
```

用戶下次登入時會被要求更改密碼以符合新規則。

取消強制更新：

```bash
python manage_password_rules.py reset-force
```

## 🔧 環境變數配置

在 `.env` 檔案或環境變數中設定：

```bash
# 基本要求
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SPECIAL=true

# 模式檢查
PASSWORD_CHECK_REPEATING=true
PASSWORD_CHECK_SEQUENTIAL=true
PASSWORD_CHECK_KEYBOARD_PATTERN=true
PASSWORD_CHECK_COMMON_PASSWORDS=true
PASSWORD_CHECK_PERSONAL_INFO=true
PASSWORD_CHECK_MATH_PATTERNS=true
PASSWORD_CHECK_CHINESE_PINYIN=true

# 限制參數
PASSWORD_MAX_REPEATING=2          # 3個以上重複會被拒絕
PASSWORD_MAX_SEQUENTIAL=3         # 4個以上連續會被拒絕
PASSWORD_MIN_ENTROPY=50           # 熵值需≥50 bits
```

## 💡 密碼範例

### ❌ 不安全的密碼

```
password123        # 常見密碼
12345678          # 純數字
abcd1234          # 連續字符
qwer@1234         # 鍵盤模式
john@2024         # 包含Email
woaini123         # 中文拼音
11235813          # 費式數列
Password1         # 太短（<12字元）
P@ssw0rd!         # 常見模式
```

### ✅ 安全的密碼

```
mK9#vL2$wN5p     # 隨機字符組合
Tr!umph@2024Zx   # 長度足夠且複雜
G7$mX#Qp2Wn5     # 混合大小寫、數字、符號
bL9!kP#3Rt8Mx    # 無明顯模式
```

### 🎯 密碼生成建議

1. **使用密碼管理器**: 讓工具生成隨機強密碼
2. **句子法**: 取句子每個字的首字母+符號+數字
   - 例如："I Love Coffee in The Morning!" → `IL C!tM2024#`
3. **混合法**: 隨機單字+符號+數字
   - 例如：`Blue$Sky7@Moon3`

## 🛡️ 密碼儲存

- 使用 **PBKDF2-SHA256** 算法加密
- **29,000 iterations**（OWASP 推薦標準）
- 無法反向解密
- 符合 NIST 和 OWASP 最佳實踐

## 📝 API 端點

### 即時密碼驗證

```http
POST /api/auth/validate-password
Content-Type: application/json

{
  "password": "MyP@ssw0rd123",
  "email": "user@example.com",   // 可選，用於個人資訊檢查
  "name": "John Doe"              // 可選，用於個人資訊檢查
}
```

**回應**:
```json
{
  "valid": false,
  "errors": [
    "密碼必須包含特殊符號",
    "密碼複雜度不足（需要更多字符種類）"
  ],
  "checks": {
    "length": {
      "passed": true,
      "required": 12,
      "actual": 13,
      "message": "長度符合（13 字元）"
    },
    "uppercase": {
      "passed": true,
      "message": "包含大寫字母"
    },
    "special": {
      "passed": false,
      "message": "缺少特殊符號 (!@#$%^&* 等)"
    },
    ...
  }
}
```

### 獲取密碼規則配置

```http
GET /api/auth/password-config
```

**回應**:
```json
{
  "min_length": 12,
  "require_uppercase": true,
  "require_lowercase": true,
  "require_digit": true,
  "require_special": true,
  "max_repeating": 2,
  "max_sequential": 3
}
```

## 🚀 部署建議

### Zeabur

在 Zeabur 環境變數中設定：

```
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
...
```

重新部署後生效。

### Docker

在 `docker-compose.yml` 中：

```yaml
environment:
  - PASSWORD_MIN_LENGTH=12
  - PASSWORD_REQUIRE_UPPERCASE=true
  - PASSWORD_REQUIRE_LOWERCASE=true
```

### Heroku

```bash
heroku config:set PASSWORD_MIN_LENGTH=12
heroku config:set PASSWORD_REQUIRE_UPPERCASE=true
```

## 📚 相關資源

- [OWASP 密碼安全](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST 密碼指南](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [密碼熵值計算](https://en.wikipedia.org/wiki/Password_strength#Entropy_as_a_measure_of_password_strength)

## ❓ FAQ

**Q: 為什麼密碼規則這麼嚴格？**
A: 為了保護您的帳號安全。弱密碼容易被暴力破解或猜測。

**Q: 可以降低密碼要求嗎？**
A: 可以，通過環境變數禁用特定規則。但不建議這麼做。

**Q: 忘記密碼怎麼辦？**
A: 使用「忘記密碼」功能重設密碼（如已實作）。

**Q: 規則更新後，舊密碼還能用嗎？**
A: 可以。但建議使用 `force-update` 命令要求用戶更新密碼。

**Q: 如何生成安全的密碼？**
A: 使用密碼管理器（如 1Password、LastPass、Bitwarden）自動生成。
