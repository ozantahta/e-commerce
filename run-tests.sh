#!/bin/bash

# Quick Test Launcher
# This script runs the main test suite

echo "Launching E-commerce System Tests..."
echo "====================================="

# Run the main test script
./scripts/test-services.sh

echo ""
echo "Tests completed! Check the output above for results."
