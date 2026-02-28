/**
 * 測試資料 Fixtures
 */

/**
 * 預設測試用戶
 */
export const defaultTestUser = {
  email: 'test@example.com',
  password: 'MyS3cur3P@ssw0rd!XyZ',
  name: '測試用戶'
};

/**
 * 測試記帳記錄範例
 */
export const sampleRecords = {
  expense: {
    breakfast: {
      type: 'expense',
      amount: 80,
      category: '早餐',
      description: '麥當勞早餐',
      date: new Date().toISOString().split('T')[0]
    },
    lunch: {
      type: 'expense',
      amount: 120,
      category: '午餐',
      description: '便當',
      date: new Date().toISOString().split('T')[0]
    },
    dinner: {
      type: 'expense',
      amount: 200,
      category: '晚餐',
      description: '火鍋',
      date: new Date().toISOString().split('T')[0]
    },
    transport: {
      type: 'expense',
      amount: 50,
      category: '交通',
      description: '捷運',
      date: new Date().toISOString().split('T')[0]
    }
  },
  income: {
    salary: {
      type: 'income',
      amount: 50000,
      category: '薪水',
      description: '月薪',
      date: new Date().toISOString().split('T')[0]
    },
    bonus: {
      type: 'income',
      amount: 10000,
      category: '獎金',
      description: '績效獎金',
      date: new Date().toISOString().split('T')[0]
    }
  }
};

/**
 * 預算設定範例
 */
export const sampleBudgets = {
  breakfast: 2000,
  lunch: 3000,
  dinner: 4000,
  snack: 1000,
  transport: 2000,
  entertainment: 3000,
  shopping: 5000,
  medical: 2000,
  education: 3000,
  other: 2000
};

/**
 * 弱密碼範例（用於負面測試）
 */
export const weakPasswords = [
  '123456',
  'password',
  'abc123',
  '12345678',
  'qwerty',
  'short',
  'nouppercaseornumber',
  'NOLOWERCASE123',
  'NoSpecialChar123'
];

/**
 * 無效的 Email 範例
 */
export const invalidEmails = [
  'invalid',
  'invalid@',
  '@example.com',
  'invalid@.com',
  'invalid..email@example.com'
];

/**
 * 類別列表
 */
export const categories = {
  expense: [
    '早餐', '午餐', '晚餐', '點心',
    '交通', '娛樂', '購物',
    '醫療', '教育', '其他'
  ],
  income: ['薪水', '獎金', '其他']
};
