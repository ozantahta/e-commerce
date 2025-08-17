#!/bin/bash

# Creating Sample Data for E-commerce System
# This script creates sample products and orders for testing

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Creating Sample Data for E-commerce System${NC}"
echo "=========================================="

# Check if inventory service is running
echo "Checking available endpoints..."
echo "  Testing inventory service health:"
curl -s http://localhost:3002/health | jq '.status, .service' 2>/dev/null || echo -e "${RED}[FAILED] Inventory service not responding${NC}"
echo ""

# Create sample products
echo "Creating sample products..."
echo "  Creating Laptop product..."
laptop_response=$(curl -s -X POST http://localhost:3002/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "High-performance laptop for professionals",
    "price": 999.99,
    "stockQuantity": 50,
    "category": "Electronics",
    "sku": "LAPTOP001"
  }')

echo "  Laptop response: $laptop_response"
echo ""

echo "  Creating Smartphone product..."
smartphone_response=$(curl -s -X POST http://localhost:3002/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smartphone",
    "description": "Latest smartphone with advanced features",
    "price": 699.99,
    "stockQuantity": 100,
    "category": "Electronics",
    "sku": "PHONE001"
  }')

echo "  Smartphone response: $smartphone_response"
echo ""

echo "  Creating Headphones product..."
headphones_response=$(curl -s -X POST http://localhost:3002/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Headphones",
    "description": "Wireless noise-canceling headphones",
    "price": 199.99,
    "stockQuantity": 75,
    "category": "Electronics",
    "sku": "HEAD001"
  }')

echo "  Headphones response: $headphones_response"
echo ""

# Check what products exist
echo "Checking what products exist..."
echo "  GET /api/products response:"
products_response=$(curl -s http://localhost:3002/api/products)
echo "$products_response"
echo ""

# Create inventory entries
echo "Creating inventory entries..."
echo "  Getting created products to set inventory..."
products=$(curl -s http://localhost:3002/api/products)
echo "  Products response: $products"
echo ""

if echo "$products" | jq -e '.[0]' > /dev/null 2>&1; then
    echo "  Products found, setting inventory..."
    echo "  Inventory is already set when products were created"
else
    echo "  No products found, cannot set inventory"
fi
echo ""

# Check inventory endpoints
echo "Checking inventory endpoints..."
echo "  GET /api/inventory response:"
inventory_response=$(curl -s http://localhost:3002/api/inventory)
echo "$inventory_response"
echo ""

echo "  GET /api/inventory/PROD001 response:"
specific_inventory=$(curl -s http://localhost:3002/api/inventory/PROD001)
echo "$specific_inventory"
echo ""

echo -e "${GREEN}Sample data creation completed!${NC}"
echo ""
echo -e "${BLUE}Debug Information:${NC}"
echo "  - Check if inventory service is running: sudo docker-compose ps"
echo "  - View inventory service logs: sudo docker-compose logs -f inventory-service"
echo "  - Check API endpoints: curl http://localhost:3002/health"
echo ""
echo -e "${YELLOW}After fixing issues, run the test script:${NC}"
echo "  ./test-services.sh"
