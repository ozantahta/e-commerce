#!/bin/bash

# Simple E-commerce Service Test
# Test all services quickly and easily

echo "Testing E-commerce Services"
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
        echo "Order created: $order_id"
        
        # Test 3: Get the order
        echo "Testing Order Retrieval..."
        retrieved_order=$(curl -s http://localhost:3001/api/orders/$order_id)
        if echo "$retrieved_order" | jq -e '.success' > /dev/null 2>&1; then
            success=$(echo "$retrieved_order" | jq -r '.success')
            if [ "$success" = "true" ]; then
                echo "Order retrieved successfully"
            else
                echo "Failed to retrieve order: $retrieved_order"
            fi
        else
            echo "Failed to retrieve order: $retrieved_order"
        fi
    else
        echo "Failed to create order: $order_response"
    fi
else
    echo "Failed to create order: $order_response"
fi
echo ""

# Test 4: Check Products
echo "Testing Product Listing..."
products=$(curl -s http://localhost:3002/api/products)
if echo "$products" | jq -e '.[0]' > /dev/null 2>&1; then
    product_count=$(echo "$products" | jq 'length' 2>/dev/null || echo "0")
    echo "Found $product_count products"
else
    echo "No products found"
fi
echo ""

# Test 5: Check RabbitMQ
echo "Testing RabbitMQ..."
if curl -s -u admin:admin123 http://localhost:15672/api/overview > /dev/null; then
    echo "RabbitMQ management accessible"
    queue_count=$(curl -s -u admin:admin123 http://localhost:15672/api/queues | jq '.length' 2>/dev/null || echo "0")
    echo "   Queues found: $queue_count"
else
    echo "RabbitMQ management not accessible"
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
        echo "Event order created: $event_order_id, waiting for processing..."
        
        # Wait a bit for event processing
        sleep 3
        
        # Check if notification was created
        notification_check=$(curl -s "http://localhost:3003/api/notifications/recipient/EVENT_TEST_001")
        if echo "$notification_check" | jq -e '.[0]' > /dev/null 2>&1; then
            echo "Event flow working - notification created"
        else
            echo "Event flow - no notification found yet"
        fi
    else
        echo "Failed to create event order: $event_order"
    fi
else
    echo "Failed to create event order: $event_order"
fi
echo ""

echo "Testing completed!"
echo ""
echo "Access your services:"
echo "  Order Service: http://localhost:3001"
echo "  Inventory Service: http://localhost:3002"
echo "  Notification Service: http://localhost:3003"
echo "  RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo "View logs: sudo docker-compose logs -f [service-name]"
