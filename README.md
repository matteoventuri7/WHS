# WHS (Warehouse Management System) Simulator

A microservices-based Event-Driven Warehouse Management System simulator built with Node.js, NestJS, React, Next.js, and Apache Kafka.

This system simulates the core operations of a modern automated warehouse, including inbound logistics, inventory management, outbound order processing, picking operations, and shipping. The architecture utilizes Event-Driven and Event Sourcing patterns via Kafka to ensure maximum decoupling and scalability among services.

## Project Structure

The project is structured as a monorepo containing multiple independent microservices and a frontend application:

### Core Microservices
- `inventory-service` (Port 3001): Manages stock levels, warehouse locations, and receives inbound goods.
- `order-service` (Port 3002): Manages the lifecycle of outbound orders (Pending, Suspended, Allocated, Shipped, Cancelled).
- `picking-service` (Port 3003): Generates and manages picking tasks for warehouse operators.
- `shipping-service` (Port 3004): Handles dispatching and assignment of goods to available transport vehicles.

### Simulators
These services act as automated or UI-driven actors to simulate real-world interactions:
- `simulators/inventory-simulator-service` (Port 3005): Simulates inbound operations (suppliers delivering goods).
- `simulators/shipping-simulator-service` (Port 3006): Simulates dispatch operations (vehicles leaving the warehouse).
- `simulators/order-simulator-service` (Port 3007): Generates random outbound orders.
- `simulators/picking-simulator-service` (Port 3008): Automatically completes pending picking tasks.

### Frontend
- `frontend` (Port 3000): A Next.js (React) web application that serves as the "God Mode" dashboard to monitor and interact with the entire warehouse system.

## Prerequisites
- **Docker** and **Docker Compose**
- **Node.js** (v18 or higher) for local development

## Getting Started

The easiest way to run the entire system is through Docker Compose, which will automatically orchestrate Kafka, Zookeeper, MongoDB instances, all microservices, and the frontend.

1. **Start the system:**
   ```bash
   npm run docker:start
   ```
   *Note: This command will build all Docker images and start the containers. A specialized `kafka-init` container will ensure all necessary Kafka topics are created before the microservices attempt to connect, avoiding startup race conditions.*

2. **Access the Frontend Simulator:**
   Open your browser and navigate to `http://localhost:3000`.

3. **Stop the system:**
   ```bash
   npm run docker:stop
   ```

4. **Restart the system:**
   ```bash
   npm run docker:restart
   ```

## Local Development & Testing

You can install dependencies and run tests across all workspaces (microservices) using npm workspaces:

```bash
# Install all dependencies across all packages
npm install

# Run tests for all microservices
npm run test:all
```

## Architecture details

For an in-depth explanation of the Event-Driven architecture, Event Sourcing, service topology, Kafka topics, and executive flows, please read the [Architecture Document](architecture_document.md).
