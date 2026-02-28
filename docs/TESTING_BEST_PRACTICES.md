# 測試最佳實踐指南

**目的:** 協助團隊撰寫高品質、可維護的測試代碼
**版本:** 1.0
**日期:** 2026-02-28

---

## 📑 目錄

1. [測試命名規範](#測試命名規範)
2. [測試結構 (AAA Pattern)](#測試結構-aaa-pattern)
3. [斷言最佳實踐](#斷言最佳實踐)
4. [Mock 與 Stub](#mock-與-stub)
5. [測試資料管理](#測試資料管理)
6. [常見反模式](#常見反模式)
7. [效能考量](#效能考量)
8. [測試除錯技巧](#測試除錯技巧)

---

## 測試命名規範

### 原則

測試名稱應該清楚描述:
1. **測試什麼** - 被測試的功能/方法
2. **在什麼情況下** - 測試場景/輸入
3. **預期什麼結果** - 預期行為/輸出

### 命名模式

#### Python (pytest)

```python
# ✅ 好的命名
def test_password_validation_rejects_short_password():
    """密碼長度不足應被拒絕"""
    pass

def test_user_login_succeeds_with_valid_credentials():
    """有效憑證應登入成功"""
    pass

def test_record_creation_fails_when_amount_is_negative():
    """金額為負數時新增記錄應失敗"""
    pass

# ❌ 避免的命名
def test_password():  # 太模糊
    pass

def test_1():  # 沒有意義
    pass

def test_user_can_do_something():  # 不夠具體
    pass
```

**命名格式:**
```
test_<功能>_<場景>_<預期結果>()

範例:
test_login_fails_with_wrong_password()
test_budget_calculation_includes_all_categories()
test_export_csv_escapes_special_characters()
```

#### JavaScript (Vitest/Jest)

```javascript
// ✅ 好的命名
describe('EventBus', () => {
  describe('on/emit', () => {
    it('should trigger callback when event is emitted', () => {});
    it('should support multiple listeners for same event', () => {});
    it('should not trigger listeners of different events', () => {});
  });

  describe('off', () => {
    it('should remove specific listener', () => {});
    it('should only remove specified callback', () => {});
  });
});

// ❌ 避免的命名
describe('EventBus', () => {
  it('works', () => {});  // 太模糊
  it('test 1', () => {});  // 沒有意義
  it('should do something', () => {});  // 不夠具體
});
```

**命名格式:**
```
describe('<模組/類別>', () => {
  describe('<方法/功能>', () => {
    it('should <預期行為> when <場景>', () => {});
  });
});
```

---

## 測試結構 (AAA Pattern)

### Arrange-Act-Assert 模式

每個測試應遵循 AAA 模式:

1. **Arrange** (準備) - 設定測試環境和資料
2. **Act** (執行) - 執行被測試的功能
3. **Assert** (斷言) - 驗證結果

### Python 範例

```python
def test_user_can_add_expense_record(client, auth_headers):
    # Arrange - 準備測試資料
    record_data = {
        "type": "expense",
        "amount": 100.50,
        "category": "午餐",
        "date": "2026-02-28",
        "description": "便當"
    }

    # Act - 執行操作
    response = client.post(
        "/admin/api/accounting/records",
        json=record_data,
        headers=auth_headers
    )

    # Assert - 驗證結果
    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    assert data["record"]["amount"] == 100.50
    assert data["record"]["category"] == "午餐"
```

### JavaScript 範例

```javascript
test('EventBus should emit events to multiple listeners', () => {
  // Arrange
  const callback1 = vi.fn();
  const callback2 = vi.fn();
  const testData = { message: 'test' };

  EventBus.on('TEST_EVENT', callback1);
  EventBus.on('TEST_EVENT', callback2);

  // Act
  EventBus.emit('TEST_EVENT', testData);

  // Assert
  expect(callback1).toHaveBeenCalledWith(testData);
  expect(callback2).toHaveBeenCalledWith(testData);
  expect(callback1).toHaveBeenCalledTimes(1);
  expect(callback2).toHaveBeenCalledTimes(1);
});
```

### 保持測試簡潔

```javascript
// ✅ 好的測試 - 一個測試只驗證一件事
test('should escape HTML tags', () => {
  expect(escapeHtml('<script>alert("XSS")</script>'))
    .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
});

test('should escape ampersands', () => {
  expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
});

// ❌ 避免 - 一個測試驗證太多事情
test('should escape all special characters', () => {
  expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  expect(escapeHtml('&')).toBe('&amp;');
  expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
  expect(escapeHtml("it's")).toBe('it&#039;s');
  // ... 太多斷言
});
```

---

## 斷言最佳實踐

### 使用具體的斷言

```python
# ✅ 具體的斷言
assert response.status_code == 200
assert user.email == "test@example.com"
assert len(records) == 5

# ❌ 模糊的斷言
assert response.status_code  # 任何非零值都會通過
assert user.email  # 只檢查是否存在
assert records  # 只檢查是否為空
```

### 斷言訊息

```python
# ✅ 包含有用的錯誤訊息
assert response.status_code == 200, \
    f"Expected 200, got {response.status_code}: {response.get_json()}"

assert budget_total == 5000, \
    f"Budget calculation incorrect: expected 5000, got {budget_total}"

# ❌ 沒有訊息,失敗時難以除錯
assert response.status_code == 200
assert budget_total == 5000
```

### 使用語意化的斷言方法

```javascript
// ✅ 使用語意化方法
expect(page.locator('.toast-success')).toBeVisible();
expect(array).toHaveLength(5);
expect(email).toContain('@');
expect(number).toBeGreaterThan(0);

// ❌ 使用基本相等比較
expect(page.locator('.toast-success').isVisible()).toBe(true);
expect(array.length).toBe(5);
expect(email.includes('@')).toBe(true);
expect(number > 0).toBe(true);
```

---

## Mock 與 Stub

### 何時使用 Mock

Mock 用於:
- 隔離外部依賴 (API、資料庫、檔案系統)
- 測試錯誤處理
- 加速測試執行
- 驗證函數調用

### Python Mock 範例

```python
from unittest.mock import Mock, patch

def test_send_email_on_password_reset(client):
    # Mock email 服務
    with patch('main.send_email') as mock_send:
        response = client.post('/api/auth/forgot-password', json={
            "email": "test@example.com"
        })

        # 驗證 email 函數被呼叫
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert kwargs['to'] == "test@example.com"
        assert "重設密碼" in kwargs['subject']
```

### JavaScript Mock 範例

```javascript
import { vi } from 'vitest';

test('should call API when adding record', async () => {
  // Mock fetch
  const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, record: { id: '123' } }),
  });

  await addRecord({ amount: 100, category: '午餐' });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/accounting/records'),
    expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
    })
  );

  mockFetch.mockRestore();
});
```

### 避免過度 Mock

```python
# ❌ 過度 Mock - 測試失去意義
def test_calculate_total_with_mocks():
    mock_record1 = Mock(amount=100)
    mock_record2 = Mock(amount=200)
    mock_records = [mock_record1, mock_record2]

    # 這只是在測試 Mock,不是真實邏輯
    total = sum(r.amount for r in mock_records)
    assert total == 300

# ✅ 使用真實資料
def test_calculate_total_with_real_data():
    records = [
        {"amount": 100, "type": "expense"},
        {"amount": 200, "type": "expense"}
    ]

    total = calculate_total(records)
    assert total == 300
```

---

## 測試資料管理

### 使用 Fixture 和 Factory

#### Python Fixture

```python
# conftest.py
@pytest.fixture
def sample_user():
    """返回測試用戶資料"""
    return {
        "email": "test@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": "Test User"
    }

@pytest.fixture
def unique_user():
    """每次返回唯一用戶"""
    timestamp = datetime.now().timestamp()
    return {
        "email": f"test-{timestamp}@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": f"User {timestamp}"
    }

# 測試文件中使用
def test_user_registration(client, unique_user):
    response = client.post('/api/auth/register', json=unique_user)
    assert response.status_code == 200
```

#### JavaScript Factory

```javascript
// test-data.js
export function createMockUser(overrides = {}) {
  return {
    email: `test-${Date.now()}@example.com`,
    password: 'MyS3cur3P@ssw0rd!XyZ',
    name: 'Test User',
    ...overrides,
  };
}

export function createMockRecord(overrides = {}) {
  return {
    type: 'expense',
    amount: 100,
    category: '午餐',
    date: new Date().toISOString().split('T')[0],
    ...overrides,
  };
}

// 測試中使用
test('should register user', async () => {
  const user = createMockUser({ name: 'Custom Name' });
  await registerUser(user);
  // ...
});
```

### 測試資料清理

```python
@pytest.fixture
def clean_db(db):
    """測試後清理資料庫"""
    yield
    # 清理測試資料
    db.users.delete_many({"email": {"$regex": "^test-"}})
    db.records.delete_many({"user_id": {"$regex": "^test-"}})
```

### 避免硬編碼

```javascript
// ❌ 硬編碼測試資料
test('should filter records by date', () => {
  const records = filterRecords('2026-02-28');
  expect(records.length).toBe(5);  // 這個數字哪來的?
});

// ✅ 使用有意義的變數
test('should filter records by date', () => {
  const testDate = '2026-02-28';
  const expectedRecordCount = 5;

  const records = filterRecords(testDate);

  expect(records.length).toBe(expectedRecordCount);
  expect(records.every(r => r.date === testDate)).toBe(true);
});
```

---

## 常見反模式

### 1. 測試實作細節

```javascript
// ❌ 測試實作細節 (內部狀態)
test('EventBus implementation', () => {
  EventBus.on('TEST', () => {});
  expect(EventBus._listeners.TEST).toBeDefined();  // 測試私有屬性
  expect(EventBus._listeners.TEST.length).toBe(1);
});

// ✅ 測試公開 API
test('EventBus should register listeners', () => {
  const callback = vi.fn();
  EventBus.on('TEST', callback);
  EventBus.emit('TEST');
  expect(callback).toHaveBeenCalled();  // 測試行為
});
```

### 2. 測試間相互依賴

```python
# ❌ 測試相互依賴
class TestUserFlow:
    user_id = None  # 共享狀態

    def test_1_create_user(self):
        # 創建用戶
        self.user_id = "123"

    def test_2_update_user(self):
        # 依賴 test_1 的結果
        update_user(self.user_id, ...)

# ✅ 測試獨立
class TestUserFlow:
    def test_create_user(self, client):
        # 獨立測試
        user = create_user(...)
        assert user.id is not None

    def test_update_user(self, client):
        # 自己準備資料
        user = create_user(...)
        updated = update_user(user.id, ...)
        assert updated.name == "New Name"
```

### 3. 過度使用 sleep/timeout

```javascript
// ❌ 使用固定延遲
test('should show success message', async () => {
  await submitForm();
  await new Promise(r => setTimeout(r, 3000));  // 等待 3 秒
  expect(getSuccessMessage()).toBeVisible();
});

// ✅ 使用自動等待
test('should show success message', async () => {
  await submitForm();
  await expect(page.locator('.success-message')).toBeVisible();
});
```

### 4. 忽略錯誤處理

```python
# ❌ 只測試成功路徑
def test_login(client):
    response = client.post('/api/auth/login', json={
        "email": "test@example.com",
        "password": "correct"
    })
    assert response.status_code == 200

# ✅ 同時測試錯誤情況
def test_login_with_wrong_password(client):
    response = client.post('/api/auth/login', json={
        "email": "test@example.com",
        "password": "wrong"
    })
    assert response.status_code == 401
    assert "Invalid credentials" in response.get_json()["error"]
```

---

## 效能考量

### 測試執行速度

```python
# ✅ 使用標記區分快慢測試
@pytest.mark.unit  # 快速測試
def test_password_validation():
    pass

@pytest.mark.slow  # 慢速測試
def test_full_user_journey():
    pass

# 執行快速測試
# pytest -m "unit and not slow"
```

### 並行執行

```bash
# Python - 使用 pytest-xdist
pytest -n auto  # 自動決定 worker 數量

# JavaScript - Vitest 預設並行
vitest --threads --maxThreads=4
```

### 資料庫優化

```python
# ✅ 使用 transaction rollback (如果支援)
@pytest.fixture
def db_session():
    session = db.create_session()
    yield session
    session.rollback()  # 測試後回滾

# ✅ 使用 in-memory DB
# mongomock 用於 MongoDB
# sqlite::memory: 用於 SQL
```

---

## 測試除錯技巧

### Python 除錯

```python
# 1. 使用 pytest 的 -v 和 -s 標誌
# pytest -vv -s  # 詳細輸出 + print 語句

# 2. 使用 pytest.set_trace()
def test_complex_logic():
    result = some_function()
    import pdb; pdb.set_trace()  # 設定斷點
    assert result == expected

# 3. 使用 --pdb 在失敗時自動進入除錯器
# pytest --pdb

# 4. 只運行特定測試
# pytest tests/test_auth.py::TestPasswordValidation::test_weak_password
```

### JavaScript 除錯

```javascript
// 1. 使用 .only 只運行特定測試
test.only('debug this test', () => {
  // ...
});

// 2. 使用 console.log
test('something', () => {
  console.log('Debug info:', someValue);
  // ...
});

// 3. Playwright debug mode
// npx playwright test --debug

// 4. Vitest UI mode
// npm run test:ui
```

### 常用除錯命令

```bash
# Backend
pytest -vv --pdb --pdbcls=IPython.terminal.debugger:TerminalPdb
pytest --lf  # 只運行上次失敗的測試
pytest --ff  # 先運行上次失敗的,再運行其他

# Frontend
npm run test:ui  # Vitest UI
npm run test:debug  # Debug mode
npx playwright test --debug  # Playwright debug
```

---

## 總結檢查清單

### 撰寫新測試時檢查:

- [ ] 測試名稱清楚描述測試內容
- [ ] 遵循 AAA 模式 (Arrange-Act-Assert)
- [ ] 一個測試只驗證一件事
- [ ] 使用具體、語意化的斷言
- [ ] 測試獨立,不依賴其他測試
- [ ] 包含錯誤情況測試
- [ ] 使用 fixture/factory 而非硬編碼資料
- [ ] 適當使用 Mock,但不過度
- [ ] 測試行為,不測試實作細節
- [ ] 測試執行速度合理

### Code Review 時檢查:

- [ ] 測試覆蓋了新增/修改的代碼
- [ ] 測試名稱符合規範
- [ ] 沒有測試反模式
- [ ] 測試在 CI 中通過
- [ ] 覆蓋率沒有下降
- [ ] 沒有被跳過的測試 (skip/xfail)

---

## 參考資源

**書籍:**
- "Testing Python" by David Sale
- "JavaScript Testing Best Practices" by Yoni Goldberg

**文章:**
- [pytest Best Practices](https://docs.pytest.org/en/latest/goodpractices.html)
- [Vitest Best Practices](https://vitest.dev/guide/best-practices.html)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

**工具文檔:**
- [pytest Documentation](https://docs.pytest.org/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

---

**版本:** 1.0
**最後更新:** 2026-02-28
**維護者:** Development Team
