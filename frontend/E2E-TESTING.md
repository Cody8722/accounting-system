# E2E Testing Guide

This guide explains how to run end-to-end (E2E) tests for the accounting system.

## Prerequisites

1. **MongoDB**: Must be running on `localhost:27017`
   ```bash
   mongod --dbpath /path/to/data
   ```

2. **Node.js**: Version 20 or higher
3. **Python**: Version 3.11 or higher

## Quick Start

### Option 1: Using the Test Runner Script (Recommended)

Run from the project root:

```bash
./run-e2e-tests.sh
```

This script will:
- Check that MongoDB is running
- Start the backend server
- Wait for the backend to be ready
- Run the E2E tests
- Clean up processes after tests complete

### Option 2: Manual Setup

#### Step 1: Start MongoDB

```bash
mongod --dbpath /path/to/data
```

#### Step 2: Start Backend Server

```bash
cd backend
export MONGO_URI=mongodb://localhost:27017/test_db
export JWT_SECRET=test-jwt-secret-key-for-e2e
export ADMIN_SECRET=test-admin-secret-key
export GMAIL_USER=test@example.com
export GMAIL_APP_PASSWORD=test-password
export TESTING=true
python main.py
```

#### Step 3: Run Tests

In a new terminal:

```bash
cd frontend
export BASE_URL=http://localhost:8080
npx playwright test
```

## Running Specific Tests

### Run only Chromium tests
```bash
cd frontend
npx playwright test --project=chromium
```

### Run only Firefox tests
```bash
cd frontend
npx playwright test --project=firefox
```

### Run a specific test file
```bash
cd frontend
npx playwright test tests/e2e/auth.spec.js
```

### Run tests in headed mode (see the browser)
```bash
cd frontend
npx playwright test --headed
```

### Run tests in debug mode
```bash
cd frontend
npx playwright test --debug
```

## Test Reports

### View HTML report
```bash
cd frontend
npx playwright show-report
```

### View trace for failed tests
```bash
cd frontend
npx playwright show-trace test-results/path-to-trace.zip
```

## Common Issues

### Backend not running
**Error**: Tests timeout waiting for success/error messages

**Solution**: Ensure the backend server is running on `http://localhost:5001`

```bash
curl http://localhost:5001/api/health
```

### MongoDB not running
**Error**: Backend fails to start

**Solution**: Start MongoDB
```bash
mongod --dbpath /path/to/data
```

### Navigation interruption errors
**Error**: `Navigation to "http://localhost:8080/#register" is interrupted`

**Solution**: This has been fixed in the latest code. Make sure you're using the latest version from the repository.

### SweetAlert2 not loading
**Error**: Tests timeout waiting for `.swal2-success` or `.swal2-error`

**Solution**:
1. Ensure the backend is running (registration won't work without it)
2. Check browser console for JavaScript errors
3. Verify SweetAlert2 CDN is accessible

## Test Structure

```
frontend/tests/
├── e2e/                    # End-to-end test specs
│   ├── auth.spec.js        # Authentication tests
│   ├── budget-stats.spec.js # Budget and statistics tests
│   ├── records.spec.js     # Record CRUD tests
│   └── settings.spec.js    # Settings tests
├── helpers/                # Test helper functions
│   ├── auth.helpers.js     # Authentication helpers
│   ├── record.helpers.js   # Record helpers
│   └── wait.helpers.js     # Wait utilities
└── fixtures/               # Test data
    └── test-data.js        # Sample test data
```

## CI/CD

Tests automatically run on:
- Push to `main`, `develop`, or `claude/**` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

See `.github/workflows/e2e-tests.yml` for CI configuration.

## Debugging Tips

1. **Check backend logs**: If registration fails, check backend console output
2. **Use headed mode**: Run tests with `--headed` to see what's happening
3. **Use debug mode**: Run tests with `--debug` to step through test execution
4. **Check screenshots**: Failed tests automatically capture screenshots in `test-results/`
5. **Check videos**: Failed tests automatically record videos in `test-results/`
6. **Check traces**: Retried tests capture traces for debugging

## Recent Fixes

### Navigation Guard Fix (2024)
Fixed an issue where the app would redirect to login even when users were trying to access the register page. The auth guard now respects the current hash and doesn't force a redirect if already on an auth page (`#login`, `#register`, `#forgot-password`).
