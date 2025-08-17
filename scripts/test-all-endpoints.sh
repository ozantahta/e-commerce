#!/bin/bash

# Comprehensive Endpoint Testing Script
# Tests all endpoints across all services separately

echo "=========================================="
echo "COMPREHENSIVE ENDPOINT TESTING"
echo "=========================================="
echo ""

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

# Function to test endpoint
test_endpoint() {
    local method=$1
    local url=$2
    local description=$3
    local data=$4
    
    echo -e "\n${BLUE}Testing: $description${NC}"
    echo "URL: $method $url"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$url")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT -H "Content-Type: application/json" -d "$data" "$url")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$url")
    fi
    
    # Extract HTTP status and response body
    http_status=$(echo "$response" | tail -n1 | cut -d':' -f2)
    response_body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]; then
        print_status "SUCCESS" "HTTP $http_status - $description"
        echo "Response: $response_body" | jq '.' 2>/dev/null || echo "Response: $response_body"
    else
        print_status "FAILED" "HTTP $http_status - $description"
        echo "Response: $response_body" | jq '.' 2>/dev/null || echo "Response: $response_body"
    fi
}

echo "Starting comprehensive endpoint testing..."
echo ""

# Wait for services to be ready
print_status "INFO" "Waiting for services to be ready..."
sleep 5

# ============================================================================
# ORDER SERVICE ENDPOINTS
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "ORDER SERVICE ENDPOINTS (Port 3001)"
echo "==========================================${NC}"

# Health check
test_endpoint "GET" "http://localhost:3001/health" "Order Service Health Check"

# Create a test order
test_endpoint "POST" "http://localhost:3001/api/orders" "Create Test Order" '{
  "customerId": "ENDPOINT_TEST_001",
  "items": [
    {
      "productId": "LAPTOP001",
      "quantity": 1,
      "price": 999.99,
      "name": "Laptop"
    }
  ]
}'

# Get the created order ID for further tests
order_response=$(curl -s "http://localhost:3001/api/orders" | jq -r '.data[0].orderId' 2>/dev/null)
if [ "$order_response" != "null" ] && [ -n "$order_response" ]; then
    print_status "INFO" "Using order ID: $order_response for further tests"
    
    # Get specific order
    test_endpoint "GET" "http://localhost:3001/api/orders/$order_response" "Get Specific Order"
    
    # Update order status
    test_endpoint "PUT" "http://localhost:3001/api/orders/$order_response/status" "Update Order Status" '{"status": "confirmed"}'
    
    # Get updated order
    test_endpoint "GET" "http://localhost:3001/api/orders/$order_response" "Get Updated Order"
else
    print_status "WARNING" "Could not retrieve order ID for further tests"
fi

# Test customer orders endpoint
test_endpoint "GET" "http://localhost:3001/api/customers/ENDPOINT_TEST_001/orders" "Get Orders by Customer"

# Test orders by status endpoint
test_endpoint "GET" "http://localhost:3001/api/orders/status/confirmed" "Get Orders by Status"

# ============================================================================
# INVENTORY SERVICE ENDPOINTS
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "INVENTORY SERVICE ENDPOINTS (Port 3002)"
echo "==========================================${NC}"

# Health check
test_endpoint "GET" "http://localhost:3002/health" "Inventory Service Health Check"

# Get all products
test_endpoint "GET" "http://localhost:3002/api/products" "Get All Products"

# Get inventory
test_endpoint "GET" "http://localhost:3002/api/inventory" "Get Inventory"

# Get specific product inventory
product_id=$(curl -s "http://localhost:3002/api/products" | jq -r '.[0].productId' 2>/dev/null)
if [ "$product_id" != "null" ] && [ -n "$product_id" ]; then
    print_status "INFO" "Using product ID: $product_id for further tests"
    
    # Get specific product
    test_endpoint "GET" "http://localhost:3002/api/products/$product_id" "Get Specific Product"
    
    # Update product stock
    test_endpoint "PUT" "http://localhost:3002/api/products/$product_id/stock" "Update Product Stock" '{"newQuantity": 60}'
    
    # Get updated inventory
    test_endpoint "GET" "http://localhost:3002/api/inventory" "Get Updated Inventory"
else
    print_status "WARNING" "Could not retrieve product ID for further tests"
fi

# ============================================================================
# NOTIFICATION SERVICE ENDPOINTS
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "NOTIFICATION SERVICE ENDPOINTS (Port 3003)"
echo "==========================================${NC}"

# Health check
test_endpoint "GET" "http://localhost:3003/health" "Notification Service Health Check"

# Get all notifications
test_endpoint "GET" "http://localhost:3003/api/notifications" "Get All Notifications"

# Get notification count
notification_count=$(curl -s "http://localhost:3003/api/notifications" | jq 'length' 2>/dev/null)
print_status "INFO" "Total notifications found: $notification_count"

# Get specific notification if available
if [ "$notification_count" -gt 0 ]; then
    notification_id=$(curl -s "http://localhost:3003/api/notifications" | jq -r '.[0].notificationId' 2>/dev/null)
    if [ "$notification_id" != "null" ] && [ -n "$notification_id" ]; then
        print_status "INFO" "Using notification ID: $notification_id for further tests"
        
        # Get specific notification
        test_endpoint "GET" "http://localhost:3003/api/notifications/$notification_id" "Get Specific Notification"
    fi
    
    # Get notifications by recipient
    recipient_id=$(curl -s "http://localhost:3003/api/notifications" | jq -r '.[0].recipientId' 2>/dev/null)
    if [ "$recipient_id" != "null" ] && [ -n "$recipient_id" ]; then
        test_endpoint "GET" "http://localhost:3003/api/notifications/recipient/$recipient_id" "Get Notifications by Recipient"
    fi
fi

# Get notification statistics
test_endpoint "GET" "http://localhost:3003/api/notifications/stats" "Get Notification Statistics"

# ============================================================================
# RABBITMQ MANAGEMENT
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "RABBITMQ MANAGEMENT (Port 15672)"
echo "==========================================${NC}"

# Test RabbitMQ management access
rabbitmq_response=$(curl -s -u admin:admin123 "http://localhost:15672/api/overview" 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$rabbitmq_response" ]; then
    print_status "SUCCESS" "RabbitMQ Management API Accessible"
    queue_count=$(echo "$rabbitmq_response" | jq '.queue_totals.messages' 2>/dev/null)
    print_status "INFO" "Messages in queues: $queue_count"
else
    print_status "FAILED" "RabbitMQ Management API Not Accessible"
fi

# ============================================================================
# MONGODB CONNECTION
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "MONGODB CONNECTION (Port 27017)"
echo "==========================================${NC}"

# Test MongoDB connection
mongodb_test=$(sudo docker-compose exec mongodb mongosh --eval "db.runCommand('ping')" --quiet 2>/dev/null)
if echo "$mongodb_test" | grep -q "ok"; then
    print_status "SUCCESS" "MongoDB Connection Successful"
else
    print_status "FAILED" "MongoDB Connection Failed"
fi

# ============================================================================
# COMPREHENSIVE SYSTEM TEST
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "COMPREHENSIVE SYSTEM TEST"
echo "==========================================${NC}"

# Test event flow by creating an order
print_status "INFO" "Testing complete event flow..."
event_order_response=$(curl -s -X POST "http://localhost:3001/api/orders" -H "Content-Type: application/json" -d '{
  "customerId": "EVENT_FLOW_TEST_001",
  "items": [
    {
      "productId": "HEAD001",
      "quantity": 1,
      "price": 199.99,
      "name": "Headphones"
    }
  ]
}')

event_order_id=$(echo "$event_order_response" | jq -r '.data.orderId' 2>/dev/null)
if [ "$event_order_id" != "null" ] && [ -n "$event_order_id" ]; then
    print_status "SUCCESS" "Event flow test order created: $event_order_id"
    
    # Wait for event processing
    sleep 3
    
    # Check if notification was created
    notification_check=$(curl -s "http://localhost:3003/api/notifications/recipient/EVENT_FLOW_TEST_001")
    if echo "$notification_check" | jq -e '.[0]' >/dev/null 2>&1; then
        print_status "SUCCESS" "Event flow working - notification created"
    else
        print_status "FAILED" "Event flow failed - no notification found"
    fi
else
    print_status "FAILED" "Event flow test order creation failed"
fi

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo -e "\n${YELLOW}=========================================="
echo "TESTING COMPLETED"
echo "==========================================${NC}"

print_status "INFO" "All endpoint tests completed!"
print_status "INFO" "Check the results above for any failures"
print_status "INFO" "Services are accessible at:"
echo "  - Order Service: http://localhost:3001"
echo "  - Inventory Service: http://localhost:3002"
echo "  - Notification Service: http://localhost:3003"
echo "  - RabbitMQ Management: http://localhost:15672 (admin/admin123)"

echo -e "\n${GREEN}Endpoint testing script completed!${NC}"
