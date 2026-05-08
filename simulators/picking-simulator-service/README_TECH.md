# Picking Simulator Service Technical Documentation

## Overview
The **Picking Simulator Service** is an automatic HTTP-only agent that simulates warehouse operator behavior by periodically scanning for pending picking tasks and automatically completing them. This allows end-to-end demonstration of the picking workflow without manual interaction, showing how orders flow from allocation through picking completion to shipping assignment.

## Core Technologies
- **Framework:** NestJS
- **Communication:** HTTP REST (calls Picking Service)
- **Message Broker:** No Kafka consumer (only indirect emit via HTTP)
- **Scheduling:** Node.js intervals for periodic task completion

## Operating Logic

### 1. Automatic Picking Task Completion (Picking Simulation)
The service has an internal job (interval loop) that:

1. **Periodically (every N seconds, configurable; default 15s):** Searches for pending picking work:
   - Querying the Picking Service: `GET /picking/tasks`
   - Filtering for tasks in `PENDING` status (not yet started by operators)
   - Checking that `taskId` exists and is a valid string

2. **Selects a random task** from the available pending tasks (to simulate non-deterministic operator behavior)

3. **Marks the task as completed** via HTTP `POST /picking/tasks/:taskId/complete`

4. **Picking Service reacts:**
   - Updates the task status to `COMPLETED` in MongoDB
   - Emits Kafka event `PickingTaskCompleted`
   - Shipping Service consumes the event and attempts to assign shipment to available vehicles

### 2. Idempotent Operation
- If no `PENDING` tasks exist, the simulator logs and waits for the next interval
- Multiple simulator instances can run safely in parallel (no shared state)
- Does not modify tasks in `IN_PROGRESS` or `COMPLETED` status

### 3. Configuration & Endpoints
Health check endpoint:
- `GET /picking-simulator/health`: Returns `{ status: 'ok', service: 'picking-simulator' }`

Control endpoints (for manual override):
- `GET /picking-simulator/status`: Returns current simulation state (running/stopped)
- `POST /picking-simulator/start?intervalMs=15000`: Start simulation with optional interval
- `POST /picking-simulator/stop`: Stop simulation

Optional environment variables (with defaults):
- `PICKING_SERVICE_URL`: Complete address of the Picking service (default: `http://picking-service:3003`)
- `SIMULATOR_INTERVAL_MS`: Interval between picking completions (default: 15000 ms = 15 seconds)

## Architectural Pattern

- **Reactive to Demand:** Only completes tasks that actually exist and are in `PENDING` state
- **Stateful Control:** Can be started/stopped dynamically; maintains running/stopped state
- **Realistic Operator Simulation:** Randomly selects from available tasks (non-FIFO behavior like real operators)
- **Non-Event-Driven:** No Kafka consumption; purely HTTP client behavior
- **Fast Cycle:** Default 15s interval simulates reasonably fast warehouse operations

## Service Interaction Flow

```
Picking Simulator (port 3008)
    ↓
    ├── GET /picking/tasks
    │        ↓
    │   Picking Service (port 3003)
    │        ↓
    │   Returns all tasks with status (PENDING, IN_PROGRESS, COMPLETED, CANCELLED)
    │
    └── POST /picking/tasks/:taskId/complete
            ↓
       Picking Service (port 3003)
            ↓
       - Updates task status to COMPLETED
       - Emits PickingTaskCompleted to Kafka
            ↓
       Shipping Service (via Kafka)
            ↓
       Attempts to assign shipment to available vehicle
            ↓
       Order Service (via Kafka)
            ↓
       Updates order status to PICKING_COMPLETED
```

## Workflow Integration

In the broader WHS event flow:

1. **Order Simulator** creates orders → Order Service emits `OrderPlaced`
2. **Inventory Service** allocates stock → emits `InventoryAllocated`
3. **Order Service** transitions order to `ALLOCATED` → emits `OrderReadyForPicking`
4. **Picking Service** creates picking task (PENDING)
5. **Picking Simulator** ⬅️ completes the task → emits `PickingTaskCompleted`
6. **Shipping Service** assigns to vehicle → emits `ShipmentAssigned`
7. **Shipping Simulator** dispatches vehicle → emits `VehicleDispatched`
8. **Order Service** receives `ShipmentAssigned` → updates order to `SHIPPED`
