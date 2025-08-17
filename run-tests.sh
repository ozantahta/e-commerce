#!/bin/bash

# Quick Test Launcher
# This script runs the main test suite

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Launching E-commerce System Tests...${NC}"
echo "====================================="

# Run the main test script
./scripts/test-services.sh

echo ""
echo -e "${GREEN}Tests completed! Check the output above for results.${NC}"
