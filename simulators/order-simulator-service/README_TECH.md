# Order Simulator Service Technical Documentation

## Overview
The **Order Simulator Service** is an automatic HTTP-only agent that simulates customer order placement by periodically generating outbound orders. It queries the Inventory Service to identify products with available stock and automatically creates orders via the Order Service. It also randomly (~10% probability) cancels non-completed orders to simulate real-world order cancellation scenarios.

## Core Technologies
- **Framework:** NestJS
- **Communication:** HTTP REST (calls Inventory Service and Order Service)
- **Message Broker:** No Kafka consumer (only indirect emit via HTTP)
- **Scheduling:** Node.js intervals for periodic order generation

## Operating Logic

### 1. Automatic Order Generation (Order Simulation)
The service has an internal job (interval loop) that:

1. **Periodically (every N seconds, configurable; default 15s):** Generates a simulated customer order by:
   - Querying the Inventory Service: `GET /inventory`
   - Building a map of available stock per product (calculated as `quantity - reservedQuantity`)
   - Selecting the top 5 products by availability (to simulate realistic demand on popular items)
   - Randomly selecting one from the top 5
   - Generating a random quantity (1-50 units)

2. **Creates an HTTP `POST /orders` call** to the **Order Service** with the payload:
   ```json
   {
     "items": [
       { "productId": "PROD-005", "quantity": 35 }
     ]
   }
   ```

3. **Order Service reacts:**
   - Accepts the order, creates a new record in state `PENDING` in MongoDB
   - Emits Kafka event `OrderPlaced`
   - Inventory Service consumes the event and attempts allocation

### 2. Random Order Cancellation
Periodically (with ~10% probability on each order creation cycle), the simulator:
1. Fetches all current orders: `GET /orders`
2. Filters for cancellable statuses: `PENDING`, `SUSPENDED`, `ALLOCATED`
3. Randomly selects one order
4. Sends cancellation request: `DELETE /orders/:orderId`
5. Order Service processes the cancellation asynchronously (Kafka flow)

### 3. Configuration & Endpoints
Health check endpoint:
- `GET /order-simulator/health`: Returns `{ status: 'ok', service: 'order-simulator' }`

Control endpoints (for manual override):
- `GET /order-simulator/status`: Returns current simulation state
- `POST /order-simulator/start?intervalMs=15000`: Start simulation with optional interval
- `POST /order-simulator/stop`: Stop simulation

Optional environment variables (with defaults):
- `INVENTORY_SERVICE_URL`: Complete address of the Inventory service (default: `http://inventory-service:3001`)
- `ORDER_SERVICE_URL`: Complete address of the Order service (default: `http://order-service:3002`)
- `SIMULATOR_INTERVAL_MS`: Interval between order generations (default: 15000 ms = 15 seconds)

## Architectural Pattern

- **Intelligent Order Generation:** Analyzes real inventory state before creating orders (ensures realistic demand patterns)
- **Stateful Simulation:** Tracks running/stopped state and can be controlled dynamically via REST
- **Cancellation Chaos Engineering:** Random cancellations (~10%) test resilience of the cancellation flow
- **Non-Event-Driven:** No Kafka consumption; purely HTTP client behavior
- **Operator-Facing:** Can be started/stopped manually or run automatically on Docker startup

## Service Interaction Flow

```
Order Simulator (port 3007)
    ↓
    ├── GET /inventory
    │        ↓
    │   Inventory Service (port 3001)
    │        ↓
    │   Returns available products
    │
    ├── POST /orders (create new order)
    │        ↓
    │   Order Service (port 3002)
    │        ↓
    │   - Saves order in PENDING
    │   - Emits OrderPlaced to Kafka
    │        ↓
    │   Inventory Service (via Kafka)
    │        ↓
    │   Attempts allocation
    │
    └── DELETE /orders/:orderId (random cancellation)
            ↓
       Order Service (port 3002)
            ↓
       Asynchronous cancellation flow via Kafka
```
