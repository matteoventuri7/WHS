# Picking Service Technical Documentation

## Overview
The **Picking Service** constitutes the Task Manager for physical warehouse operators. Its semantics are decoupled directly from Outbound or pure Stock (though it depends on them). It purely manages "Picking Jobs" to be performed by humans (or industrial robots).

## Core Technologies
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Data Model (Mongoose Schema)
The main domain entity is **PickingTask**:
- `taskId` (String): Unique ID of the physical work assigned and printed to the warehouse operator.
- `orderId` (String): Reference link with the parent customer Order.
- `allocations` (Array): The operational list for the worker (e.g., "Go to B-12 and pick 20 bottles").
- `status` (Enum String): Task lifecycle (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

## REST API (Endpoint Controller)
The main hub runs on port `3003`:
- `GET /picking/tasks`: Lists the real-time "To-Do List" of warehouse operations.
- `POST /picking/tasks/:taskId/complete`: Simulates the action of the mobile device (or RFID reader) with which the warehouse operator in the aisle says: *"I have placed the materials physically in the yard shipping area"*.

## Event-Driven Logic (Consumer and Producer)

### 1. Trigger (Ignition)
This service does not initiate "impulse actions". Everything is pre-started listening on the consumer group `picking-consumer`.

- **Listening to `OrderReadyForPicking` event**
  - **Reaction:** Takes the schema elaborated by the Order service. The Inventory has previously confirmed that "there is merchandise in these specific locations and the `reservedQuantity` badge has increased". The Picking Service receives this data and creates the **Physical Work Task** assigning it to a local Mongo database (status: `PENDING`). From this moment on it appears in the warehouse floor monitors and is also shown on the operator's tablet.
  - Optionally generates diagnostic log triggers, and emits a blank `PickingTaskCreated` event to Kafka (for audit purposes).

### 2. Material Conclusion of Island Workflow
- **Emission of `PickingTaskCompleted` event**
  - When a Human actor sends the API `/complete`, the status of the MongoDB document changes to `COMPLETED`.
  - In reactive sequence, operationally produces (emits to Kafka) the `PickingTaskCompleted` event, warning the system pipeline (Shipping and any actual off-bill receipt loading).

### 3. Cancellation of a Picking Task (Asynchronous Flow)
This service receives a `CancelPickingTask` event from the Order Service during the asynchronous cancellation process of the parent order.

- **Listening to `CancelPickingTask` event**
  - Payload: `{ orderId }`
  - **Pre-condition `PENDING`:** If the task exists and is still in `PENDING` status (the warehouse operator has not yet started), the service updates the status to **`CANCELLED`** in the local MongoDB. It does not emit any event for this transition.
  - **Pre-condition `IN_PROGRESS`:** The task is already in progress. The service **does nothing** (does not change status). The parent order remains blocked waiting for the task to be completed; when it is, it is the Shipping Service (not Picking) that terminates the flow.
  - **Pre-condition `COMPLETED`:** The task is already complete. The service does nothing (nothing to cancel).
  - **No task found:** If no picking task exists for that order, the service does nothing (it was already cancelled or was never created).
  - **Idempotency:** The event can arrive multiple times without side effects.
