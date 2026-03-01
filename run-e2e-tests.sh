#!/bin/bash

# E2E Test Runner Script
# This script starts all required services and runs the E2E tests

set -e

echo "🚀 Starting E2E Test Environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if MongoDB is running
echo -e "${YELLOW}Checking MongoDB...${NC}"
if ! pgrep -x "mongod" > /dev/null; then
    echo -e "${RED}❌ MongoDB is not running. Please start MongoDB first.${NC}"
    echo "   Run: mongod --dbpath /path/to/data"
    exit 1
fi
echo -e "${GREEN}✅ MongoDB is running${NC}"

# Start backend server in background
echo -e "${YELLOW}Starting backend server...${NC}"
cd backend
export MONGO_URI=mongodb://localhost:27017/test_db
export JWT_SECRET=test-jwt-secret-key-for-e2e
export ADMIN_SECRET=test-admin-secret-key
export GMAIL_USER=test@example.com
export GMAIL_APP_PASSWORD=test-password
export TESTING=true

# Kill any existing backend process
pkill -f "python.*main.py" 2>/dev/null || true

# Start backend
python main.py > /tmp/backend-e2e.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"

cd ..

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5001/api/health > /dev/null 2>&1 || curl -s http://localhost:5001/ > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is ready${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}❌ Backend failed to start${NC}"
        echo "Backend logs:"
        tail -n 50 /tmp/backend-e2e.log
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Run E2E tests
echo -e "${YELLOW}Running E2E tests...${NC}"
cd frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

# Install Playwright browsers if needed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo -e "${YELLOW}Installing Playwright browsers...${NC}"
    npx playwright install chromium --with-deps
fi

# Run tests
export BASE_URL=http://localhost:8080
npx playwright test --project=chromium

TEST_EXIT_CODE=$?

# Cleanup
echo -e "${YELLOW}Cleaning up...${NC}"
kill $BACKEND_PID 2>/dev/null || true
echo -e "${GREEN}✅ Cleanup complete${NC}"

# Exit with test exit code
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✨ All tests passed!${NC}"
else
    echo -e "${RED}❌ Some tests failed${NC}"
fi

exit $TEST_EXIT_CODE
