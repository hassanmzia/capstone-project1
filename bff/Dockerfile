# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bff -u 1001

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R bff:nodejs /app

USER bff

# Expose BFF port
EXPOSE 3026

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3026/health || exit 1

# Start the BFF service
CMD ["node", "dist/index.js"]
