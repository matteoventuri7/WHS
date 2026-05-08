# WHS — Event-Driven Warehouse Management System

A didactical microservices simulator demonstrating **event-driven architecture**, **CQRS patterns**, and **choreography-based coordination** in a warehouse domain. Built with Node.js, NestJS, Kafka, MongoDB, and Next.js.

## Overview

WHS decomposes a typical warehouse lifecycle (inbound goods, inventory, orders, picking, shipping) into **four independent microservices** orchestrated through **Apache Kafka** events. Each service owns its domain logic and database, communicating asynchronously via an immutable event log. A **Next.js frontend** acts as an API Gateway, exposing a unified operator dashboard with **real-time updates via Server-Sent Events (SSE)**.

### Key Patterns

- **Microservices** with strict bounded contexts (database-per-service)
- **Event-Driven Architecture** with choreography (no central orchestrator)
- **Event Sourcing** design: Kafka holds the authoritative event log; MongoDB stores derived state
- **CQRS** via `@nestjs/cqrs`: CommandBus/QueryBus segregation for testability
- **Simulators** that drive the system end-to-end without manual UI interaction
- **Observability** via centralized logging (Fluent Bit + OpenObserve)

---

## Prerequisites

- **Node.js 22.22.2 LTS** (or later)
- **Docker & Docker Compose** (for Kafka, MongoDB, observability stack)
- ~6 GB free disk space (Kafka, 4× MongoDB, OpenObserve volumes)

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd WHS
npm install
```

### 2. Start the Full Stack

```bash
npm run docker:start
```

This command:
- Builds all Docker images (backend services, frontend, Kafka, MongoDB)
- Starts Kafka, MongoDB, log pipeline, and all microservices
- Waits for health checks to pass
- Frontend is ready at `http://localhost:3000`

**Expected startup time:** 30–60 seconds after all containers are running.

### 3. Verify the System

Open your browser:

| Component | URL | Purpose |
|-----------|-----|---------|
| **Frontend Dashboard** | http://localhost:3000 | Operator console (Orders, Inventory, Picking, Shipping) |
| **Kafka UI** | http://localhost:8090 | Topic introspection (read-only) |
| **OpenObserve** | http://localhost:5080 | Centralized logs (credentials: `root:root`) |

### 4. Start Simulators (Optional)

Toggle the simulator controls in the frontend **Status** page to auto-generate orders, inbound receipts, pickings, and shipments. Watch events flow through the system in real time.

## Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| **Frontend** | 3000 | Next.js API Gateway |
| **Inventory Service** | 3001 | Stock & reservations |
| **Order Service** | 3002 | Order lifecycle |
| **Picking Service** | 3003 | Picking tasks |
| **Shipping Service** | 3004 | Vehicle dispatch |
| **Simulators** | 3005–3008 | Workload generation (inbound, orders, picking, shipping) |
| **Kafka** | 9092 | Event broker |
| **Kafka UI** | 8090 | Topic inspector |
| **OpenObserve** | 5080 | Log aggregation |

---

## Screenshots

### Inventory & Inbound Management
Gestisci i livelli di stock e ricevi nuovi materiali in magazzino.

![Inventory & Inbound Dashboard](docs/images/Screenshot%202026-05-02%20054010.png)

### Order Management
Monitora il ciclo di vita degli ordini in uscita, dalle allocazioni ai completamenti.

![Order Management Dashboard](docs/images/Screenshot%202026-05-02%20054024.png)

### Picking Operations
Esegui i compiti di prelievo generati dagli ordini allocati.

![Picking Tasks Dashboard](docs/images/Screenshot%202026-05-02%20054103.png)

### Shipping & Dispatch
Gestisci la logistica, i veicoli e l'assegnazione finale dei carichi.

![Shipping & Dispatch Dashboard](docs/images/Screenshot%202026-05-02%20054055.png)

### System Status
Controllo della salute in tempo reale di tutti i microservizi e dell'infrastruttura.

![System Status Dashboard](docs/images/Screenshot%202026-05-02%20054124.png)

### Live Event Dashboard
Visualizza lo stream di messaggi Kafka in tempo reale da simulatori e microservizi.

![Live Event Dashboard](docs/images/Screenshot%202026-05-02%20054228.png)

### Centralized Logging (OpenObserve)
Analizza i log aggregati di tutti i servizi e traccia i flussi end-to-end.

![OpenObserve Logs](docs/images/Screenshot%202026-05-02%20054309.png)

### CI/CD Pipeline
Automazione di test e deployment per tutto lo stack.

![CI/CD Pipeline](docs/images/cicd-pipeline.png)

---

## Common Commands

### Development

```bash
# Run all tests
npm run test:all

# Start/stop the stack
npm run docker:start
npm run docker:stop
npm run docker:restart

# Rebuild a single service (e.g., inventory)
npm run docker:restart:inventory

# Reset databases (removes Mongo volumes)
npm run docker:clean:db

# View logs from a service
docker logs -f whs-inventory-service
docker logs -f whs-frontend
```

### Per-Service Commands

```bash
cd inventory-service
npm run start:dev     # Development with auto-reload
npm run test          # Jest unit tests
npm run test:cov      # Coverage report
npm run lint          # ESLint check
npm run build         # Build TypeScript
```

---

## Architecture at a Glance

### Event Flow (Happy Path)

```
Order Simulator → Order Service (OrderPlaced)
  ↓
Inventory Service (InventoryAllocated)
  ↓
Order Service (OrderReadyForPicking)
  ↓
Picking Service (PickingTaskCreated)
  ↓
Picking Simulator (PickingTaskCompleted)
  ↓
Shipping Service (ShipmentAssigned)
  ↓
Shipping Simulator (VehicleDispatched)
```

All communication flows through **Kafka topics**. Services react independently and asynchronously — a crash in one service does not block others. Failed orders can recover via **restock-driven resume**: when inventory is replenished, the Order Service automatically retries suspended orders.

### Real-Time UI Updates

```
Kafka Topic → Frontend /api/events (Kafka consumer)
  ↓
Server-Sent Events stream
  ↓
Browser (useRealtimeSSE hook)
  ↓
React state update → UI refresh
```

The frontend stays eventually consistent with the domain state—no polling required.

### Bounded Contexts

| Service | Aggregates | Responsibility |
|---------|-----------|-----------------|
| **Inventory** | `Inventory` | Stock per (productId, location), reservations |
| **Order** | `Order` | Order lifecycle, allocations, state machine |
| **Picking** | `PickingTask` | Picking task lifecycle |
| **Shipping** | `Vehicle`, `PendingShipment` | Vehicle assignment, dispatch |

---

## Testing

All services follow **Jest** with a three-tier pyramid:

- **Unit tests** (mocked Kafka/Mongo): `npm run test`
- **Bootstrap tests** (`main.spec.ts`): Kafka transport wiring
- **E2E tests** (supertest): HTTP contracts

```bash
# Run all tests across the monorepo
npm run test:all

# Run tests in a specific service with coverage
cd order-service && npm run test:cov
```

### Coverage Metrics

| Component | % Statements | % Branch | % Functions | % Lines |
|-----------|--------------|----------|-------------|---------|
| `inventory-simulator` | 100% | 78.94% | 100% | 100% |
| `order-simulator` | 96.74% | 79.24% | 100% | 96.61% |
| `picking-simulator` | 100% | 84.61% | 100% | 100% |
| `shipping-simulator` | 87.62% | 83.87% | 82.35% | 86.66% |
| `inventory-service` | 100% | 82.50% | 100% | 100% |
| `order-service` | 100% | 83.55% | 100% | 100% |
| `picking-service` | 100% | 83.78% | 100% | 100% |
| `shipping-service` | 100% | 79.80% | 100% | 100% |

*Note: branch coverage gaps in core services are attributable to NestJS TypeScript decorators (`@Inject`, `@Controller`) with untestable branch logic. All business logic pathways are fully covered.*

---

## Observability

### Logs (OpenObserve)

All service logs are aggregated into **OpenObserve** at http://localhost:5080 (login: `root:root`). Example query to trace an order:

```sql
SELECT timestamp, log 
FROM whs_logs 
WHERE log ILIKE '%order-1234%' 
ORDER BY timestamp ASC
```

### Kafka Topics

Use **Kafka UI** at http://localhost:8090 to inspect topic messages and consumer groups.

### Health Status

The frontend **Status** page aggregates health checks from all services at `/api/status`. Use it to detect which services are down or degraded.

---

## Useful Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Kill process: `Get-Process -Port 3000 \| Stop-Process` (PowerShell) |
| Kafka connection refused | Ensure `docker compose ps` shows Kafka running; wait for health check |
| MongoDB authentication failed | Check `MONGODB_URI` in docker-compose.yml includes `?authSource=admin` |
| Services not communicating | Verify `docker network inspect whs_default` shows all containers connected |
| Empty dashboard on first load | Give Kafka topic initialization 10–15 seconds; refresh browser |

---

## Project Structure

```
WHS/
├── frontend/                  # Next.js API Gateway & dashboards
├── inventory-service/         # Core: stock & reservations
├── order-service/             # Core: order lifecycle
├── picking-service/           # Core: picking tasks
├── shipping-service/          # Core: vehicle dispatch
├── simulators/                # Active test doubles
│   ├── inventory-simulator-service/
│   ├── order-simulator-service/
│   ├── picking-simulator-service/
│   └── shipping-simulator-service/
├── scripts/                   # Kafka topic initialization
├── docs/                      # Architecture documentation
│   ├── software-architecture-report.md
│   ├── MICROSERVICES_API_REFERENCE.md
│   └── diagrams/
├── docker-compose.yml         # Full stack orchestration
├── package.json               # Root npm workspace
└── README.md                  # This file
```

---

## Documentation

- **Architecture Report:** [docs/software-architecture-report.md](docs/software-architecture-report.md) — complete C&C views, ADRs, event flows, and quality attributes
- **Architecture Diagrams:** [docs/internal/architecture-diagram.md](docs/internal/architecture-diagram.md) — Mermaid diagrams (system topology, event flows, Kafka topics)
- **API Reference:** [docs/MICROSERVICES_API_REFERENCE.md](docs/MICROSERVICES_API_REFERENCE.md) — REST endpoints, Kafka events, payloads
- **Per-Service READMEs:**
  - [frontend/README_TECH.md](frontend/README_TECH.md) — Next.js frontend patterns
  - [inventory-service/README_TECH.md](inventory-service/README_TECH.md) — Stock & reservations service
  - [order-service/README_TECH.md](order-service/README_TECH.md) — Order lifecycle service
  - [picking-service/README_TECH.md](picking-service/README_TECH.md) — Picking tasks service
  - [shipping-service/README_TECH.md](shipping-service/README_TECH.md) — Vehicle dispatch service

---

## Key Trade-offs & Future Work

**Why Kafka (not RabbitMQ)?**  
Event log enables replay and event sourcing. Scalable via partitioning.

**Why Choreography (not Orchestration)?**  
Each service evolves independently; no central bottleneck. Trade-off: tracing is harder (mitigated by log aggregation).

**Why MongoDB (not PostgreSQL)?**  
Document model maps well to aggregates. No cross-service joins.

**Why Single-Stage Dockerfiles?**  
Faster iteration during development. Future: multi-stage builds to reduce image size.

**Why No Distributed Tracing?**  
Academic scope. Future: OpenTelemetry + Jaeger integration.

---

## License

This project is part of a university Software Architecture course. Use for educational purposes.

---

**Questions?** Check the [architecture report](docs/software-architecture-report.md) for deep dives on patterns, deployment, and design decisions.
