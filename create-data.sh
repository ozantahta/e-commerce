#!/bin/bash

# Quick Sample Data Launcher
# This script creates sample data for testing

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Creating Sample Data for E-commerce System...${NC}"
echo "============================================"

# Run the sample data creation script
./scripts/create-sample-data.sh

echo ""
echo -e "${GREEN}Sample data creation completed!${NC}"
