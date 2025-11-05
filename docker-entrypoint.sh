#!/bin/sh
set -e

# Fix permissions for the data directory if it's mounted
if [ -d "/app/data" ]; then
  # Get the UID and GID of nodeusr
  NODE_UID=$(id -u nodeusr)
  NODE_GID=$(id -g nodeusr)
  
  # Change ownership of the data directory to nodeusr
  chown -R $NODE_UID:$NODE_GID /app/data 2>/dev/null || true
  
  # Ensure the data directory is writable
  chmod -R 775 /app/data 2>/dev/null || true
fi

# Switch to nodeusr and run the application
exec su-exec nodeusr "$@"
