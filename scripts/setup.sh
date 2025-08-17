#!/bin/bash

# E-commerce Order Processing System Setup Script
# This script sets up the entire system with Docker

set -e

echo "🚀 Starting E-commerce Order Processing System Setup..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p scripts

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please update .env file with your configuration before starting services"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build shared utilities
echo "🔨 Building shared utilities..."
cd shared && npm install && npm run build && cd ..

# Build all services
echo "🔨 Building all services..."
npm run build

# Start services with Docker
echo "🐳 Starting services with Docker..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo "🏥 Checking service health..."

# Check Order Service
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Order Service is healthy"
else
    echo "❌ Order Service is not responding"
fi

# Check Inventory Service
if curl -f http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Inventory Service is healthy"
else
    echo "❌ Inventory Service is not responding"
fi

# Check Notification Service
if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    echo "✅ Notification Service is healthy"
else
    echo "❌ Notification Service is not responding"
fi

# Check RabbitMQ
if curl -f http://localhost:15672 > /dev/null 2>&1; then
    echo "✅ RabbitMQ Management UI is accessible"
else
    echo "❌ RabbitMQ Management UI is not accessible"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Service URLs:"
echo "   Order Service: http://localhost:3001"
echo "   Inventory Service: http://localhost:3002"
echo "   Notification Service: http://localhost:3003"
echo "   RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo "📚 Next steps:"
echo "   1. Update .env file with your configuration"
echo "   2. Test the API endpoints"
echo "   3. Monitor logs: docker-compose logs -f"
echo "   4. Stop services: docker-compose down"
echo ""
echo "🔍 Useful commands:"
echo "   View logs: docker-compose logs -f [service-name]"
echo "   Restart service: docker-compose restart [service-name]"
echo "   Stop all: docker-compose down"
echo "   Start all: docker-compose up -d"
