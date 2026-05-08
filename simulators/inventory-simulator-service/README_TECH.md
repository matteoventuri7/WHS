# Inventory Simulator Service Technical Documentation

## Overview
The **Inventory Simulator Service** is an automatic HTTP-only agent that simulates periodic arrival of merchandise in the warehouse (inbound), as if it were suppliers continuously unloading goods. It does not use Kafka to consume events. Its purpose is to generate realistic workload to allow core services to process merchandise receipt flows continuously.

## Core Technologies
- **Framework:** NestJS
- **Communication:** HTTP REST (calls Inventory Service)
- **Message Broker:** No Kafka consumer (only indirect emit via HTTP)

## Operating Logic

### 1. Automatic Merchandise Generation (Inbound Simulation)
The service has an internal job (scheduler or interval loop) that:

1. **Periodically (every N seconds, configurable):** Generates a simulated merchandise load with:
   - A `productId` randomly selected from a predefined list (e.g., PROD-001, PROD-002, ..., PROD-010)
   - A `location` randomly selected (e.g., A-01, A-02, ..., B-12, ..., C-15)
   - A random `quantity` (e.g., between 10 and 100 units)

2. **Makes an HTTP `POST /inventory/receive` call** to the **Inventory Service** (via Next.js API Gateway or directly to the service if on Docker network) with the payload:
   ```json
   {
     "productId": "PROD-005",
     "location": "B-07",
     "quantity": 45
   }
   ```

3. **Inventory Service reacts:**
   - Accepts the load, updates its own Mongoose DB
   - Emits Kafka event `ItemStored`
   - The Order Service, listening to this event, tries to wake up and retry allocations on `SUSPENDED` orders

### 2. Configuration
The service exposes an HTTP health check endpoint:
- `GET /inbound/health`: Returns `{ status: 'ok', service: 'inbound' }`

Optional environment variables (with defaults):
- `INVENTORY_SERVICE_URL`: Complete address of the Inventory service (default: `http://inventory-service:3001`)
- `SIMULATOR_INTERVAL_MS`: Interval between generations (default: 15000 ms = 15 seconds)

## Architectural Pattern

- **Non-Event-Driven Internal:** The simulator does not listen to Kafka events, only generates HTTP calls.
- **HTTP-only Consumer:** Interacts with core services as an external client would (via REST API).
- **Natural Idempotency:** Each generation is independent; even if the simulator is detached and restarted, it continues to generate consistently.
- **Scalability:** Modifying `SIMULATOR_INTERVAL_MS` adjusts the simulation speed without code changes.
