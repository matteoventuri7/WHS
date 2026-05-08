# Shipping Service Technical Documentation

## Overview
The **Shipping Service** manages the final mile. It represents the concept of the external yard: trucks, loading docks, weight/volume optimization, and authorizations for dispatching vehicles from exit gates.

## Core Technologies
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Data Model (Mongoose Schema)
The core entity for this service is not "the shipped order", but the carrier container, namely the **Vehicle**:
- `vehicleId` (String): The identifier of the truck/van in the yard.
- `maxCapacity` (Number): Approximate simulator of "how much merchandise fits in the trailer", calculated in items (or volume in kg on complete management systems).
- `currentLoad` (Number): Live status of the truck fill level (from 0 to `maxCapacity`).
- `assignedTaskIds` (Array of String): Tracks by reverse reference which "completed Picking Tasks" are loaded on board the truck (allowing us to print billing documents).
- `status` (Enum String): Logistics tracking ('AVAILABLE' or 'DISPATCHED' i.e., on the road).

## REST API (Endpoint Controller)
Microservice hooked up on local port `3004`:
- `GET /shipping/vehicles`: Real-time tabular view of the vehicle fleet at dock and fill level percentage.
- `POST /shipping/vehicles`: Quick vehicle registration module. Creates an `AVAILABLE` record allowing it to stand in the "Sorting Yard" adjacent. Payload: `{ vehicleId, maxCapacity }`. Emits Kafka event `VehicleRegistered`.
- `GET /shipping/pending`: Returns the list of shipments awaiting loading on a vehicle.
- `POST /shipping/vehicles/:id/dispatch`: Final manual button. Authorizes raising the gate for vehicles, changing status from `AVAILABLE` to `DISPATCHED` and confirming the departure target of the packages on board. Emits Kafka event `VehicleDispatched`.

## Event-Driven Logic (Consumer and Producer)

### 1. Automatic Yard Sorting System (Core Routing Logics)
This microservice receives an impulse (as consumer group `shipping-consumer`) and must immediately make an algorithmic choice.

- **Listening to `PickingTaskCompleted` event**
  - **Incoming Impulse:** A Human operator (on the Picking Service) has finished gathering merchandise from various shelves, has packaged it on a pallet and deposited it in the shipping area. The cargo is *physically on the dock*.
  - **Logical Calculation (Reduced Knapsack):** The microservice receives the `allocations`. It pulls a simple algorithmic sum of "how many items do I need to fit in a truck" (`totalItems`).
  - Iterates through all `AVAILABLE` trucks in the Mongo DB. Validates the residual mathematical capacity: if `Vehicle.maxCapacity - Vehicle.currentLoad >= totalItems`, then reserves the vehicle.
  - After mutating the MongoDB (increasing currentLoad and saving in the array of packages), the key event **`ShipmentAssigned`** is produced.

### 2. Final Event Deactivation and Tracking (Dispatch Flow)
- The emission of `VehicleDispatched` event serves as the final signature sent to Kafka to archive that the truck has left the yard or to inform external architectures.
