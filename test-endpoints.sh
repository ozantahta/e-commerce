#!/bin/bash
# Quick Endpoint Test Launcher
# This script runs the comprehensive endpoint testing

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Launching Comprehensive Endpoint Testing...${NC}"
echo "=========================================="

# Run the comprehensive endpoint testing script
./scripts/test-all-endpoints.sh

echo ""
echo -e "${GREEN}Endpoint testing completed! Check the output above for results.${NC}"
