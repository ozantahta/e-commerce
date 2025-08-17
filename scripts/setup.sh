#!/bin/bash

# Starting E-commerce Order Processing System Setup
# This script sets up the complete system

set -e

echo "Starting E-commerce Order Processing System Setup..."
echo "=================================================="

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed or not in PATH"
    exit 1
fi

echo "Docker and Docker Compose are available"

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p logs

# Install dependencies
echo "Installing dependencies..."
npm install

# Build shared utilities
echo "Building shared utilities..."
cd shared && npm install && npm run build && cd ..

# Build all services
echo "Building all services..."
npm run build

# Start services with Docker
echo "Starting services with Docker..."
docker-compose up -d --build

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 30

# Check service health
echo "Checking service health..."
echo "Order Service:"
if curl -f -s http://localhost:3001/health > /dev/null; then
    echo "Order Service is healthy"
else
    echo "ERROR: Order Service is not healthy"
    exit 1
fi

echo "Inventory Service:"
if curl -f -s http://localhost:3002/health > /dev/null; then
    echo "Inventory Service is healthy"
else
    echo "ERROR: Inventory Service is not healthy"
    exit 1
fi

echo "Notification Service:"
if curl -f -s http://localhost:3003/health > /dev/null; then
    echo "Notification Service is healthy"
else
    echo "ERROR: Notification Service is not healthy"
    exit 1
fi

# Check RabbitMQ
echo "RabbitMQ Management UI is accessible"
if curl -f -s -u admin:admin123 http://localhost:15672/api/overview > /dev/null; then
    echo "RabbitMQ Management UI is accessible"
else
    echo "ERROR: RabbitMQ Management UI is not accessible"
    exit 1
fi

echo ""
echo "Setup completed successfully!"
echo ""
echo "Service URLs:"
echo "  Order Service: http://localhost:3001"
echo "  Inventory Service: http://localhost:3002"
echo "  Notification Service: http://localhost:3003"
echo "  RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo "Next steps:"
echo "  1. Update .env file with your configuration"
echo "  2. Test the API endpoints"
echo "  3. Monitor logs: docker-compose logs -f"
echo "  4. Stop services: docker-compose down"
echo ""
echo "Useful commands:"
echo "  View logs: docker-compose logs -f [service-name]"
echo "  Restart service: docker-compose restart [service-name]"
echo "  Stop all: docker-compose down"
echo "  Start all: docker-compose up -d"
