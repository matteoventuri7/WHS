# Order Service Technical Documentation

## Overview
The **Order Service** is the entry point for outbound merchandise shipment orders. It acts as an orchestrator for order fulfillment validation.

## Core Technologies
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Data Model (Mongoose Schema)
The main domain entity is **Order**:
- `orderId` (String): Unique order ID.
- `items` (Array of `{ productId, quantity }`): The shopping list.
- `status` (Enum String): Tracks the lifecycle (`PENDING`, `SUSPENDED`, `ALLOCATED`, `PICKING_COMPLETED`, `SHIPPED`, `CANCELLED`).
- `allocations` (Array Object): A bucket where the microservice saves exact instructions on "where to find" merchandise in the warehouse, received from the Inventory Service at a later time.

## REST API (Endpoint Controller)
The service operates on port `3002`:
- `GET /orders`: Shows the real-time status of all orders and their lifecycle (local Read Model).
- `POST /orders`: Transactional endpoint to receive a customer request (e.g., from UI). Creates a new record in the database in `PENDING` status and triggers the Event-Driven flow.
- `DELETE /orders/:orderId` or `PATCH /orders/:orderId/cancel`: Initiates the cancellation flow of an order.

## Event-Driven Logic (Consumer and Producer)

### 1. New Order Placement
The primary action (via API) translates to:
1. Saving to MongoDB in `PENDING` status.
2. **Event Emission:** Production of **`OrderPlaced`** event to Kafka. 
   - Note that the Order Service **does not know** and **does not ask synchronously** if there is stock. It trusts that a downstream system (Inventory) will react to this message asynchronously.

### 2. Choreographic State Management (Consumer)
The Order Service listens to the Kafka consumer group `order-consumer`. It reacts to the following events, modifying the state variable (`status`) in its own MongoDB database to reflect domain mutations.

- **Listening to `InventoryAllocated` event**
  - **Reaction:** When it receives the OK from Inventory, it updates its status from `PENDING` to **`ALLOCATED`**, associating the physical locations received.
  - **Downstream Emission:** It reactively emits `OrderReadyForPicking`. It passes the baton to the Picking Service saying: *"This merchandise is assigned to order X, the warehouse operator can now pick it"*.

- **Listening to `OutOfStock` event**
  - **Reaction:** The fulfillment attempt failed because an item is missing from the warehouse. The order transitions to **`SUSPENDED`** status. No one in the downstream flow will take any action.

- **Listening to `ItemStored` event** (The "Heart" of Reactivity)
  - This event is fired passively by the Inventory Service whenever a supplier truck offloads merchandise (Inbound).
  - **Reaction:** The Order Service "wakes up" selectively. It goes to the DB and fetches **all** orders currently in `SUSPENDED` status (sorted by date). For each one, it tries to re-emit the **`OrderPlaced`** package to Kafka, as if it were a newly arrived order, hoping this time the warehouse has sufficient articles.

- **Listening to `ShipmentAssigned` event**
  - **Reaction:** When a truck has physically loaded the picked merchandise in the warehouse yard, it updates the status to **`SHIPPED`**. This concludes the useful lifecycle tracked by this service.

- **Listening to `PickingTaskCompleted` event**
  - **Reaction:** When the Picking Service confirms task completion, the order transitions from `ALLOCATED` to **`PICKING_COMPLETED`**.
  - **UI Effect:** This intermediate status prevents late cancellations and allows hiding the cancel button immediately before `ShipmentAssigned` arrives.

### 3. Order Cancellation (Asynchronous Flow via Kafka)
Cancellation is initiated via a REST API call but uses **Kafka for inter-service communication**, not synchronous HTTP calls.

1. The controller receives the cancellation request (via `DELETE /orders/:orderId` or `PATCH /orders/:orderId/cancel`).
2. **Local Cancellability Check:** The Order Service verifies if the order is in a cancellable state:
   - ✅ `PENDING`, `SUSPENDED`, `ALLOCATED` → Cancellable
   - ❌ `PICKING_COMPLETED`, `SHIPPED`, `CANCELLED` → Not cancellable
3. **If the order is in `ALLOCATED` status:**
   - Emits the **`CancelPickingTask`** event to Kafka with payload `{ orderId }`.
   - The Picking Service receives this event asynchronously and acts accordingly (see Picking Service logic).
4. **Local State Update and Conclusion Event Emission:**
   - Updates the order status to **`CANCELLED`** in the local MongoDB.
   - Emits the **`OrderCancelled`** event to Kafka with payload `{ orderId, previousStatus, allocations }`.
   - The Inventory Service receives this event and releases stock reservations.
5. **Immediate Response to Client:** The REST API returns `200 OK` with the updated order, even though the effects (stock release, picking task cancellation) continue in the background asynchronously.
