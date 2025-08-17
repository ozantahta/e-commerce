FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/order-service/package*.json ./services/order-service/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY shared ./shared
COPY services/order-service ./services/order-service

# Build shared utilities
RUN cd shared && npm run build

# Build order service
RUN cd services/order-service && npm run build

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "services/order-service/dist/index.js"]
