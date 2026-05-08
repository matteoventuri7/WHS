# Shipping Simulator Service (Dispatch Simulator) Technical Documentation

## Overview
The **Shipping Simulator Service** (also called Dispatch Simulator) is an automatic HTTP-only agent that simulates logistics yard operations by periodically generating new vehicles and automatically dispatching trucks that are loaded and ready to depart. This completes the end-to-end warehouse flow by moving merchandise from the dock to the final shipping stage.

## Core Technologies
- **Framework:** NestJS
- **Communication:** HTTP REST (calls Shipping Service)
- **Message Broker:** No Kafka consumer (only indirect emit via HTTP)
- **Scheduling:** Node.js intervals for periodic truck generation and dispatch

## Operating Logic

### 1. Automatic Vehicle Generation (Vehicle Registration)
Periodically (with 50% probability on each simulation cycle), the simulator:

1. **Generates a random vehicle:**
   - Random `vehicleId` format: `SIM-TRUCK-{random-number}` (e.g., `SIM-TRUCK-4829`)
   - Random `maxCapacity` between 50 and 100 items

2. **Registers the vehicle** via HTTP `POST /shipping/vehicles`:
   ```json
   {
     "vehicleId": "SIM-TRUCK-4829",
     "maxCapacity": 75
   }
   ```

3. **Shipping Service reacts:**
   - Creates a new Vehicle record in status `AVAILABLE` in MongoDB
   - Emits Kafka event `VehicleRegistered`

### 2. Automatic Vehicle Dispatch (Shipment Departure)
On each simulation cycle, the simulator:

1. **Queries available vehicles** via `GET /shipping/vehicles`

2. **Filters for dispatch candidates:**
   - Status must be `AVAILABLE` (not yet dispatched)
   - Must have either `currentLoad > 0` or `assignedTaskIds.length > 0`

3. **Sorts by load** (descending) to dispatch most-loaded vehicles first

4. **Dispatches the top vehicle** via HTTP `POST /shipping/vehicles/:vehicleId/dispatch`

5. **Shipping Service reacts:**
   - Updates vehicle status from `AVAILABLE` to `DISPATCHED` in MongoDB
   - Emits Kafka event `VehicleDispatched`

### 3. Configuration & Endpoints
Health check endpoint:
- `GET /dispatch/health`: Returns `{ status: 'ok', service: 'dispatch' }`

Control endpoints (for manual override):
- `GET /dispatch/status`: Returns current simulation state
- `POST /dispatch/start?intervalMs=20000`: Start simulation with optional interval
- `POST /dispatch/stop`: Stop simulation

Optional environment variables (with defaults):
- `SHIPPING_SERVICE_URL`: Complete address of the Shipping service (default: `http://shipping-service:3004`)
- `SIMULATOR_INTERVAL_MS`: Interval between dispatch cycles (default: 20000 ms = 20 seconds)

## Architectural Pattern

- **Two-Stage Simulation:** Generates vehicles (50% probability) and dispatches them separately
- **Load-Aware Dispatch:** Prioritizes fully-loaded vehicles to simulate real-world yard optimization
- **Stateful Control:** Can be started/stopped dynamically
- **Non-Event-Driven:** No Kafka consumption; purely HTTP client behavior
- **Realism:** Slower interval (20s default) reflects typical yard logistics cycle time

## Service Interaction Flow

```
Shipping Simulator (port 3006)
    ↓
    ├── POST /shipping/vehicles (50% probability per cycle)
    │        ↓
    │   Shipping Service (port 3004)
    │        ↓
    │   - Creates Vehicle in AVAILABLE status
    │   - Emits VehicleRegistered to Kafka
    │
    └── GET /shipping/vehicles (query available)
         ↓
         Filter for AVAILABLE vehicles with cargo
         ↓
         POST /shipping/vehicles/:vehicleId/dispatch
              ↓
              Shipping Service (port 3004)
              ↓
              - Updates status to DISPATCHED
              - Emits VehicleDispatched to Kafka
```

## Workflow Integration

In the broader WHS event flow:

1. **Order Simulator** creates orders
2. **Inventory Service** allocates stock
3. **Picking Service** creates picking tasks
4. **Picking Simulator** completes picking tasks → emits `PickingTaskCompleted`
5. **Shipping Service** assigns to vehicle → emits `ShipmentAssigned`
6. **Shipping Simulator** ⬅️ dispatches vehicle → emits `VehicleDispatched`
7. **Order Service** receives `VehicleDispatched` event (optional) or responds to `ShipmentAssigned`
8. **Frontend** displays live dispatch status and vehicle manifest

## Interaction with Picking Flow

The Picking Simulator and Shipping Simulator work in concert:
- Picking Simulator completes picking tasks regularly
- Shipping Service automatically assigns completed pickings to available vehicles
- Shipping Simulator monitors vehicle load and dispatches when ready

This creates a natural pacing where:
- If picking is fast but shipping is slow → vehicles fill up
- If shipping is fast but picking is slow → vehicles wait for cargo
- If balanced → smooth end-to-end flow
