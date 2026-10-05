#!/bin/bash

set -e

# Docker Compose v1 is deprecated and no longer present on GitHub-hosted
# runners (ubuntu-24.04+), which only ship the Compose v2 CLI plugin.
if docker compose version > /dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available" >&2
  exit 1
fi

cleanup() {
  echo "Stopping Docker services..."
  "${COMPOSE[@]}" -f integration-test/docker-compose.yml down
}
trap cleanup EXIT

echo "Starting Docker services..."
"${COMPOSE[@]}" -f integration-test/docker-compose.yml up -d

# Check if Docker services started successfully
if [ $? -ne 0 ]; then
  echo "Error: Failed to start Docker services"
  exit 1
fi

echo "Docker services started successfully."

# Show Docker service status
"${COMPOSE[@]}" -f integration-test/docker-compose.yml ps

echo "Waiting for Esplora to be ready..."
sleep 5

# Transfer funds to test address
docker exec esplora bash /init-esplora.sh

echo "Running integration tests..."
set +e
jest --config jest.integration.config.mjs
TEST_EXIT_CODE=$?
set -e
exit $TEST_EXIT_CODE
