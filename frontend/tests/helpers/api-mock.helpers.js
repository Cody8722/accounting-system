/**
 * API Mock 輔助函數
 * 攔截所有 backend API 呼叫，返回模擬回應
 */

const BACKEND_URL = 'http://localhost:5001';

// 模擬用戶資料庫
const mockUsers = new Map();
// 模擬記錄資料庫
let mockRecords = [];
let recordIdCounter = 1;
// 模擬預算資料
let mockBudget = {};

/**
 * 設置所有 API 路由的 mock
 * @param {import('@playwright/test').Page} page
 */
export async function setupApiMocks(page) {
  // Reset mock data
  mockUsers.clear();
  mockRecords = [];
  recordIdCounter = 1;
  mockBudget = {};

  await page.route(`${BACKEND_URL}/**`, async (route, request) => {
    const url = request.url();
    const method = request.method();
    const path = url.replace(BACKEND_URL, '');

    try {
      // Auth routes
      if (path === '/api/auth/register' && method === 'POST') {
        return await handleRegister(route, request);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(route, request);
      }
      if (path === '/api/auth/verify') {
        return await handleVerify(route, request);
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        return await handleLogout(route);
      }
      if (path === '/api/auth/validate-password' && method === 'POST') {
        return await handleValidatePassword(route, request);
      }

      // User routes
      if (path === '/api/user/profile' && method === 'PUT') {
        return await handleUpdateProfile(route, request);
      }
      if (path === '/api/user/change-password' && method === 'POST') {
        return await handleChangePassword(route, request);
      }

      // Accounting routes
      if (path === '/admin/api/accounting/records' && method === 'POST') {
        return await handleAddRecord(route, request);
      }
      if (path === '/admin/api/accounting/records' && method === 'GET') {
        return await handleGetRecords(route, request);
      }
      if (path.startsWith('/admin/api/accounting/records/') && method === 'PUT') {
        return await handleUpdateRecord(route, request, path);
      }
      if (path.startsWith('/admin/api/accounting/records/') && method === 'DELETE') {
        return await handleDeleteRecord(route, request, path);
      }
      if (path.match(/^\/admin\/api\/accounting\/records\?/) || path === '/admin/api/accounting/records?') {
        return await handleGetRecords(route, request);
      }

      // Budget routes
      if (path === '/admin/api/accounting/budget' && method === 'GET') {
        return await handleGetBudget(route);
      }
      if (path === '/admin/api/accounting/budget' && method === 'POST') {
        return await handleSaveBudget(route, request);
      }

      // Default: return 404
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' })
      });
    } catch (error) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: error.message })
      });
    }
  });
}

async function handleRegister(route, request) {
  const body = JSON.parse(request.postData());
  const { name, email, password } = body;

  if (mockUsers.has(email)) {
    return await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: '此 Email 已被註冊' })
    });
  }

  // Validate password strength (basic)
  if (password.length < 12) {
    return await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: '密碼不符合安全要求' })
    });
  }

  mockUsers.set(email, { name, email, password });

  return await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ message: '註冊成功' })
  });
}

async function handleLogin(route, request) {
  const body = JSON.parse(request.postData());
  const { email, password } = body;

  const user = mockUsers.get(email);
  if (!user || user.password !== password) {
    // 使用 400 而非 401，因為 apiCall 會攔截 401 並隱藏錯誤訊息
    return await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: '帳號或密碼錯誤' })
    });
  }

  const token = `mock-token-${Date.now()}`;

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token,
      user: { name: user.name, email: user.email }
    })
  });
}

async function handleVerify(route, request) {
  const authHeader = request.headers()['authorization'];
  if (authHeader && authHeader.startsWith('Bearer mock-token-')) {
    return await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true })
    });
  }

  return await route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: '未授權' })
  });
}

async function handleLogout(route) {
  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '已登出' })
  });
}

async function handleValidatePassword(route, request) {
  const body = JSON.parse(request.postData());
  const { password, email, name } = body;

  const checks = {
    length: { passed: password.length >= 12, message: '至少 12 個字元' },
    uppercase: { passed: /[A-Z]/.test(password), message: '包含大寫字母 (A-Z)' },
    lowercase: { passed: /[a-z]/.test(password), message: '包含小寫字母 (a-z)' },
    digit: { passed: /[0-9]/.test(password), message: '包含數字 (0-9)' },
    special: { passed: /[!@#$%^&*]/.test(password), message: '包含特殊符號' },
    repeating: { passed: !/(.)\1{2,}/.test(password), message: '無重複字符' },
    sequential: { passed: true, message: '無連續字符' },
    keyboard_pattern: { passed: true, message: '無鍵盤模式' },
    common_password: { passed: !['123456', 'password', 'qwerty'].includes(password.toLowerCase()), message: '非常見密碼' },
    personal_info: { passed: true, message: '不含個人資訊' },
    chinese_pinyin: { passed: true, message: '無拼音模式' },
    math_pattern: { passed: true, message: '無數學模式' },
    entropy: { passed: password.length >= 8, message: '複雜度足夠' }
  };

  const passedCount = Object.values(checks).filter(c => c.passed).length;
  const isValid = passedCount >= 10;

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ valid: isValid, checks })
  });
}

async function handleUpdateProfile(route, request) {
  const body = JSON.parse(request.postData());
  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '更新成功', user: body })
  });
}

async function handleChangePassword(route, request) {
  const body = JSON.parse(request.postData());

  if (body.new_password && body.new_password.length < 12) {
    return await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: '新密碼不符合安全要求' })
    });
  }

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '密碼已更新' })
  });
}

async function handleAddRecord(route, request) {
  const body = JSON.parse(request.postData());
  const record = {
    _id: { $oid: `mock-record-${recordIdCounter++}` },
    ...body,
    created_at: new Date().toISOString()
  };
  mockRecords.push(record);

  return await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify(record)
  });
}

async function handleGetRecords(route) {
  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockRecords)
  });
}

async function handleUpdateRecord(route, request, path) {
  const recordId = path.split('/').pop();
  const body = JSON.parse(request.postData());

  const index = mockRecords.findIndex(r => r._id.$oid === recordId);
  if (index >= 0) {
    mockRecords[index] = { ...mockRecords[index], ...body };
  }

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '更新成功' })
  });
}

async function handleDeleteRecord(route, request, path) {
  const recordId = path.split('/').pop();
  mockRecords = mockRecords.filter(r => r._id.$oid !== recordId);

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '刪除成功' })
  });
}

async function handleGetBudget(route) {
  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockBudget)
  });
}

async function handleSaveBudget(route, request) {
  const body = JSON.parse(request.postData());
  mockBudget = { ...mockBudget, ...body };

  return await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ message: '預算已儲存' })
  });
}
