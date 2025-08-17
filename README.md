# E-commerce Order Processing System

A microservices-based, event-driven order processing system built with Node.js, TypeScript, RabbitMQ, and MongoDB.

## 🏗️ Architecture Overview

The system follows a microservices architecture with event-driven communication using message queues. Each service is independent, scalable, and fault-tolerant.

### Core Services

- **Order Service** (Port 3001): Manages order lifecycle and business logic
- **Inventory Service** (Port 3002): Handles product inventory and stock management
- **Notification Service** (Port 3003): Processes and sends notifications

### Infrastructure

- **RabbitMQ**: Message queue for inter-service communication
- **MongoDB**: Persistent storage for all services
- **Docker**: Containerization for easy deployment and scaling

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd e-commerce-order-processing
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install service dependencies
npm run install:all
```

### 3. Start with Docker

```bash
# Build and start all services
npm run docker:up

# Or manually
docker-compose up -d
```

### 4. Verify Services

- **Order Service**: http://localhost:3001/health
- **Inventory Service**: http://localhost:3002/health
- **Notification Service**: http://localhost:3003/health
- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
- **MongoDB**: localhost:27017

## 📋 API Endpoints

### Order Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create a new order |
| GET | `/api/orders/:orderId` | Get order details |
| PUT | `/api/orders/:orderId/status` | Update order status |
| POST | `/api/orders/:orderId/cancel` | Cancel an order |
| GET | `/api/customers/:customerId/orders` | Get customer orders |
| GET | `/api/orders/status/:status` | Get orders by status |

### Inventory Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/products` | Create a new product |
| GET | `/api/products/:productId` | Get product details |
| PUT | `/api/products/:productId/stock` | Update product stock |
| GET | `/api/products/category/:category` | Get products by category |
| GET | `/api/products/low-stock` | Get low stock products |

### Notification Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications` | Send a notification |
| GET | `/api/notifications/:notificationId` | Get notification details |
| GET | `/api/notifications/status/:status` | Get notifications by status |

## 🔄 Event Flow

### Order Creation Flow

1. **Order Created**: Order service creates order and publishes `order.created` event
2. **Inventory Reserved**: Inventory service receives event and reserves stock
3. **Notification Sent**: Notification service sends confirmation to customer

### Order Cancellation Flow

1. **Order Cancelled**: Order service cancels order and publishes `order.cancelled` event
2. **Inventory Released**: Inventory service releases reserved stock
3. **Notification Sent**: Notification service sends cancellation confirmation

### Inventory Update Flow

1. **Stock Updated**: Inventory service updates stock and publishes `inventory.updated` event
2. **Low Stock Alert**: If stock is low, publishes `inventory.low` event
3. **Notification Sent**: Notification service alerts administrators

## 🛡️ Error Handling & Resilience

### Circuit Breaker Pattern
- Prevents cascading failures
- Configurable failure thresholds and timeouts
- Automatic recovery mechanisms

### Retry Mechanism
- Exponential backoff with jitter
- Configurable retry attempts
- Dead letter queue for failed messages

### Dead Letter Queue (DLQ)
- Failed messages are moved to DLQ
- Configurable TTL and retry policies
- Manual intervention for failed messages

### Health Checks
- Service health endpoints
- Database connectivity checks
- Message queue connectivity checks

## 🔧 Configuration

### Environment Variables

```bash
# Database
MONGODB_URL=mongodb://admin:admin123@localhost:27017/e-commerce?authSource=admin

# Message Queue
RABBITMQ_URL=amqp://admin:admin123@localhost:5672

# Service Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# SMTP (Notification Service)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Message Queue Configuration

- **Exchange**: `e-commerce.events` (Topic exchange)
- **Queues**: Service-specific queues with DLQ support
- **Routing Keys**: 
  - `order.*` - Order events
  - `inventory.*` - Inventory events
  - `notification.*` - Notification events

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run specific service tests
npm run test:order
npm run test:inventory
npm run test:notification

# Watch mode
npm run test:watch
```

### Test Coverage

- Unit tests for all services
- Integration tests for API endpoints
- Event flow testing
- Error scenario testing

## 📊 Monitoring & Logging

### Logging
- Structured logging with Winston
- Service-specific log files
- Log rotation and retention policies

### Health Monitoring
- Service health endpoints
- Database connectivity monitoring
- Message queue health checks

### Metrics
- Request/response times
- Error rates
- Queue depths
- Service uptime

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   export NODE_ENV=production
   export LOG_LEVEL=warn
   ```

2. **Build Services**
   ```bash
   npm run build
   ```

3. **Docker Deployment**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Scaling

- Horizontal scaling with multiple service instances
- Load balancing with Nginx
- Database sharding for high volume
- Message queue clustering

## 🔒 Security

- Helmet.js for security headers
- Rate limiting to prevent abuse
- Input validation with Joi
- CORS configuration
- Environment variable protection

## 📈 Performance

- Database indexing for fast queries
- Connection pooling
- Message queue prefetch settings
- Efficient event processing
- Memory usage optimization

## 🐛 Troubleshooting

### Common Issues

1. **Service Won't Start**
   - Check database connectivity
   - Verify message queue connection
   - Check environment variables

2. **Messages Not Processing**
   - Verify queue bindings
   - Check routing keys
   - Monitor DLQ for failed messages

3. **Database Connection Issues**
   - Verify MongoDB credentials
   - Check network connectivity
   - Monitor connection pool

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Check service logs
docker-compose logs -f order-service
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

## 🔮 Future Enhancements

- [ ] GraphQL API
- [ ] Real-time notifications with WebSockets
- [ ] Advanced analytics and reporting
- [ ] Multi-tenant support
- [ ] Event sourcing implementation
- [ ] Kubernetes deployment manifests
- [ ] CI/CD pipeline configuration
- [ ] Performance benchmarking tools