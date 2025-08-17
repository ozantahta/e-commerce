#!/bin/bash

# Simple E-commerce Service Test
# Test all services quickly and easily

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing E-commerce Services${NC}"
echo "============================"

# Test 1: Health Checks
echo "Testing Health Checks..."
echo "Order Service:"
curl -s http://localhost:3001/health | jq '.status, .service, .uptime' 2>/dev/null || echo "Order service not responding"
echo ""

echo "Inventory Service:"
curl -s http://localhost:3002/health | jq '.status, .service, .uptime' 2>/dev/null || echo "Inventory service not responding"
echo ""

echo "Notification Service:"
curl -s http://localhost:3003/health | jq '.status, .service, .uptime' 2>/dev/null || echo "Notification service not responding"
echo ""

# Test 2: Create an Order
echo "Testing Order Creation..."
order_response=$(curl -s -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "TEST_CUST_001",
    "items": [
      {
        "productId": "LAPTOP001",
        "name": "Laptop",
        "quantity": 1,
        "price": 999.99
      }
    ]
  }')

if echo "$order_response" | jq -e '.success' > /dev/null 2>&1; then
    success=$(echo "$order_response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        order_id=$(echo "$order_response" | jq -r '.data.orderId')
        echo -e "${GREEN}[SUCCESS] Order created: $order_id${NC}"
        
        # Test 3: Get the order
        echo "Testing Order Retrieval..."
        retrieved_order=$(curl -s http://localhost:3001/api/orders/$order_id)
        if echo "$retrieved_order" | jq -e '.success' > /dev/null 2>&1; then
            success=$(echo "$retrieved_order" | jq -r '.success')
            if [ "$success" = "true" ]; then
                echo -e "${GREEN}[SUCCESS] Order retrieved successfully${NC}"
            else
                echo -e "${RED}[FAILED] Failed to retrieve order: $retrieved_order${NC}"
            fi
        else
            echo -e "${RED}[FAILED] Failed to retrieve order: $retrieved_order${NC}"
        fi
    else
        echo -e "${RED}[FAILED] Failed to create order: $order_response${NC}"
    fi
else
            echo -e "${RED}[FAILED] Failed to create order: $order_response${NC}"
fi
echo ""

# Test 4: Check Products
echo "Testing Product Listing..."
products=$(curl -s http://localhost:3002/api/products)
if echo "$products" | jq -e '.[0]' > /dev/null 2>&1; then
    product_count=$(echo "$products" | jq 'length' 2>/dev/null || echo "0")
    echo -e "${GREEN}[SUCCESS] Found $product_count products${NC}"
else
    echo -e "${RED}[FAILED] No products found${NC}"
fi
echo ""

# Test 5: Check RabbitMQ
echo "Testing RabbitMQ..."
if curl -s -u admin:admin123 http://localhost:15672/api/overview > /dev/null; then
    echo -e "${GREEN}[SUCCESS] RabbitMQ management accessible${NC}"
    queue_count=$(curl -s -u admin:admin123 http://localhost:15672/api/queues | jq '.length' 2>/dev/null || echo "0")
    echo -e "${BLUE}[INFO] Queues found: $queue_count${NC}"
else
    echo -e "${RED}[FAILED] RabbitMQ management not accessible${NC}"
fi
echo ""

# Test 6: Event Flow Test
echo "Testing Event Flow..."
echo "   Creating test order to trigger events..."
event_order=$(curl -s -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "EVENT_TEST_001",
    "items": [
      {
        "productId": "PHONE001",
        "name": "Smartphone",
        "quantity": 1,
        "price": 699.99
      }
    ]
  }')

if echo "$event_order" | jq -e '.success' > /dev/null 2>&1; then
    success=$(echo "$event_order" | jq -r '.success')
    if [ "$success" = "true" ]; then
        event_order_id=$(echo "$event_order" | jq -r '.data.orderId')
        echo -e "${GREEN}[SUCCESS] Event order created: $event_order_id, waiting for processing...${NC}"
        
        # Wait a bit for event processing
        sleep 3
        
        # Check if notification was created
        notification_check=$(curl -s "http://localhost:3003/api/notifications/recipient/EVENT_TEST_001")
        if echo "$notification_check" | jq -e '.[0]' > /dev/null 2>&1; then
            echo -e "${GREEN}[SUCCESS] Event flow working - notification created${NC}"
        else
            echo -e "${YELLOW}[WARNING] Event flow - no notification found yet${NC}"
        fi
    else
        echo -e "${RED}[FAILED] Failed to create event order: $event_order${NC}"
    fi
else
            echo -e "${RED}[FAILED] Failed to create event order: $event_order${NC}"
fi
echo ""

echo -e "${GREEN}Testing completed!${NC}"
echo ""
echo -e "${BLUE}Access your services:${NC}"
echo "  Order Service: http://localhost:3001"
echo "  Inventory Service: http://localhost:3002"
echo "  Notification Service: http://localhost:3003"
echo "  RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo -e "${YELLOW}View logs: sudo docker-compose logs -f [service-name]${NC}"
