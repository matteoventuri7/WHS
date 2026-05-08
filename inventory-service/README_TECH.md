# Inventory Service Technical Documentation

## Overview
The **Inventory Service** is responsible for tracking the physical state of the warehouse. It manages locations, stock levels (inventory quantity) for each product, and allocation of resources requested by outbound orders.

## Core Technologies
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Data Model (Mongoose Schema)
The main domain entity is **Inventory**:
- `productId` (String): Unique product identifier (SKU).
- `location` (String): Physical warehouse location (e.g., Aisle, Shelf, Level).
- `quantity` (Number): Total physical quantity present for that `productId-location` pair.
- `reservedQuantity` (Number): Quantity currently "locked"/allocated for orders being picked.
  - *Note:* The actual *available* quantity (Available to Promise) is calculated as `quantity - reservedQuantity`.

## REST API (Endpoint Controller)
The service exposes REST APIs on port `3001` for direct interaction, particularly for simulating Inbound operations:
- `GET /inventory`: Returns a snapshot of all warehouse records, showing stock levels and reserves (local Read Model).
- `POST /inventory/receive`: Endpoint to register new incoming merchandise (*Inbound*). Requires payload: `{ productId, location, quantity }`.

## Event-Driven Logic (Consumer and Producer)

### 1. Goods Reception (Inbound Handling)
When the API `/receive` is invoked, the service:
1. Searches the DB for an existing record for the same product in the same location. If it exists, adds the quantity; otherwise, creates a new record.
2. **Event Emission:** Produces the **`ItemStored`** message to Kafka.
   - **Why:** This event is crucial so the Order Service knows new merchandise is available and can retry allocating previously blocked orders (Out of Stock).

### 2. Allocation Management (Order Placement Handling)
The service subscribes to the Kafka consumer group `inventory-consumer` and passively listens for specific events:

- **Listening to `OrderPlaced` event**
  - When an `OrderPlaced` event arrives (emitted by Order Service), the payload contains the products and quantities requested for the order in transit.
  - **Core Logic:** Iterates over each requested product, searching in the Mongoose DB for locations where it is stocked and attempting to reach the requested quota.
  - For each location, calculates Available to Promise (`quantity - reservedQuantity`). If positive, "locks" the necessary part by temporarily incrementing `reservedQuantity`.
  - **Success:** If all requested merchandise is mathematically covered by available stock, emits the **`InventoryAllocated`** event to Kafka, including an array of allocations (`[{ productId, quantity, location }]`) that indicates exactly "where to pick" the merchandise.
  - **Failure (OutOfStock):** If the sum of physically available quantities is less than the total requested by the order, allocation fails. A **Rollback** is performed in the DB (zeroing any partial increments made to `reservedQuantity` during the previous loop) and the **`OutOfStock`** event is emitted to Kafka associated with the order ID.

### 3. Release Reservations (Order Cancellation Handling)
The service receives the `OrderCancelled` event from the Order Service (emitted whether the order was cancelled manually or due to policy violation):

- **Listening to `OrderCancelled` event**
  - Payload: `{ orderId, previousStatus, allocations }`
  - **Core Logic:** Iterates over the received allocations. For each allocation (product, quantity, location), decrements the corresponding `reservedQuantity` in the MongoDB DB, releasing the "lock" on the merchandise.
  - This operation is **idempotent**: if the event arrives twice, the first time it actually releases, subsequent times find no more allocations and do nothing.
  - **Effect:** Stock becomes available again for other orders.
