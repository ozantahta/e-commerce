#!/bin/bash

# Comprehensive Unit Test Runner for E-commerce System
# This script runs all unit tests across all services and generates coverage reports

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}[SUCCESS] $message${NC}"
    elif [ "$status" = "FAILED" ]; then
        echo -e "${RED}[FAILED] $message${NC}"
    elif [ "$status" = "INFO" ]; then
        echo -e "${BLUE}[INFO] $message${NC}"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}[WARNING] $message${NC}"
    fi
}

echo "=========================================="
echo "COMPREHENSIVE UNIT TESTING"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_status "FAILED" "Please run this script from the e-commerce project root directory"
    exit 1
fi

# Install dependencies if needed
print_status "INFO" "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_status "INFO" "Installing root dependencies..."
    npm install
fi

# Test Shared Utilities
echo ""
print_status "INFO" "Testing Shared Utilities..."
cd shared
if npm test --silent; then
    print_status "SUCCESS" "Shared utilities tests passed"
else
    print_status "FAILED" "Shared utilities tests failed"
    cd ..
    exit 1
fi
cd ..

# Test Order Service
echo ""
print_status "INFO" "Testing Order Service..."
cd services/order-service
if npm test --silent; then
    print_status "SUCCESS" "Order service tests passed"
else
    print_status "FAILED" "Order service tests failed"
    cd ../..
    exit 1
fi
cd ../..

# Test Inventory Service
echo ""
print_status "INFO" "Testing Inventory Service..."
cd services/inventory-service
if npm test --silent; then
    print_status "SUCCESS" "Inventory service tests passed"
else
    print_status "FAILED" "Inventory service tests failed"
    cd ../..
    exit 1
fi
cd ../..

# Test Notification Service
echo ""
print_status "INFO" "Testing Notification Service..."
cd services/notification-service
if npm test --silent; then
    print_status "SUCCESS" "Notification service tests passed"
else
    print_status "FAILED" "Notification service tests failed"
    cd ../..
    exit 1
fi
cd ../..

# Run all tests from root
echo ""
print_status "INFO" "Running all tests from root..."
if npm test --silent; then
    print_status "SUCCESS" "All tests passed successfully!"
else
    print_status "FAILED" "Some tests failed"
    exit 1
fi

# Generate coverage summary
echo ""
print_status "INFO" "Generating coverage summary..."
echo "=========================================="
echo "COVERAGE SUMMARY"
echo "=========================================="

# Check coverage for each service
services=("order-service" "inventory-service" "notification-service")
for service in "${services[@]}"; do
    if [ -d "services/$service/coverage" ]; then
        echo ""
        print_status "INFO" "$service Coverage:"
        if [ -f "services/$service/coverage/coverage-summary.txt" ]; then
            cat "services/$service/coverage/coverage-summary.txt"
        else
            echo "  Coverage report not found"
        fi
    fi
done

# Check shared utilities coverage
if [ -d "shared/coverage" ]; then
    echo ""
    print_status "INFO" "Shared Utilities Coverage:"
    if [ -f "shared/coverage/coverage-summary.txt" ]; then
        cat "shared/coverage/coverage-summary.txt"
    else
        echo "  Coverage report not found"
    fi
fi

echo ""
print_status "SUCCESS" "Unit testing completed successfully!"
print_status "INFO" "Coverage reports available in each service's coverage/ directory"
print_status "INFO" "Open coverage/lcov-report/index.html in your browser for detailed coverage"

echo ""
echo "=========================================="
echo "TESTING COMPLETED"
echo "=========================================="
