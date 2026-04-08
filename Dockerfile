FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S roon -u 1001 -G nodejs

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# Copy patches directory BEFORE npm install so postinstall can apply patches
# This ensures the node-roon-api WebSocket fix is applied during Docker build
COPY patches/ ./patches/

# Install production dependencies only
# The postinstall script will automatically apply patches from patches/
RUN npm install --only=production && npm cache clean --force

# Bundle app source (exclude test files and coverage)
COPY --chown=roon:nodejs app.js ./
COPY --chown=roon:nodejs src/ ./src/
COPY --chown=roon:nodejs lib/ ./lib/

# Create data directory and symlink config.json to persistent volume
# This ensures Roon API saves settings to the mounted volume
RUN mkdir -p /usr/src/app/data && \
    ln -sf /usr/src/app/data/config.json /usr/src/app/config.json && \
    chown -R roon:nodejs /usr/src/app/data

# Switch to non-root user
USER roon

# Create volume for persistent data (contains config.json via symlink)
VOLUME ["/usr/src/app/data"]

# Expose port if needed (Roon extensions typically don't need exposed ports)
# EXPOSE 3000

# Health check to ensure the extension is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -f "node app.js" > /dev/null || exit 1

CMD [ "node", "app.js" ]
