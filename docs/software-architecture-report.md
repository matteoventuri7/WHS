# WHS — Software Architecture Report

**Project:** WHS — Event-Driven Warehouse Management System (didactic simulator)
**Course:** Software Architecture
**Document type:** Architectural report
**Last updated:** May 2026
**Repository root:** `e:\uni\WHS`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architectural Drivers](#2-architectural-drivers)
3. [Methods For Gathering Architectural Drivers](#3-methods-for-gathering-architectural-drivers)
4. [Architectural Patterns](#4-architectural-patterns)
5. [Component & Connector View](#5-component--connector-view)
6. [Domain Model & Bounded Contexts (DDD)](#6-domain-model--bounded-contexts-ddd)
7. [Tools & Technology Stack](#7-tools--technology-stack)
8. [Event Catalog & API Reference](#8-event-catalog--api-reference)
9. [Event Flows (Behavioral Views)](#9-event-flows-behavioral-views)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Observability](#11-observability)
12. [Testing Strategy](#12-testing-strategy)
13. [Trade-offs & Alternatives Considered](#13-trade-offs--alternatives-considered)
14. [Architectural Decision Records (ADRs)](#14-architectural-decision-records-adrs)
15. [Known Limitations & Future Work](#15-known-limitations--future-work)
16. [Conclusions & Lessons Learned](#16-conclusions--lessons-learned)
17. [Appendix A — Glossary of Domain Events](#appendix-a--glossary-of-domain-events)
18. [Appendix B — REST API Summary](#appendix-b--rest-api-summary)
19. [Appendix C — Canonical NestJS Service Layout](#appendix-c--canonical-nestjs-service-layout)

---

## 1. Executive Summary

WHS is a didactic simulator of a **Warehouse Management System** (WMS) designed to demonstrate, in a small but realistic codebase, the application of *event-driven microservices* principles to a domain that is naturally event-rich (goods arrival, order placement, picking, shipping). The system is structured as a **monorepo** of nine deployable units running on Node.js 22.22.2:

- **Four core microservices** modelled around bounded contexts: `inventory-service`, `order-service`, `picking-service`, `shipping-service`.
- **Four simulator services** that emulate human operators or external systems by generating workload: `inventory-simulator-service`, `order-simulator-service`, `picking-simulator-service`, `shipping-simulator-service`.
- **One Next.js frontend** acting as a domain dashboard and operator console.

Asynchronous communication is mediated by **Apache Kafka** in **KRaft** mode (no ZooKeeper); each core service owns a private **MongoDB** database and exposes a **Socket.IO** gateway plus a small **REST** surface. Observability is implemented as a log-centric pipeline using **Fluent Bit** and **OpenObserve**, with **Kafka UI** providing topic introspection.

The goal of the report is to make the *architecturally significant* decisions and patterns explicit, justify them against measurable quality attributes, and document the runtime topology in **Component & Connector** notation, the deployment process, the observability stack, and the automated testing strategy.

Headline patterns adopted:

- **Microservices** with strict bounded contexts (database-per-service).
- **Event-Driven Architecture** with **choreography** (no orchestrator).
- **Event Sourcing** posture: Kafka holds the authoritative event log; MongoDB stores derived read state.
- **CQRS (code-level)** via `@nestjs/cqrs`: CommandBus/QueryBus segregation in every core service, with thin controllers as dispatchers.
- **Backend for Frontend (lite)**: Next.js fronts the operator UX and aggregates per-service data.
- **Initialization Container** pattern (`kafka-init`) to remove a startup race condition on topic creation.
- **Idempotent consumers** for cancellation flows.
- **Real-time push to UI** via Socket.IO gateways embedded in each core service.

---

## 2. Architectural Drivers

Architectural drivers are the *combination* of business goals, quality attributes, and constraints that shape the most consequential design decisions. They are documented here as **Architecturally Significant Requirements (ASRs)** following the *Stimulus / Source / Environment / Response / Response Measure* template typical of the **Quality Attribute Workshop (QAW)** and **ATAM** literature.

### 2.1. Business Goals & Context

WHS is an **academic** project, not a production system. The primary business goal is *pedagogical demonstration*: the architecture must showcase, end to end, the patterns and trade-offs introduced in the course, while remaining small enough to be operated and reasoned about by a single developer on a single machine. Within that umbrella, the following sub-goals are explicit:

- B1. Illustrate **bounded-context decomposition** of a typical WMS domain (inbound, inventory, order, picking, shipping).
- B2. Make the **event flow** visible and inspectable (live UI + Kafka UI + log aggregator).
- B3. Allow a *“god mode”* operator (the user) to exercise both the **happy path** and the **exception flows** (out-of-stock suspension, cancellation, restock-driven resume).
- B4. Provide **runnable simulators** so that the system can be demonstrated without manual interaction.

### 2.2. Quality Attributes (Prioritized)

The following attributes are treated as **drivers**. Performance and security were explicitly *deprioritized* given the academic scope and are discussed as limitations in §15.

| # | Quality Attribute       | Why it is a driver in WHS                                                                                       |
|---|-------------------------|------------------------------------------------------------------------------------------------------------------|
| 1 | **Loose coupling / Modifiability** | Each context must evolve independently; a change to picking logic must not ripple to shipping or inventory. |
| 2 | **Scalability**         | The chosen patterns must allow horizontal scaling per service; back-pressure must be absorbed by the broker.   |
| 3 | **Resilience**          | A single service crash must not stop the system; events must be replayable.                                    |
| 4 | **Testability**         | Every service must be unit- and end-to-end-testable in isolation, with mocked Kafka and MongoDB.               |
| 5 | **Observability**       | Logs from all containers must be centrally inspectable; topic traffic must be visible.                         |
| 6 | **Simulability**        | The system must run end-to-end without human input through the simulator services.                             |
| 7 | **Deployability**       | A single command (`npm run docker:start`) must bring the entire stack up reproducibly.                         |

### 2.3. ASR Scenarios

#### ASR-1 — Modifiability (adding a new event)

| Field             | Value |
|-------------------|-------|
| **Source**        | Developer extending domain logic |
| **Stimulus**      | Need to introduce a new domain event (e.g., `OrderCompleted`) |
| **Environment**   | System at design time, all services running |
| **Response**      | Add the topic to `scripts/init-kafka-topics.sh`; add an `@EventPattern` dispatch in the controller; create a new Command class + CommandHandler in `commands/`; emit via `ClientKafka` in the handler |
| **Response Measure** | Change confined to *one* service's controller dispatch + two new files in `commands/` + *one* line in the topic init script; **no edits to any other service** required |

#### ASR-2 — Scalability (independent horizontal scaling)

| Field             | Value |
|-------------------|-------|
| **Source**        | Operations engineer |
| **Stimulus**      | A spike of `OrderPlaced` events causes inventory checks to lag |
| **Environment**   | Production-like environment |
| **Response**      | Run additional instances of `inventory-service` joining the same `inventory-consumer` group; Kafka partitions distribute load |
| **Response Measure** | Throughput scales sub-linearly with the number of partitions; no other service requires reconfiguration |

#### ASR-3 — Resilience (broker-mediated decoupling)

| Field             | Value |
|-------------------|-------|
| **Source**        | Runtime fault |
| **Stimulus**      | `picking-service` crashes for 60 seconds |
| **Environment**   | Live system |
| **Response**      | Producers continue emitting; on restart, the consumer group resumes from the last committed offset |
| **Response Measure** | Zero events lost; UI eventually consistent within seconds of restart |

#### ASR-4 — Testability

| Field             | Value |
|-------------------|-------|
| **Source**        | CI pipeline / developer |
| **Stimulus**      | Need to validate a service’s logic without provisioning Kafka or MongoDB |
| **Environment**   | Local Jest runner |
| **Response**      | `Test.createTestingModule` with `useValue` overrides for `CommandBus`, `QueryBus`, `ClientKafka`, Mongoose `Model` |
| **Response Measure** | Full per-service unit suite runs under a few seconds, no external dependencies |

#### ASR-5 — Observability

| Field             | Value |
|-------------------|-------|
| **Source**        | Developer debugging an event flow |
| **Stimulus**      | An order is stuck in `SUSPENDED` |
| **Environment**   | All services live |
| **Response**      | Search OpenObserve for `orderId`; cross-check on Kafka UI which topics have/lack messages |
| **Response Measure** | Root cause identified through *log evidence only*, no need to attach a debugger |

#### ASR-6 — Simulability

| Field             | Value |
|-------------------|-------|
| **Source**        | Demonstrator at exam time |
| **Stimulus**      | Need to show end-to-end behavior without manual clicks |
| **Environment**   | Local docker-compose stack |
| **Response**      | Toggle `POST /inbound/start`, `POST /order-simulator/start`, `POST /picking-simulator/start`, `POST /shipping-simulator/start` |
| **Response Measure** | Continuous end-to-end traffic flowing through the system within seconds |

#### ASR-7 — Deployability

| Field             | Value |
|-------------------|-------|
| **Source**        | New developer cloning the repo |
| **Stimulus**      | First-time setup |
| **Environment**   | Machine with Node 22 and Docker installed |
| **Response**      | `npm run docker:start` |
| **Response Measure** | Entire stack (Kafka + 4 Mongo + 4 core + 4 simulators + frontend + observability) reaches steady state with no manual fix-ups |

### 2.4. Constraints

- **C1.** Single developer, academic budget → no managed services, no horizontal multi-host setup.
- **C2.** Local-first deployment → Docker Compose, no Kubernetes manifests in scope (though the architecture is designed to be K8s-ready).
- **C3.** Single Kafka broker, replication factor 1 → acceptable for the didactic context, *explicitly insufficient* for production.
- **C4.** No authentication or authorization → out of scope; treated as future work.
- **C5.** Node.js / TypeScript only across backend and frontend → reduces cognitive load for a solo developer.

---

## 3. Methods For Gathering Architectural Drivers

WHS is a **rework** of an earlier project that addressed the WMS domain but with a narrower scope and a different architectural approach: the original system consisted of just two microservices — a **picking service** and a **picking handler** — using message-driven communication. The decision to rebuild the system from scratch was driven by a specific research question: **how do event-driven patterns and a finer microservice granularity impact quality attributes such as performance, availability, loose coupling, and observability** compared to a less decomposed, message-driven design? By expanding the domain to the full warehouse lifecycle (inbound, inventory, orders, picking, shipping) and decomposing it into four bounded-context-aligned services with a durable event log (Kafka) and choreography-based coordination, the rework provides a concrete basis for comparing the two approaches and drawing architectural lessons.

The drivers in §2 emerged from pain points observed in the original project (tight coupling between modules, difficulty testing in isolation, lack of observability).

### 3.1. Prior Project & Real-WMS Domain Study

The first input was the **existing project** itself. The original system covered only the **picking** sub-domain, split across two microservices (picking service and picking handler). While this provided a starting point for understanding message-driven communication between services, the domain scope was too narrow to exercise the full range of architectural patterns targeted by the rework.

The rework therefore **expanded the domain** to the complete warehouse lifecycle. Bounded contexts such as **inbound goods receipt**, **inventory & locations**, **order management**, **wave/picking**, and **dispatch/shipping** were identified through a study of commercial WMS products and academic taxonomies, and mapped onto four core services. The ubiquitous language (see §6) — *order*, *allocation*, *picking task*, *vehicle*, *dispatch*, *location* — was partly inherited from the original project (picking-related terms) and partly introduced during this domain expansion.

Critically, the rework was motivated by a desire to explore the trade-offs of a more granular, event-driven decomposition: the original two-service design concentrated most logic in a small number of components, limiting independent scalability and making it harder to reason about failure boundaries. By expanding to four fine-grained services connected through Kafka event choreography, the new architecture allows a direct comparison of availability (per-service failure isolation), performance (asynchronous vs. coupled processing), modifiability (single-service changes), and observability (centralized event log + log aggregation). These research-oriented goals directly shaped the quality-attribute priorities in §2.2.

### 3.2. Iterative Prototyping (on the Reworked Codebase)

The second input was empirical: starting from the domain knowledge inherited from the original project, each iteration of the *new* codebase exposed quality-attribute issues that were then fed back into the architecture.

- **Iteration 0.** Single-service prototype with in-memory state. Used to validate the new technology stack (NestJS + Kafka + Mongoose) and to extend the domain model beyond the picking scope of the prior project.
- **Iteration 1.** Split into the four core services, expanding from the original two-service picking-only scope to the full warehouse lifecycle. Choreography over Kafka replaced the message-driven approach of the original system. Database-per-service introduced. *Outcome:* validated B1 (bounded contexts) and Q1 (loose coupling).
- **Iteration 2.** Added simulators to drive the system without manual UI clicks. *Outcome:* validated B4/Q6 (simulability).
- **Iteration 3.** Observed a startup race condition where multiple consumers subscribed to topics that did not yet exist, occasionally crashing services with `UNKNOWN_TOPIC_OR_PARTITION`. *Outcome:* introduced the **`kafka-init` initialization container** (see ADR-006).
- **Iteration 4.** Added Fluent Bit + OpenObserve + Kafka UI to satisfy ASR-5 (observability) — a capability entirely absent in the original project.
- **Iteration 5.** Added cancellation flow with `CancelPickingTask` event and idempotent consumers, exposing a real exception path.
- **Iteration 6.** Refactored all core services from a monolithic `AppService` to **CQRS pattern** via `@nestjs/cqrs` (CommandBus + QueryBus), eliminating god-service anti-pattern and enabling per-handler unit testing. *Outcome:* validated Q4 (testability) and Q1 (modifiability — adding a new command is a two-file operation).

This *grounded* the drivers: each ASR in §2 traces back either to a limitation of the original project or to a concrete iteration of the rework that either failed without it or was simplified by it.

### 3.3. ADD-style Decomposition

The third input was an informal application of **Attribute-Driven Design (ADD)**: starting from the prioritized quality attributes, each architectural decision was justified by the attribute it was meant to satisfy, and the *next* decomposition step was driven by the *next* attribute on the list.

For instance:

- *Loose coupling* drove the choice of **asynchronous messaging over synchronous REST** between services.
- *Scalability* + *resilience* drove the choice of **Kafka over a transient broker** like RabbitMQ in `direct` mode (event log + replay).
- *Testability* drove the choice of **NestJS dependency injection + `@nestjs/cqrs` + `Test.createTestingModule`** patterns over hand-rolled wiring.
- *Observability* drove the choice of **structured stdout logging + a fluentd-driver pipeline** over ad-hoc file logs.
- *Deployability* drove the choice of **Docker Compose + `kafka-init`** over a manual startup script.

---

## 4. Architectural Patterns

This section enumerates the architectural and design patterns actually used in the codebase, with citations to source files. ADRs (§14) discuss the *decision* aspects in more detail; this section focuses on *what* the patterns are and *where* they manifest.

### 4.1. Microservices

Each bounded context is a separately deployable NestJS application with its own `Dockerfile`, `package.json`, and Mongo database.

- [inventory-service/](../inventory-service/), [order-service/](../order-service/), [picking-service/](../picking-service/), [shipping-service/](../shipping-service/) are independent npm workspaces declared at the root [package.json](../package.json).
- Each service has a separate Mongo container in [docker-compose.yml](../docker-compose.yml): `inventory-db` (27017), `order-db` (27018), `picking-db` (27019), `shipping-db` (27020).
- No service shares a database with any other.

### 4.2. Event-Driven Architecture (EDA) with Choreography

Services do not call each other synchronously over REST. They communicate by *publishing* domain events to Kafka topics and *reacting* to them. There is no central orchestrator: each service decides autonomously what to do when it receives an event.

In NestJS terms, the producer side is `ClientKafka` injected into a `CommandHandler`:

```ts
// order-service/src/commands/place-order.handler.ts
this.kafkaClient.emit('OrderPlaced', { orderId, items });
```

The consumer side is `@EventPattern(...)` on the controller, which dispatches to the `CommandBus`:

```ts
// inventory-service/src/app.controller.ts
@EventPattern('OrderPlaced')
async handleOrderPlaced(@Payload() message: any) {
  await this.commandBus.execute(new HandleOrderPlacedCommand(message.orderId, message.items));
}
```

### 4.3. Event Sourcing

The system adopts an *event-sourcing* without committing to a full event-sourced data model: **Kafka is the authoritative event log**, MongoDB stores **derived read state** that each service maintains by consuming its events.

In practice, replay is feasible because Kafka retains the events; the schemas in §6 are derivable from event sequences.

### 4.4. CQRS — Code-Level (via `@nestjs/cqrs`)

Every core microservice adopts the **CQRS (Command Query Responsibility Segregation)** pattern *at code level* through the `@nestjs/cqrs` module. Write operations (order placement, Kafka event handling, status updates) are modelled as **Command + CommandHandler** pairs; read operations (data queries for the UI) are modelled as **Query + QueryHandler** pairs.

The controller is a **thin dispatcher**: it does not contain business logic; it merely translates HTTP requests and `@EventPattern` Kafka messages into command/query objects and dispatches them via the `CommandBus` or `QueryBus`.

```ts
// order-service/src/app.controller.ts (excerpt)
@Controller('orders')
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async placeOrder(@Body() body: { items: ... }) {
    return this.commandBus.execute(new PlaceOrderCommand(body.items));
  }

  @Get()
  async getOrders() {
    return this.queryBus.execute(new GetAllOrdersQuery());
  }

  @EventPattern('InventoryAllocated')
  async handleInventoryAllocated(@Payload() message: any) {
    await this.commandBus.execute(
      new HandleInventoryAllocatedCommand(message.orderId, message.allocations),
    );
  }
}
```

Each `CommandHandler` encapsulates the full business logic for a single use-case: Kafka emission, MongoDB writes, and WebSocket notification:

```ts
// order-service/src/commands/place-order.handler.ts
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(command: PlaceOrderCommand) {
    const order = new this.orderModel({ items: command.items, status: 'PENDING' });
    await order.save();
    this.kafkaClient.emit('OrderPlaced', { orderId: order.orderId, items: order.items });
    this.eventsGateway.notifyDataChanged();
    return order;
  }
}
```

**Important:** both read and write paths share the same MongoDB instance — there is no infrastuctural separation between a write store and a read store. The CQRS is purely a *code-organization* concern that improves testability (handlers can be unit-tested in isolation from the controller) and modifiability (adding a new command does not touch the controller's existing methods).

The canonical file layout per service is:

```
src/
  app.controller.ts         # Thin dispatcher (CommandBus + QueryBus)
  commands/
    <name>.command.ts       # DTO with constructor params
    <name>.handler.ts       # @CommandHandler — business logic
    index.ts                # exports CommandHandlers[]
  queries/
    <name>.query.ts         # DTO (often empty)
    <name>.handler.ts       # @QueryHandler — MongoDB read
    index.ts                # exports QueryHandlers[]
```

### 4.5. Database-per-Service

Each service has a private MongoDB instance with a service-specific connection string injected via `MONGODB_URI`:

```yaml
# docker-compose.yml — inventory-service
environment:
  - MONGODB_URI=mongodb://root:example@inventory-db:27017/inventory?authSource=admin
```

This guarantees independent schema evolution and enables the simulability driver (a service can be reset by clearing only its own database, see `npm run docker:clean:db`).

### 4.6. Backend for Frontend (lite)

The Next.js frontend at [frontend/](../frontend/) acts as a slim BFF: it aggregates data from the four core services for the operator dashboards, and exposes its own API routes that proxy to backend services. The mapping is configured at startup via `PORT_TO_SERVICE`:

```yaml
# docker-compose.yml — frontend
- PORT_TO_SERVICE={"3001":"inventory-service","3002":"order-service",...}
```

### 4.7. Real-Time Push via WebSocket Gateways

Each core service embeds a Socket.IO gateway emitting a `dataChanged` event whenever its read state mutates. The frontend listens and triggers re-fetches.

```ts
// inventory-service/src/events.gateway.ts
@WebSocketGateway({ cors: true })
export class EventsGateway {
  @WebSocketServer() server: Server;
  notifyDataChanged() { this.server.emit('dataChanged'); }
}
```

This avoids polling and keeps the UI eventually consistent with the read model (cf. §11 on observability).

### 4.8. Initialization Container Pattern (`kafka-init`)

At startup, a dedicated short-lived container creates all 13 topics with `--if-not-exists` before any service is allowed to start. All core services declare:

```yaml
depends_on:
  kafka-init:
    condition: service_completed_successfully
```

This eliminates a documented race condition where consumers could subscribe to non-existent topics and crash. See ADR-006 (§14).

### 4.9. Idempotent Consumer (cancellation)

The cancellation flow tolerates duplicate or out-of-order events: `Order Service` checks the current order state before transitioning, and `Picking Service` only cancels a task if it is `PENDING`:

```ts
// order-service/src/commands/cancel-order.handler.ts (excerpt)
if (order.status === 'CANCELLED') {
  return order; // Already cancelled
}
if (order.status === 'ALLOCATED') {
  this.kafkaClient.emit('CancelPickingTask', { orderId });
}
```

### 4.10. Simulator / Test-Double Pattern

The four simulator services are not part of the domain — they are *active test doubles* that exercise the real services in real environments. Each is a thin NestJS app that drives the core services exclusively over their public REST APIs, without interacting with Kafka directly. This satisfies the *simulability* driver without polluting the production code paths.

### 4.11. Health Check Endpoint Convention

Every core service exposes a `GET /<service>/health` endpoint that returns `{ status: 'ok', service: '<name>' }`. This is used both by humans and as an e2e smoke test (see §12).

```ts
// inventory-service/src/app.controller.ts
@Get('health')
getHealth() { return { status: 'ok', service: 'inventory' }; }
```

---

## 5. Component & Connector View

The **Component & Connector (C&C)** viewtype, from the Documenting Software Architectures (SEI) tradition, models the runtime structure of the system as a graph of *components* (units with runtime presence) connected by *connectors* (typed interaction mechanisms). It is the most relevant view for an event-driven system because it makes the asynchronous traffic explicit.

### 5.1. Component Catalog

| Component (Container)             | Type                | Port (host) | Role                                                                   |
|-----------------------------------|---------------------|-------------|-------------------------------------------------------------------------|
| `frontend`                        | Next.js app         | 3000        | Operator dashboards & BFF                                              |
| `inventory-service`               | NestJS microservice | 3001        | Inventory + reservations + inbound goods                                |
| `order-service`                   | NestJS microservice | 3002        | Order lifecycle and allocation orchestration (per-order)               |
| `picking-service`                 | NestJS microservice | 3003        | Picking task lifecycle                                                  |
| `shipping-service`                | NestJS microservice | 3004        | Vehicle assignment and dispatch                                         |
| `inventory-simulator-service`     | NestJS service      | 3005        | Triggers inbound goods receipt via REST (`POST /inventory/receive`)     |
| `shipping-simulator-service`      | NestJS service      | 3006        | Auto-dispatches loaded vehicles via REST                                |
| `order-simulator-service`         | NestJS service      | 3007        | Auto-creates and randomly cancels orders via REST                       |
| `picking-simulator-service`       | NestJS service      | 3008        | Auto-completes picking tasks via REST                                   |
| `kafka` (KRaft)                   | Apache Kafka        | 9092 / 29092 | Durable event log / message broker                                     |
| `kafka-init`                      | One-shot init       | —           | Pre-creates all 13 topics                                               |
| `kafka-ui`                        | Provectus Kafka UI  | 8090        | Topic introspection (read-only)                                         |
| `inventory-db`                    | MongoDB             | 27017       | Read store for inventory                                                |
| `order-db`                        | MongoDB             | 27018       | Read store for orders                                                   |
| `picking-db`                      | MongoDB             | 27019       | Read store for picking tasks                                            |
| `shipping-db`                     | MongoDB             | 27020       | Read store for vehicles + pending shipments                             |
| `fluent-bit`                      | Log shipper         | 24224 (in)  | Receives container logs over fluentd protocol, filters, forwards        |
| `openobserve`                     | Log/observability   | 5080        | Stores and queries aggregated logs                                      |

### 5.2. Connector Catalog

| Connector type                  | Direction                                    | Wire protocol           |
|---------------------------------|----------------------------------------------|-------------------------|
| **Kafka pub/sub**               | Producer → Topic → Consumer                  | Kafka binary, port 9092 |
| **REST**                        | Frontend → Service / Simulator → Service     | HTTP/JSON               |
| **WebSocket**                   | Service → Frontend                           | Socket.IO over HTTP     |
| **Mongo wire protocol**         | Service → its own DB                         | TCP 27017 (per container) |
| **Fluentd forward**             | Container stdout → fluent-bit                | Fluentd on TCP 24224    |
| **HTTP JSON ingest**            | fluent-bit → openobserve                     | HTTP POST `/api/.../whs_logs/_json` |
| **Kafka admin TCP**             | kafka-ui → kafka                             | Kafka admin protocol    |

### 5.3. C&C Diagram

This new C&C view, specifically authored for this report, is typed: each connector is annotated with the protocol used.

```mermaid
flowchart LR
    subgraph Client["Browser / Operator"]
        U["UI"]
    end

    subgraph FE["frontend (Next.js :3000)"]
        FEAPI["BFF / Pages"]
    end

    subgraph Core["Core Services"]
        direction TB
        INV["inventory-service :3001"]
        ORD["order-service :3002"]
        PICK["picking-service :3003"]
        SHIP["shipping-service :3004"]
    end

    subgraph Sims["Simulators"]
        direction TB
        INVSIM["inventory-simulator :3005"]
        SHIPSIM["shipping-simulator :3006"]
        ORDSIM["order-simulator :3007"]
        PICKSIM["picking-simulator :3008"]
    end

    subgraph Broker["Kafka KRaft :9092 / :29092"]
        TOPICS[("13 topics")]
        KINIT["kafka-init (one-shot)"]
    end

    subgraph DBs["Mongo per service"]
        IDB[("inventory-db :27017")]
        ODB[("order-db :27018")]
        PDB[("picking-db :27019")]
        SDB[("shipping-db :27020")]
    end

    subgraph Obs["Observability"]
        FB["fluent-bit :24224"]
        OO["openobserve :5080"]
        KUI["kafka-ui :8090"]
    end

    U -- "HTTP" --> FEAPI
    FEAPI -- "REST" --> INV
    FEAPI -- "REST" --> ORD
    FEAPI -- "REST" --> PICK
    FEAPI -- "REST" --> SHIP
    INV -- "WebSocket" --> FEAPI
    ORD -- "WebSocket" --> FEAPI
    PICK -- "WebSocket" --> FEAPI
    SHIP -- "WebSocket" --> FEAPI

    INV <-- "Kafka pub/sub" --> TOPICS
    ORD <-- "Kafka pub/sub" --> TOPICS
    PICK <-- "Kafka pub/sub" --> TOPICS
    SHIP <-- "Kafka pub/sub" --> TOPICS

    INVSIM -- "REST" --> INV
    ORDSIM -- "REST" --> ORD
    ORDSIM -- "REST" --> INV
    PICKSIM -- "REST" --> PICK
    SHIPSIM -- "REST" --> SHIP

    KINIT -- "create --if-not-exists" --> TOPICS

    INV -- "Mongo TCP" --> IDB
    ORD -- "Mongo TCP" --> ODB
    PICK -- "Mongo TCP" --> PDB
    SHIP -- "Mongo TCP" --> SDB

    INV -. "fluentd 24224" .-> FB
    ORD -. "fluentd 24224" .-> FB
    PICK -. "fluentd 24224" .-> FB
    SHIP -. "fluentd 24224" .-> FB
    FB -. "HTTP JSON" .-> OO
    KUI -. "Kafka admin" .-> TOPICS
```

### 5.4. Per-Component Detail

#### 5.4.1. `frontend` (Next.js 16)

- **Role:** operator dashboards (Orders, Inventory, Picking, Shipping, Status, Inbound), plus an internal API used to proxy backend calls.
- **Inbound connectors:** HTTP from the browser; WebSocket events from each core service.
- **Outbound connectors:** REST to the four core services; WebSocket subscriptions.
- **Dependencies:** declared in [docker-compose.yml](../docker-compose.yml) — `frontend` waits for Kafka, `kafka-init`, and all core/simulator services before starting (only for orderly UX bootstrap; the UI can technically render without backends).

#### 5.4.2. `inventory-service`

- **Schema:** a single `Inventory` aggregate keyed by `(productId, location)` with `quantity` and `reservedQuantity` ([inventory.schema.ts](../inventory-service/src/schemas/inventory.schema.ts)).
- **Consumed events:** `OrderPlaced`, `OrderCancelled`.
- **Produced events:** `ItemStored`, `InventoryAllocated`, `OutOfStock`.
- **REST:** `POST /inventory/receive`, `GET /inventory`, `GET /inventory/health`.
- **Behavior:** owns stock levels and reservation logic. On `OrderPlaced`, the `HandleOrderPlacedHandler` iterates the requested items and attempts to reserve sufficient quantity at a matching location; if all items are satisfiable it emits `InventoryAllocated` (carrying the resolved allocations), otherwise it emits `OutOfStock`. On `POST /inventory/receive` (from the simulator), the `ReceiveGoodsHandler` increments the stored quantity at the specified location and emits `ItemStored`, which in turn allows the Order Service to retry suspended orders. On `OrderCancelled`, the `HandleOrderCancelledHandler` releases the reserved quantities recorded in the event's `allocations` payload and emits `ItemStored` to signal that stock is again available.

#### 5.4.3. `order-service`

- **Schema:** `Order` aggregate with `orderId`, `items[]`, `status`, `allocations[]` ([order.schema.ts](../order-service/src/schemas/order.schema.ts)). Status enum: `PENDING | SUSPENDED | ALLOCATED | PICKING_COMPLETED | SHIPPED | CANCELLED`.
- **Consumed:** `InventoryAllocated`, `OutOfStock`, `ItemStored`, `PickingTaskCompleted`, `ShipmentAssigned`.
- **Produced:** `OrderPlaced`, `OrderCancelled`, `OrderReadyForPicking`, `OrderSuspended`, `CancelPickingTask`.
- **REST:** `POST /orders`, `GET /orders`, `PATCH /orders/:id/cancel`, `PATCH /orders/:id/resume`, `GET /orders/health`.
- **Behavior:** owns the per-order state machine. On `POST /orders`, the `PlaceOrderHandler` persists the order as `PENDING` and emits `OrderPlaced` to trigger inventory allocation. On `InventoryAllocated`, the `HandleInventoryAllocatedHandler` transitions to `ALLOCATED` and emits `OrderReadyForPicking`; on `OutOfStock`, the `HandleOutOfStockHandler` transitions to `SUSPENDED` and emits `OrderSuspended`. On `ItemStored`, the `HandleItemStoredHandler` scans for suspended orders matching the restocked product and re-emits `OrderPlaced` for each (the **restock flow**). On `PickingTaskCompleted`, transitions to `PICKING_COMPLETED`; on `ShipmentAssigned`, transitions to `SHIPPED`. Cancellation via `PATCH /orders/:id/cancel` dispatches a `CancelOrderCommand` which transitions any cancellable order to `CANCELLED`, conditionally emits `CancelPickingTask` (if previously `ALLOCATED`), and always emits `OrderCancelled` carrying `previousStatus` and `allocations` so Inventory can release reserved stock.

#### 5.4.4. `picking-service`

- **Schema:** `PickingTask` aggregate with `taskId`, `orderId`, `allocations[]`, `status` ∈ `{PENDING, IN_PROGRESS, COMPLETED, CANCELLED}` ([picking.schema.ts](../picking-service/src/schemas/picking.schema.ts)).
- **Consumed:** `OrderReadyForPicking`, `CancelPickingTask`.
- **Produced:** `PickingTaskCreated`, `PickingTaskCompleted`.
- **REST:** `GET /picking/tasks`, `POST /picking/tasks/:taskId/complete`, `GET /picking/health`.
- **Behavior:** owns the picking task lifecycle. On `OrderReadyForPicking`, the `HandleOrderReadyForPickingHandler` creates a `PickingTask` in `PENDING` state and emits `PickingTaskCreated`. When a worker (or the simulator) calls `POST /picking/tasks/:taskId/complete`, the `CompletePickingTaskHandler` transitions the task to `COMPLETED` and emits `PickingTaskCompleted`. On `CancelPickingTask`, the `HandleCancelPickingTaskHandler` cancels the task only if still `PENDING` (idempotent guard).

#### 5.4.5. `shipping-service`

- **Schemas:** `Vehicle` aggregate (`vehicleId`, `maxCapacity`, `currentLoad`, `assignedTaskIds[]`, `status` ∈ `{AVAILABLE, DISPATCHED}`) and `PendingShipment` aggregate ([vehicle.schema.ts](../shipping-service/src/schemas/vehicle.schema.ts), [pending-shipment.schema.ts](../shipping-service/src/schemas/pending-shipment.schema.ts)).
- **Consumed:** `PickingTaskCompleted`.
- **Produced:** `VehicleRegistered`, `ShipmentAssigned`, `VehicleDispatched`.
- **REST:** `GET /shipping/vehicles`, `POST /shipping/vehicles`, `POST /shipping/vehicles/:id/dispatch`, `GET /shipping/pending`, `GET /shipping/health`.
- **Behavior:** owns the vehicle lifecycle and outbound shipment assignment. On `PickingTaskCompleted`, the `HandlePickingTaskCompletedHandler` attempts to assign the task to an available vehicle with spare capacity and emits `ShipmentAssigned`; if no suitable vehicle exists, the task is persisted as a `PendingShipment` and will be assigned once a vehicle with sufficient capacity is registered. When an operator (or the shipping simulator) calls `POST /shipping/vehicles/:id/dispatch`, the `DispatchVehicleHandler` transitions the vehicle to `DISPATCHED` and emits `VehicleDispatched`.

#### 5.4.6. Simulators

| Simulator                       | Drives                                            | Mechanism                  |
|---------------------------------|---------------------------------------------------|----------------------------|
| `inventory-simulator-service`   | inbound goods (`POST /inventory/receive`)         | REST → inventory           |
| `order-simulator-service`       | order placement + random cancellation             | REST → order/inventory     |
| `picking-simulator-service`     | task completion                                    | REST → picking             |
| `shipping-simulator-service`    | vehicle dispatch                                   | REST → shipping            |

Each simulator exposes start/stop/status endpoints for runtime control (see Appendix B).

---

## 6. Domain Model & Bounded Contexts (DDD)

The system uses **Domain-Driven Design (DDD)** applied at the level of *strategic design*: the four core services correspond to four **bounded contexts**, each with its own ubiquitous language and aggregates. *Tactical* DDD constructs (rich aggregates, value objects, domain services) are intentionally kept lightweight given the academic scope.

### 6.1. Bounded Contexts

| Bounded Context | Aggregate(s)                       | Owns                                                                 |
|-----------------|------------------------------------|----------------------------------------------------------------------|
| Inventory       | `Inventory`                        | Stock per (productId, location), reservations, inbound receipts      |
| Order           | `Order`                            | Order lifecycle, items, captured allocations                         |
| Picking         | `PickingTask`                      | Picking tasks generated from allocated orders                        |
| Shipping        | `Vehicle`, `PendingShipment`       | Vehicles, capacity, dispatch state, queue of pending shipments       |

### 6.2. Ubiquitous Language

| Term              | Meaning in WHS                                                       | Source                                  |
|-------------------|-----------------------------------------------------------------------|-----------------------------------------|
| **Allocation**    | A reservation of stock at a specific location for a specific order   | `Inventory.reservedQuantity`, `Order.allocations` |
| **Picking task**  | A list of items to be physically retrieved from a location           | `PickingTask`                           |
| **Pending shipment** | A completed picking task awaiting vehicle assignment              | `PendingShipment`                       |
| **Dispatch**      | The act of sending a loaded vehicle out of the warehouse             | `Vehicle.status = DISPATCHED`           |
| **Inbound**       | Goods arriving from a supplier, to be stored                         | `POST /inventory/receive` endpoint      |
| **Restock**       | Stock arrival that *unblocks* previously suspended orders            | `ItemStored` triggering retry           |

### 6.3. Order State Machine

The most complex domain object is the `Order`. Its lifecycle is implemented across the command handlers in [order-service/src/commands/](../order-service/src/commands/) and validated by tests in [order-service/test/](../order-service/test/).

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /orders
    PENDING --> ALLOCATED: InventoryAllocated
    PENDING --> SUSPENDED: OutOfStock
    SUSPENDED --> PENDING: ItemStored (auto retry)
    SUSPENDED --> PENDING: PATCH /orders/{id}/resume
    ALLOCATED --> PICKING_COMPLETED: PickingTaskCompleted
    PICKING_COMPLETED --> SHIPPED: ShipmentAssigned
    PENDING --> CANCELLED: PATCH /cancel
    ALLOCATED --> CANCELLED: PATCH /cancel (emits CancelPickingTask)
    SUSPENDED --> CANCELLED: PATCH /cancel
    PICKING_COMPLETED --> [*]: (cannot cancel)
    SHIPPED --> [*]: (cannot cancel)
    CANCELLED --> [*]
```

Two transitions are *forbidden* and are enforced as preconditions in the `CancelOrderHandler`:

```ts
// order-service/src/commands/cancel-order.handler.ts
if (order.status === 'SHIPPED')          throw new Error(`Cannot cancel a shipped order`);
if (order.status === 'PICKING_COMPLETED') throw new Error(`Cannot cancel an order with completed picking task`);
```

### 6.4. Picking Task State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: OrderReadyForPicking
    PENDING --> COMPLETED: POST /complete
    PENDING --> CANCELLED: CancelPickingTask
    COMPLETED --> [*]
    CANCELLED --> [*]
```

`IN_PROGRESS` is reserved in the schema for future operator hand-off mid-task but is currently unused.

### 6.5. Vehicle State Machine

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE: POST /shipping/vehicles
    AVAILABLE --> AVAILABLE: ShipmentAssigned (load+=1)
    AVAILABLE --> DISPATCHED: POST /vehicles/{id}/dispatch
    DISPATCHED --> [*]
```

### 6.6. Anti-Corruption Layer

The simulators play the role of an **Anti-Corruption Layer (ACL)** for the artificial workload generation: instead of polluting the core services with “demo data” seeders, simulators sit *outside* the bounded contexts and drive them through their public API REST endpoints. This preserves the integrity of the domain model.

---

## 7. Tools & Technology Stack

The stack is deliberately small to match the constraints in §2.4. Versions are taken from the actual `package.json` files at the time of writing.

### 7.1. Languages and Runtime

| Layer            | Technology                       | Version            |
|------------------|----------------------------------|--------------------|
| Backend runtime  | Node.js                          | 22.22.2 (LTS)      |
| Backend language | TypeScript                       | 5.7.3              |
| Frontend runtime | Node.js                          | 22.22.2 (LTS)      |
| Frontend language| TypeScript                       | 5.7.3              |

The Node version is pinned via `engines` in every `package.json` (root and per-service).

### 7.2. Backend Frameworks

| Concern                         | Library                                          | Version      |
|---------------------------------|--------------------------------------------------|--------------|
| HTTP application framework      | `@nestjs/core`, `@nestjs/common`                 | 11.x         |
| HTTP platform                   | `@nestjs/platform-express`                       | 11.x         |
| CQRS (code-level)              | `@nestjs/cqrs`                                   | 11.x         |
| Microservices / Kafka transport | `@nestjs/microservices`                          | 11.1.x       |
| Kafka client                    | `kafkajs`                                        | 2.2.x        |
| ODM                             | `@nestjs/mongoose`, `mongoose`                   | 11.x / 9.2.x |
| WebSockets                      | `@nestjs/websockets`, `@nestjs/platform-socket.io` | 11.1.x     |
| Reactive primitives             | `rxjs`                                           | 7.8.x        |

### 7.3. Frontend

| Concern                | Library              | Version |
|------------------------|----------------------|---------|
| App framework          | `next`               | 16.1.6  |
| UI runtime             | `react`, `react-dom` | 19.2.x  |
| Styling                | `tailwindcss`        | 4.x     |
| Real-time              | `socket.io-client`   | 4.8.x   |
| Animations             | `framer-motion`      | 12.x    |
| Icons                  | `lucide-react`       | 0.577.x |

### 7.4. Messaging

| Component | Choice                        | Notes                                                |
|-----------|-------------------------------|------------------------------------------------------|
| Broker    | Apache Kafka (image `apache/kafka:latest`) | Run in **KRaft mode**, no ZooKeeper sidecar. |
| Listeners | `PLAINTEXT://:9092` (intra-Docker) and `PLAINTEXT_HOST://:29092` (host) | See [docker-compose.yml](../docker-compose.yml). |
| Topology  | Single broker, 1 partition per topic, replication factor 1 | Acceptable for didactic context. |

### 7.5. Persistence

| Service          | Database                        | Image           | Port (host) |
|------------------|---------------------------------|-----------------|-------------|
| inventory-service | `inventory` DB                 | `mongo:latest`  | 27017       |
| order-service     | `order` DB                     | `mongo:latest`  | 27018       |
| picking-service   | `picking` DB                   | `mongo:latest`  | 27019       |
| shipping-service  | `shipping` DB                  | `mongo:latest`  | 27020       |

All Mongo instances share a development credential `root:example` — see §15 (security).

### 7.6. Tooling

| Concern               | Tool                                |
|-----------------------|-------------------------------------|
| Test runner           | Jest 30 + ts-jest 29                |
| HTTP integration test | supertest 7                         |
| Linting               | ESLint 9 (with `typescript-eslint`) |
| Formatting            | Prettier 3                          |
| Build (backend)       | `nest build` (uses tsc under the hood) |
| Build (frontend)      | `next build`                        |
| Workspaces            | npm workspaces (root `package.json`) |

### 7.7. Infrastructure & DevOps

| Concern                 | Tool                                         |
|-------------------------|----------------------------------------------|
| Containerization        | Docker (one image per service)               |
| Orchestration (local)   | Docker Compose                               |
| Topic bootstrap         | Custom `kafka-init` container running [`scripts/init-kafka-topics.sh`](../scripts/init-kafka-topics.sh) |
| Healthchecks            | Built into Kafka and OpenObserve services    |
| Logging driver          | `fluentd` Docker logging driver              |

### 7.8. Observability Stack

| Component   | Image                                         | Role                                |
|-------------|-----------------------------------------------|--------------------------------------|
| Fluent Bit  | `fluent/fluent-bit:latest`                    | Log shipper, filter, transform       |
| OpenObserve | `openobserve/openobserve:latest`              | Log storage + query UI               |
| Kafka UI    | `provectuslabs/kafka-ui:latest`               | Topic / consumer-group introspection |

### 7.9. Why this stack

- **NestJS** was chosen because its decorator-based DI maps cleanly to Kafka `@EventPattern` listeners, gives free Socket.IO integration, and makes testability (ASR-4) trivial via `Test.createTestingModule`.
- **Kafka in KRaft mode** removes the operational burden of ZooKeeper while still providing a durable event log (the basis of the event-sourcing posture in §4.3).
- **MongoDB** was preferred over a relational store because the read models are document-shaped (orders with embedded items, vehicles with assigned tasks) and because no cross-service transactions are needed.
- **Fluent Bit + OpenObserve** is a stack with a tiny memory footprint and strong fluentd-protocol compatibility.

---

## 8. Event Catalog & API Reference

### 8.1. Topic Catalog

The 13 topics are pre-created at startup by the `kafka-init` container, which executes [`scripts/init-kafka-topics.sh`](../scripts/init-kafka-topics.sh). Each topic has 1 partition and replication factor 1.

| Topic                      | Producer(s)              | Consumer(s)              |
|----------------------------|--------------------------|--------------------------|
| `OrderPlaced`              | order-service            | inventory-service        |
| `OrderCancelled`           | order-service            | inventory-service        |
| `OrderReadyForPicking`     | order-service            | picking-service          |
| `OrderSuspended`           | order-service            | (UI / future)            |
| `CancelPickingTask`        | order-service            | picking-service          |
| `InventoryAllocated`       | inventory-service        | order-service            |
| `OutOfStock`               | inventory-service        | order-service            |
| `ItemStored`               | inventory-service        | order-service            |
| `PickingTaskCreated`       | picking-service          | (UI / future)            |
| `PickingTaskCompleted`     | picking-service          | order-service, shipping-service |
| `ShipmentAssigned`         | shipping-service         | order-service            |
| `VehicleDispatched`        | shipping-service         | (UI / future)            |
| `VehicleRegistered`        | shipping-service         | (UI / future)            |

### 8.2. Producer/Consumer Map (reused diagram)

The diagram below is reused from [docs/diagrams/kafka-topics-map.mmd](diagrams/kafka-topics-map.mmd):

```mermaid
graph LR
    subgraph Producers["Produttori"]
        ORD_P[Order Service]
        INV_P[Inventory Service]
        PICK_P[Picking Service]
        SHIP_P[Shipping Service]
    end

    subgraph Topics["Kafka Topics"]
        OP[OrderPlaced]
        OC[OrderCancelled]
        ORP[OrderReadyForPicking]
        OS[OrderSuspended]
        IA[InventoryAllocated]
        OOS[OutOfStock]
        IS[ItemStored]
        PTC[PickingTaskCreated]
        PTCO[PickingTaskCompleted]
        CPT[CancelPickingTask]
        SA[ShipmentAssigned]
        VD[VehicleDispatched]
        VR[VehicleRegistered]
    end

    subgraph Consumers["Consumatori"]
        ORD_C[Order Service]
        INV_C[Inventory Service]
        PICK_C[Picking Service]
        SHIP_C[Shipping Service]
    end

    ORD_P --> OP
    ORD_P --> OC
    ORD_P --> ORP
    ORD_P --> OS
    ORD_P --> CPT
    INV_P --> IA
    INV_P --> OOS
    INV_P --> IS
    PICK_P --> PTC
    PICK_P --> PTCO
    SHIP_P --> SA
    SHIP_P --> VD
    SHIP_P --> VR

    OP --> INV_C
    OC --> INV_C
    IA --> ORD_C
    OOS --> ORD_C
    IS --> ORD_C
    PTCO --> ORD_C
    SA --> ORD_C
    ORP --> PICK_C
    CPT --> PICK_C
    PTCO --> SHIP_C
```

### 8.3. Consumer Groups

Each core service uses a consumer group named `<service>-consumer`, configured in `app.module.ts`:

```ts
// inventory-service/src/app.module.ts
ClientsModule.register([{
  name: 'KAFKA_CLIENT',
  transport: Transport.KAFKA,
  options: {
    client: { clientId: 'inventory-producer', brokers: [process.env.KAFKA_BROKER || 'localhost:29092'], retry: {...} },
    consumer: { groupId: 'inventory-consumer' },
  },
}]),
CqrsModule,  // enables CommandBus + QueryBus
```

This makes horizontal scaling automatic: starting two replicas of `inventory-service` will partition the consumption of `OrderPlaced` and `OrderCancelled` between them.

### 8.4. REST API Summary

A consolidated summary is in [Appendix B](#appendix-b--rest-api-summary).

---

## 9. Event Flows (Behavioral Views)

The C&C view is **structural**; the *behavioral* view is captured by sequence diagrams. The three flows below are the canonical demonstration scenarios for the system.

### 9.1. Happy Path

Reused from [diagrams/event-flow-happy-path.mmd](diagrams/event-flow-happy-path.mmd):

```mermaid
sequenceDiagram
    autonumber
    participant UI as Frontend / Simulator
    participant ORD as Order Service
    participant INV as Inventory Service
    participant PICK as Picking Service
    participant SHIP as Shipping Service
    participant DISP as Shipping Simulator

    UI->>ORD: POST /orders (PlaceOrder)
    ORD->>INV: OrderPlaced
    alt Stock sufficiente
        INV->>ORD: InventoryAllocated
        ORD->>PICK: OrderReadyForPicking
        PICK->>PICK: PickingTaskCreated
        UI->>PICK: POST /picking/tasks/:id/complete
        PICK->>ORD: PickingTaskCompleted
        PICK->>SHIP: PickingTaskCompleted
        SHIP->>ORD: ShipmentAssigned
        DISP->>SHIP: POST /shipping/vehicles/:id/dispatch
        SHIP->>SHIP: VehicleDispatched
    else Stock insufficiente
        INV->>ORD: OutOfStock
        ORD->>ORD: OrderSuspended
    end
```

### 9.2. Cancellation Flow

Reused from [diagrams/event-flow-cancellation.mmd](diagrams/event-flow-cancellation.mmd):

```mermaid
sequenceDiagram
    autonumber
    participant UI as Frontend
    participant ORD as Order Service
    participant INV as Inventory Service
    participant PICK as Picking Service

    UI->>ORD: PATCH /orders/:id/cancel
    alt Ordine in stato ALLOCATED
        ORD->>PICK: CancelPickingTask
        PICK-->>PICK: Task → CANCELLED (se PENDING)
    end
    ORD->>INV: OrderCancelled (previousStatus, allocations)
    INV-->>INV: Rilascio stock allocato
    INV->>INV: ItemStored
```

Two design points are worth highlighting:

1. **The cancellation is initiated synchronously** (HTTP `PATCH`) but its consequences (releasing stock, cancelling the picking task) are propagated **asynchronously** via Kafka. This is a deliberate inversion of control to keep services decoupled.
2. **`OrderCancelled` carries `previousStatus` and `allocations`**. This is necessary because Inventory must know *which* allocations to release, even though the order has already transitioned to `CANCELLED`. This is a textbook example of **enriched event** to avoid synchronous callbacks.

### 9.3. Restock-Driven Resume

Reused from [diagrams/event-flow-restock.mmd](diagrams/event-flow-restock.mmd):

```mermaid
sequenceDiagram
    autonumber
    participant SIM as Inventory Simulator
    participant INV as Inventory Service
    participant ORD as Order Service

    SIM->>INV: POST /inventory/receive (HTTP)
    INV-->>INV: Immagazzina merce
    INV->>ORD: ItemStored
    ORD-->>ORD: Trova ordini SUSPENDED per quel prodotto
    ORD->>INV: OrderPlaced (retry allocazione)
    INV->>ORD: InventoryAllocated
    Note over ORD,INV: Riprende il flusso Happy Path
```

This is the system’s **eventual consistency** showcase: the Order Service does not poll Inventory; it simply reacts to `ItemStored` and re-emits `OrderPlaced` for any order it had previously suspended.

---

## 10. Deployment Architecture

The deployment process is realized entirely via **Docker Compose**, defined in the single [docker-compose.yml](../docker-compose.yml) file at the repository root and driven by npm scripts in the root [package.json](../package.json).

### 10.1. Build Process

Each service has its own `Dockerfile`. A representative example, [inventory-service/Dockerfile](../inventory-service/Dockerfile):

```dockerfile
FROM node:22.22.2-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "run", "start:prod"]
```

All Dockerfiles share this **single-stage** pattern. This is a deliberately simple choice for the academic context; multi-stage builds (separating build-time `devDependencies` from a slim runtime image) are listed in §15 as future work.

### 10.2. Orchestration: `docker-compose.yml`

The compose file defines:

- **Infrastructure containers:** `kafka`, `kafka-init`, `kafka-ui`, `openobserve`, `fluent-bit`, plus four `mongo:latest` instances.
- **Application containers:** four core services, four simulators, and the frontend.
- **Volumes:** four named volumes for Mongo persistence (`inventory_mongodb_data`, …) and one for OpenObserve (`openobserve_data`).
- **Service-to-service environment wiring:** every NestJS service receives `KAFKA_BROKER=kafka:9092`; simulators receive HTTP URLs of the services they drive.

### 10.3. Startup Dependency Chain

The startup order is enforced by `depends_on` with `condition`. Two condition types are used:

- `service_healthy` — for Kafka (driven by a `healthcheck` running `kafka-broker-api-versions.sh`).
- `service_completed_successfully` — for `kafka-init` (a one-shot container that exits 0 when topics are created).

The deployment dependency graph is shown below (a new diagram authored for this report, refining the existing [docker-dependencies.mmd](diagrams/docker-dependencies.mmd) with the observability layer and frontend):

```mermaid
flowchart TB
    K["kafka<br/>(KRaft)"] -- "service_healthy" --> KI["kafka-init<br/>(one-shot)"]
    KI -- "service_completed_successfully" --> INV["inventory-service"]
    KI --> ORD["order-service"]
    KI --> PICK["picking-service"]
    KI --> SHIP["shipping-service"]
    KI --> INVSIM["inventory-simulator"]
    KI --> ORDSIM["order-simulator"]
    KI --> PICKSIM["picking-simulator"]
    KI --> SHIPSIM["shipping-simulator"]

    IDB[("inventory-db")] --> INV
    ODB[("order-db")] --> ORD
    PDB[("picking-db")] --> PICK
    SDB[("shipping-db")] --> SHIP

    OO["openobserve"] --> FB["fluent-bit"]
    INV -.-> FB
    ORD -.-> FB
    PICK -.-> FB
    SHIP -.-> FB

    INV --> FE["frontend"]
    ORD --> FE
    PICK --> FE
    SHIP --> FE
    INVSIM --> FE
    ORDSIM --> FE
    PICKSIM --> FE

    K --> KUI["kafka-ui"]
```

### 10.4. The `kafka-init` Initialization Container

Quoting [scripts/init-kafka-topics.sh](../scripts/init-kafka-topics.sh):

```bash
create_topic() {
    local topic_name=$1
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$kafka_broker" \
        --create --topic "$topic_name" \
        --partitions 1 --replication-factor 1 --if-not-exists
}
create_topic "OrderPlaced"
# ... 13 in total
```

The container itself in [docker-compose.yml](../docker-compose.yml):

```yaml
kafka-init:
  image: apache/kafka:latest
  depends_on:
    kafka:
      condition: service_healthy
  volumes:
    - ./scripts/init-kafka-topics.sh:/init-kafka-topics.sh
  environment:
    - KAFKA_BROKER=kafka:9092
  entrypoint: ["/bin/bash", "/init-kafka-topics.sh"]
```

Every microservice declares `depends_on: kafka-init: { condition: service_completed_successfully }`. The `--if-not-exists` flag makes the script **idempotent**, so re-running `docker compose up` after a topic configuration change is safe.

### 10.5. Persistence and Volumes

Mongo data survives container recreation thanks to named volumes:

```yaml
volumes:
  inventory_mongodb_data:
  order_mongodb_data:
  picking_mongodb_data:
  shipping_mongodb_data:
  openobserve_data:
```

To reset domain state during demos, the developer runs `npm run docker:clean:db`, which stops the stack and removes the four Mongo volumes.

### 10.6. Frontend Build

The frontend Dockerfile ([frontend/Dockerfile](../frontend/Dockerfile)) is the same single-stage pattern but ends with `CMD ["npm", "start"]`, which runs `next start` on the pre-built `.next` artifact.

### 10.7. Operations Cheat-Sheet

Top-level npm scripts ([package.json](../package.json)) abstract common docker compose invocations:

| Script                              | Effect                                                                 |
|-------------------------------------|------------------------------------------------------------------------|
| `npm run docker:start`              | `docker compose up -d --build`                                         |
| `npm run docker:stop`               | `docker compose down --remove-orphans`                                 |
| `npm run docker:restart`            | stop + start                                                           |
| `npm run docker:restart:fe`         | rebuilds and replaces only the frontend container                      |
| `npm run docker:restart:<service>`  | per-service rebuild without recreating the rest of the stack           |
| `npm run docker:clean:db`           | stops the stack and deletes the four Mongo volumes                     |

These are the *only* commands a demonstrator needs to operate the system end to end.

### 10.8. Kubernetes Readiness (forward-looking)

Although no K8s manifests are part of the current deliverable, the architecture is intentionally compatible with K8s: services are stateless (state lives in Kafka and Mongo), each service has a `health` endpoint usable as a liveness/readiness probe, configuration is environment-variable-only, and the `kafka-init` pattern naturally translates to a K8s **Job** with `initContainers` semantics.

---

## 11. Observability

Observability is a first-class architectural driver (ASR-5). The system implements the **logs** pillar fully, the **metrics** pillar partially (via health endpoints and Kafka UI), and *does not* implement **distributed tracing** — which is acknowledged in §15.

### 11.1. Logging Pipeline

The pipeline is fully declarative and routes every container’s stdout into OpenObserve via Fluent Bit.

```mermaid
flowchart LR
    subgraph S["Each NestJS / Frontend container"]
        APP[Application stdout]
    end
    subgraph DOCKER["Docker Engine"]
        DRIVER["fluentd log driver<br/>tag=whs.&lt;service&gt;"]
    end
    APP --> DRIVER
    DRIVER -- "TCP forward 24224" --> FB
    subgraph FB["fluent-bit"]
        IN["INPUT forward :24224"]
        F1["FILTER modify<br/>+source=docker<br/>+deployment=whs-local"]
        F2["FILTER grep<br/>drop NestJS bootstrap noise<br/>drop empty lines"]
        F3["FILTER lua clean_ansi<br/>strip ANSI escapes"]
        OUT["OUTPUT http JSON<br/>compress=gzip"]
        IN --> F1 --> F2 --> F3 --> OUT
    end
    OUT -- "HTTP POST /api/default/whs_logs/_json" --> OO["openobserve :5080<br/>store + query UI"]
    KUI["kafka-ui :8090"] -. "topic introspection" .-> KAF[(kafka)]
```

### 11.2. The `fluentd` Logging Driver

Every core service in [docker-compose.yml](../docker-compose.yml) is configured with:

```yaml
logging:
  driver: fluentd
  options:
    fluentd-address: "localhost:24224"
    fluentd-async: "true"
    fluentd-retry-wait: "1s"
    fluentd-max-retries: "30"
    fluentd-sub-second-precision: "true"
    tag: "whs.<service-name>"
```

This means **the application code does not call any logging library other than `console.log` / `Logger`**: the Docker engine itself ships stdout to Fluent Bit. The architecture is therefore *log-library agnostic*, and a service can be re-implemented in any language without breaking the observability contract.

### 11.3. Fluent Bit Configuration

[deploy/observability/fluent-bit.conf](../deploy/observability/fluent-bit.conf) defines the four pipeline stages:

```ini
[INPUT]
    Name forward
    Listen 0.0.0.0
    Port 24224

[FILTER]
    Name modify
    Match *
    Add source docker
    Add deployment whs-local

[FILTER]
    Name grep
    Match *
    Exclude log .*\[(NestFactory|InstanceLoader|RoutesResolver|RouterExplorer|NestApplication|NestMicroservice|ServerKafka|ClientKafka|MongooseCoreModule|MongooseModule)\].*
    Exclude log ^$

[FILTER]
    Name lua
    Match *
    script /fluent-bit/etc/clean_ansi.lua
    call clean_ansi

[OUTPUT]
    Name http
    Match *
    Host openobserve
    Port 5080
    URI /api/default/whs_logs/_json
    Format json
    Json_date_key _timestamp
    Json_date_format iso8601
    HTTP_User root@example.com
    HTTP_Passwd Complexpass#123
    compress gzip
```

Three things are notable:

1. **A `grep` filter discards NestJS bootstrap noise** (`NestFactory`, `InstanceLoader`, etc.) so OpenObserve only stores domain-relevant log lines.
2. **A Lua script strips ANSI escape sequences** that would otherwise pollute log records, courtesy of [deploy/observability/clean_ansi.lua](../deploy/observability/clean_ansi.lua):

   ```lua
   function clean_ansi(tag, timestamp, record)
       if record["log"] ~= nil then
           record["log"] = record["log"]:gsub("\27%[[0-9;]*[a-zA-Z]", "")
       end
       return 1, timestamp, record
   end
   ```

3. **Output is gzipped JSON** to `OpenObserve`’s `_json` ingest endpoint, indexed under stream `whs_logs`.

### 11.4. OpenObserve

OpenObserve is the analytics endpoint: it stores logs, exposes a UI on port 5080, and supports SQL-like queries. Credentials are seeded via environment variables (`ZO_ROOT_USER_EMAIL`, `ZO_ROOT_USER_PASSWORD`). A healthcheck on `/healthz` enforces dependency ordering.

### 11.5. Kafka UI

[deploy/observability/kafka-ui.yml](../deploy/observability/kafka-ui.yml) configures Provectus Kafka UI as a **read-only** introspector:

```yaml
kafka:
  clusters:
  - bootstrapServers: host.docker.internal:9092
    name: locale
    properties: {}
    readOnly: true
```

The read-only setting prevents accidental topic deletion or message production from the UI, which is important during exam demos.

### 11.6. Health Endpoints (Cheap Liveness Signal)

Every core service exposes `GET /<service>/health` returning `{ status: 'ok', service: '<name>' }`. The frontend uses these as a status badge in the “Status” page. They are also the hook for any future K8s liveness probe.

### 11.7. What is *not* implemented

- **Distributed tracing** (OpenTelemetry, Jaeger). Acknowledged in §15. The current pipeline supports correlation only via `orderId` / `taskId` strings present in log records.
- **Application metrics** (Prometheus, OTel). Currently absent; Kafka UI gives a partial view of broker health and consumer-group lag.

---

## 12. Testing Strategy

Testability (ASR-4) is a primary driver, and the codebase reflects this with a clear test taxonomy. The Jest configuration is co-located in each service’s `package.json`.

### 12.1. Test Pyramid

```mermaid
flowchart TB
    E2E["E2E tests<br/>HTTP smoke via supertest<br/>(few)"] --- B
    B["Bootstrap tests<br/>main.spec.ts with jest.resetModules()<br/>(few)"] --- G
    G["Gateway tests<br/>Socket.IO emit assertions<br/>(few)"] --- U
    U["Unit tests<br/>controller + service spec.ts<br/>(many)"]

    classDef base fill:#eef,stroke:#446
    class E2E,B,G,U base
```

### 12.2. Unit Tests

Each service follows the canonical NestJS CQRS pattern: controller tests mock `CommandBus` and `QueryBus`; handler tests mock the specific dependencies (Kafka, Mongo model, EventsGateway).

**Controller tests** — verify routing, parameter parsing, and dispatch to the correct Command/Query:

```ts
// order-service/test/app.controller.spec.ts
const commandBus = { execute: jest.fn() } as any;
const queryBus = { execute: jest.fn() } as any;

const module: TestingModule = await Test.createTestingModule({
  controllers: [AppController],
  providers: [
    { provide: CommandBus, useValue: commandBus },
    { provide: QueryBus, useValue: queryBus },
  ],
}).compile();
```

**Handler tests** — each `CommandHandler` is tested in isolation with its own mocked dependencies:

```ts
// order-service/test/handlers.spec.ts
const module: TestingModule = await Test.createTestingModule({
  providers: [
    PlaceOrderHandler,
    { provide: 'KAFKA_CLIENT', useValue: { emit: jest.fn() } },
    { provide: getModelToken(Order.name), useValue: mockOrderModel },
    { provide: EventsGateway, useValue: { notifyDataChanged: jest.fn() } },
  ],
}).compile();
```

Unit tests cover:

- **Controllers** — REST routing, parameter parsing, CommandBus/QueryBus delegation, `@EventPattern` message filtering and dispatch.
- **Command Handlers** — state transitions, Kafka event emissions, MongoDB writes, WebSocket notifications.
- **Query Handlers** — correct Mongoose `find()` calls and response shape.

### 12.3. Bootstrap Tests (`main.spec.ts`)

`main.ts` performs side effects (creating an app, starting microservices, listening) at import time. The test pattern uses `jest.resetModules()` + `require()` to obtain a fresh module instance per test, with `NestFactory.create` spied to return a mock app. Excerpt from [inventory-service/test/main.spec.ts](../inventory-service/test/main.spec.ts):

```ts
const app = {
  connectMicroservice: jest.fn(),
  enableCors: jest.fn(),
  startAllMicroservices: jest.fn().mockResolvedValue(undefined),
  listen: jest.fn().mockResolvedValue(undefined),
};
const { NestFactory } = require('@nestjs/core');
jest.spyOn(NestFactory, 'create').mockResolvedValue(app);
require('../src/main');
await new Promise((resolve) => setImmediate(resolve));
expect(app.connectMicroservice).toHaveBeenCalledWith(
  expect.objectContaining({
    transport: Transport.KAFKA,
    options: expect.objectContaining({ consumer: expect.objectContaining({ groupId: 'inventory-consumer' }) }),
  }),
);
expect(app.listen).toHaveBeenCalledWith(3001);
```

This validates that the Kafka transport is wired with the correct consumer group, that CORS is enabled, and that the right port is used. A second test sets `process.env.PORT='3111'` and asserts the override is respected.

### 12.4. Gateway Tests

WebSocket gateways are tested by injecting a fake `server` object. Excerpt from [inventory-service/test/events.gateway.spec.ts](../inventory-service/test/events.gateway.spec.ts):

```ts
gateway.server = { emit: jest.fn() } as any;
gateway.notifyDataChanged();
expect(gateway.server.emit).toHaveBeenCalledWith('dataChanged');
```

Connection / disconnection callbacks are also asserted to log via `Logger.prototype.log`.

### 12.5. End-to-End Tests

E2E tests use **supertest** against a fully bootstrapped NestJS app, but with the `AppService` mocked so the test does not depend on Kafka or Mongo. Example from [inventory-service/test/app.e2e-spec.ts](../inventory-service/test/app.e2e-spec.ts):

```ts
const moduleFixture = await Test.createTestingModule({
  controllers: [AppController],
  providers: [{ provide: AppService, useValue: {} }],
}).compile();
app = moduleFixture.createNestApplication();
await app.init();
return request(app.getHttpServer())
  .get('/inventory/health')
  .expect(200)
  .expect({ status: 'ok', service: 'inventory' });
```

This is enough to validate routing, Nest decorators, status codes, and response shape across a real HTTP stack.

### 12.6. Per-Service Test Inventory

| Service              | Files in `test/`                                                                                                                |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------|
| inventory-service    | `app.controller.spec.ts`, `handlers.spec.ts`, `app.module.spec.ts`, `events.gateway.spec.ts`, `main.spec.ts`, `app.e2e-spec.ts` |
| order-service        | same set + `order.schema.spec.ts` (validates the order schema)                                                                  |
| picking-service      | controller, handlers, module, gateway, main, e2e                                                                                 |
| shipping-service     | controller, handlers, module, gateway, main, e2e                                                                                 |
| simulators (×4)      | controller and service specs, plus where applicable HTTP-driver mocks                                                            |

### 12.7. Coverage

Each `package.json` declares:

```json
"jest": {
  "testRegex": "test/.*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["src/**/*.(t|j)s"],
  "coverageDirectory": "./coverage",
  "testEnvironment": "node"
}
```

`npm run test:cov` produces a coverage report under `coverage/`. The targets are >80% for business logic and >60% for infrastructure code.

### 12.8. Cross-Workspace Test Runner

The root [package.json](../package.json) wires:

```json
"test:all": "npm --workspaces --if-present run test"
```

so `npm test` from the repository root runs every workspace’s Jest in turn — a one-command CI-friendly entrypoint.

### 12.9. What is *not* tested

- **Real Kafka / Mongo integration tests.** The system relies on Docker Compose for that, manually exercised via the simulators. A production-grade approach would add Testcontainers-based integration tests; this is listed in §15.
- **End-to-end multi-service flows.** No single test bootstraps all four services and asserts a full happy-path event chain; the burden is shifted to the live demo + log inspection in OpenObserve.

---

## 13. Trade-offs & Alternatives Considered

### 13.1. Kafka vs RabbitMQ vs NATS

| Option        | Pros                                                                | Cons                                                | Why not chosen                                 |
|---------------|---------------------------------------------------------------------|------------------------------------------------------|------------------------------------------------|
| **Kafka**     | Durable event log, replay, partition-based scalability              | Heavier; KRaft mode still maturing                  | **Chosen.** Event log is the keystone of §4.3. |
| RabbitMQ      | Simpler to operate, good fit for AMQP work-queue use cases          | Not a log; no native replay; harder for event sourcing | Insufficient for event-sourcing posture        |
| NATS          | Tiny footprint, fast                                                | Streams (JetStream) less mature for event sourcing  | Less idiomatic for the patterns in §4          |

### 13.2. MongoDB vs PostgreSQL

| Option         | Pros                                                          | Cons                                                | Why not chosen                                 |
|----------------|---------------------------------------------------------------|------------------------------------------------------|------------------------------------------------|
| **MongoDB**    | Document model maps well to aggregates with embedded items   | Weaker constraints; eventual consistency mindset    | **Chosen.** Schemas in §6 are document-shaped. |
| PostgreSQL     | Strong relational integrity, transactions                    | Cross-service transactions not allowed anyway       | Overkill given no joins across contexts        |

### 13.3. Choreography vs Orchestration (Saga)

The cancellation flow could have been implemented as an **orchestrated saga** (a dedicated coordinator service driving order-cancel → release-stock → cancel-picking-task). Choreography was preferred because:

- Each service’s logic stays *local*: Inventory only cares about `OrderCancelled`, Picking only about `CancelPickingTask`.
- No new component to deploy.
- The price paid is *harder global tracing*: there is no central place to ask “what happened to order X?” — which is mitigated by the centralized log aggregation in §11.

### 13.4. CQRS — Code-Level Adoption

The initial design (prior to the refactor) kept read and write logic in a single `AppService` class per service. As the number of Kafka event handlers and REST operations grew, this class became a *god object* — violating single responsibility and making isolated testing harder.

The refactored design introduces **code-level CQRS** via `@nestjs/cqrs`:

- **Writes** → Command + CommandHandler (one handler per use-case).
- **Reads** → Query + QueryHandler.
- **Controller** → thin dispatcher; no business logic.

The CQRS split is **not infrastructural**: both read and write paths share the same MongoDB instance. There is no separate read store, materialized view, or eventual consistency between read and write sides. The benefit is purely structural:

| Benefit | Explanation |
|---------|-------------|
| **Testability** | Each handler is unit-tested in isolation with mocked Kafka, Mongo, and Gateway — without bootstrapping the entire module. |
| **Single Responsibility** | Each handler owns exactly one use-case, eliminating the god-service anti-pattern. |
| **Extensibility** | Adding a new event handler means adding two files (`command.ts` + `handler.ts`) and registering in `index.ts` — no changes to existing code. |

The trade-off is slightly more boilerplate per operation (command class + handler class vs. a single service method), which is acceptable given the pedagogical aim and the maintainability gain.

### 13.5. Single Broker, RF=1

Operating a single Kafka broker with replication factor 1 means **any broker outage causes data loss**. This is acceptable for the academic context — the system is reset between demos — but the architecture is otherwise broker-replication-ready.

### 13.6. WebSocket vs Server-Sent Events (SSE) for UI Push

Socket.IO was chosen over SSE because:

- NestJS has first-class Socket.IO support via `@nestjs/platform-socket.io`.
- Bidirectional channels open the door to interactive features (cursors, room-based updates) that may be added later.
- SSE’s simpler unidirectional model would have been sufficient today but constraining tomorrow.

### 13.7. Single-Stage vs Multi-Stage Dockerfiles

Single-stage was chosen for simplicity and faster iteration during development. The cost is larger images that include `devDependencies`. This is a deliberate trade-off, listed in §15 as future work.

---

## 14. Architectural Decision Records (ADRs)

### ADR-001 — Apache Kafka as the Primary Broker

- **Context.** §4.2 requires asynchronous, durable, replayable inter-service communication.
- **Decision.** Use Apache Kafka in KRaft mode. Topics are named after domain events in PascalCase. One partition per topic for the didactic deployment.
- **Consequences.** Replay is feasible (event-sourcing posture, §4.3). Operational complexity higher than a transient broker. KRaft removes ZooKeeper, limiting moving parts.

### ADR-002 — Code-Level CQRS via `@nestjs/cqrs`

- **Context.** The initial monolithic `AppService` per microservice mixed Kafka event handling, REST business logic, and read queries in a single class, growing into a god-object that hindered testability and readability.
- **Decision.** Adopt `@nestjs/cqrs` module. Decompose each service into Commands (write operations) and Queries (read operations), each with a dedicated handler class. The controller becomes a thin dispatcher using `CommandBus` and `QueryBus`. Both paths share the same MongoDB — no infrastructural read/write store separation.
- **Consequences.** Handlers are independently testable (mock only their direct dependencies). Adding a new event listener is a two-file operation (`command.ts` + `handler.ts`). Slightly more boilerplate per use-case, but the canonical file structure (§4.4, Appendix C) makes it predictable. The `CqrsModule` import is required in every `app.module.ts`.

### ADR-003 — Database-per-Service (MongoDB)

- **Context.** Loose coupling driver demands schema independence per bounded context.
- **Decision.** Four separate Mongo containers, one per service, with isolated credentials and volumes.
- **Consequences.** No cross-service joins; data duplication in event payloads is accepted (e.g., `allocations` carried in events).

### ADR-004 — Choreography over Orchestration

- **Context.** Two reasonable styles for multi-service workflows.
- **Decision.** Choreography. No orchestrator service.
- **Consequences.** Pro: each service evolves independently. Con: tracing is harder; mitigated by §11 log aggregation. The cancellation flow is the most complex case and remains tractable thanks to enriched events (`previousStatus`, `allocations`).

### ADR-005 — Cancellation Flow Inversion (HTTP in, Kafka out)

- **Context.** Cancellation is initiated by an operator in the UI but must propagate to multiple services.
- **Decision.** Expose `PATCH /orders/:id/cancel` as the single entry point. After the local state transition, emit `CancelPickingTask` and `OrderCancelled` to Kafka. Other services react asynchronously and idempotently.
- **Consequences.** UX is responsive (synchronous ACK from Order). Side effects are decoupled. Idempotency must be enforced in consumers (cf. §4.8).

### ADR-006 — `kafka-init` Initialization Container

- **Context.** Iteration 3 (§3.2) revealed `UNKNOWN_TOPIC_OR_PARTITION` errors when consumers subscribed before topics existed.
- **Decision.** Introduce a one-shot `kafka-init` container that pre-creates all 13 topics with `--if-not-exists` after Kafka’s healthcheck. All app containers depend on `kafka-init: service_completed_successfully`.
- **Consequences.** Removes the race condition. Adds one container to the topology. Idempotent across restarts. Adding a new topic now requires a one-line edit to [scripts/init-kafka-topics.sh](../scripts/init-kafka-topics.sh).

### ADR-007 — Fluentd Docker Logging Driver as the Log Transport

- **Context.** Observability driver requires centralized logs without burdening application code.
- **Decision.** Use Docker’s `fluentd` log driver on every core service, with a per-service `tag`. Fluent Bit terminates the connection.
- **Consequences.** Application code stays log-library-agnostic. A Fluent Bit outage does not block applications (driver is `async` with retries).

### ADR-008 — Read-Only Kafka UI

- **Context.** Kafka UI is exposed in development to allow topic inspection during demos.
- **Decision.** Configure cluster as `readOnly: true` in [kafka-ui.yml](../deploy/observability/kafka-ui.yml).
- **Consequences.** Topic deletion or arbitrary message production from the UI is blocked, removing a footgun during exam runs.

### ADR-009 — Simulators as External Drivers

- **Context.** Simulability driver requires unattended end-to-end execution.
- **Decision.** Build four separate simulator services that drive the system exclusively through its public REST contracts, not through internal hooks.
- **Consequences.** Simulators can be replaced or scaled independently. Core services remain free of demo-specific code paths.

---

## 15. Known Limitations & Future Work

Each item is paired with an attribute it would improve.

| # | Limitation                                                                  | Improves                       | Suggested resolution                                              |
|---|------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------------------------|
| 1 | Single Kafka broker, RF=1                                                    | Resilience                     | 3-broker cluster with RF=3, `min.insync.replicas=2`               |
| 2 | No distributed tracing                                                       | Observability                  | OpenTelemetry SDK in each service, OTLP → OpenObserve / Tempo     |
| 3 | No application metrics (Prometheus)                                          | Observability                  | Add `prom-client`, scrape via Prometheus, Grafana dashboards      |
| 4 | No authentication / authorization                                            | Security                       | Service-to-service mTLS or JWT; UI with OAuth2/OIDC               |
| 5 | No schema registry; events are loose JSON                                    | Modifiability                  | Confluent Schema Registry + Avro/Protobuf                         |
| 6 | No dead-letter topic for poison messages                                     | Resilience                     | Add `<topic>.DLT` topics + retry/backoff policies                  |
| 7 | Single-stage Dockerfiles                                                     | Deployability, image size      | Multi-stage builds with `node:alpine` runtime + `dist/` only      |
| 8 | No K8s manifests                                                             | Deployability                  | Helm chart, k8s `Job` for `kafka-init`                            |
| 9 | No real Kafka/Mongo integration tests                                        | Testability                    | Testcontainers integration suite                                  |
|10 | Hard-coded development credentials (Mongo `root:example`, OpenObserve)       | Security                       | Docker secrets / env-driven secret injection                      |
|11 | Cancellation idempotency relies on local state checks, not on event idempotency keys | Resilience                | Add a deduplication store keyed by `eventId`                      |
|12 | UI status is bound to WebSocket `dataChanged` (re-fetch trigger), no granular events | Performance                | Replace with topic-specific Socket.IO rooms                       |
|13 | `inventory-service` exposes inbound HTTP (`POST /inventory/receive`)         | Pattern purity                 | Make inbound a Kafka-only entry point; the HTTP route was a holdover from early iterations |

---

## 16. Conclusions & Lessons Learned

WHS represents a deliberate and measurable architectural evolution over the project from which it originated. The prior system covered only the **picking sub-domain** across **two microservices**, used a **message-driven** (not event-sourced) communication model, and shared a **single database** between its components. Each of those choices — narrow domain scope, transient messaging, shared persistence — was a concrete pain point that motivated the rework. The results confirm that the investment was worthwhile.

### 16.1. What the Rework Improved

**Domain coverage.** The original two-service scope (picking service + picking handler) made it impossible to exercise inter-domain flows such as inventory allocation, order suspension, or cancellation propagation. WHS expands to four bounded-context-aligned services covering the full warehouse lifecycle — inbound, inventory, orders, picking, and shipping — making these flows first-class, demonstrable scenarios rather than out-of-scope future work.

**Loose coupling and failure isolation.** The original message-driven design coupled the picking handler tightly to the picking service: a failure in one stalled the other. By replacing direct message passing with a **durable Kafka event log** and **choreography-based coordination**, WHS achieves true failure isolation: each service can crash and recover independently, consuming missed events on restart, with no data loss and no synchronous dependency on any peer.

**Scalability via database-per-service.** The shared database of the original project was both a coupling point and a scaling bottleneck — any schema change or load spike on one component affected the other. The **database-per-service** pattern (ADR-003) eliminates both problems: each service owns its read model, evolves its schema independently, and can be scaled without interference.

**Testability.** The original codebase concentrated logic in a small number of large components, making isolated unit testing difficult. The **code-level CQRS** refactoring (ADR-002) decomposed these into focused, single-responsibility handlers, each testable with a handful of mocked dependencies and no framework bootstrapping overhead. The result is a four-layer test pyramid (unit → bootstrap → gateway → e2e) across every service, compared to the minimal test coverage of the prior project.

**Observability.** The original system had no centralized log aggregation. WHS introduces a full declarative logging pipeline — Docker `fluentd` driver → Fluent Bit → OpenObserve — that aggregates structured logs from every container without modifying a single line of application code. The `fluentd` logging driver (ADR-007) acts as an architectural seam: once in place, the pipeline is language- and framework-agnostic.

### 16.2. Lessons Crystallized

1. **Startup ordering is part of the architecture.** The race condition that motivated the `kafka-init` container (ADR-006) is not a bug — it is a property of any system that subscribes to topics that may not yet exist. Treating initialization as an explicit pattern (using Docker Compose's `service_completed_successfully` condition) avoided the temptation of `sleep` hacks and produced a fully declarative startup contract.

2. **Choreography pays back the moment you cancel.** The cancellation flow could easily have grown into a multi-call synchronous monster. By inverting it into an HTTP entry point followed by Kafka fan-out (ADR-005), each service's code remained small and locally reasoned. The cost — global tracing — was repaid by the centralized log aggregation in §11.

3. **Observability does not have to be expensive.** A 50-line `fluent-bit.conf` and a single OpenObserve container were enough to satisfy ASR-5 in full for the logs pillar. The architectural lever was the `fluentd` Docker logging driver (ADR-007): once that contract was in place, application code remained log-library agnostic and could focus on domain logic.

4. **Code-level CQRS eliminates god-services early.** Introducing `@nestjs/cqrs` (ADR-002) decomposed what were growing `AppService` monoliths into focused, single-responsibility handlers. The thin-controller pattern makes the system more navigable: a developer reading `app.controller.ts` sees the full routing table, and each handler file is self-contained. The additional boilerplate (command class + handler class per operation) is offset by dramatically simpler unit tests, since each handler is instantiated with only its own dependencies.

### 16.3. Looking Ahead

In its current form WHS is a complete, demonstrable, didactically valuable system. The gap between the original two-service project and this rework is not merely quantitative (more services, more tests, more infrastructure) but qualitative: the architecture now supports independent evolvability, fault containment, and operational introspection — qualities that the original design structurally precluded. The limitations in §15 mark the next gap to close.

---
## Appendix A — Glossary of Domain Events

All 14 events are JSON. Producer and consumer columns are defined in §8.1.

| Event                    | Payload (TypeScript-style)                                                                    |
|--------------------------|------------------------------------------------------------------------------------------------|
| `OrderPlaced`            | `{ orderId: string, items: { productId: string, quantity: number }[] }`                       |
| `OrderCancelled`         | `{ orderId: string, previousStatus: OrderStatus, allocations: Allocation[] }`                  |
| `OrderReadyForPicking`   | `{ orderId: string, allocations: Allocation[] }`                                              |
| `OrderSuspended`         | `{ orderId: string }`                                                                          |
| `CancelPickingTask`      | `{ orderId: string }`                                                                          |
| `InventoryAllocated`     | `{ orderId: string, allocations: { productId: string, quantity: number, location: string }[] }` |
| `OutOfStock`             | `{ orderId: string }`                                                                          |
| `ItemStored`             | `{ productId: string, location: string, addedQuantity: number, totalQuantity: number }`       |
| `PickingTaskCreated`     | `{ taskId: string, orderId: string, allocations: Allocation[] }`                              |
| `PickingTaskCompleted`   | `{ taskId: string, orderId: string, allocations: Allocation[] }`                              |
| `ShipmentAssigned`       | `{ taskId: string, orderId: string, vehicleId: string }`                                      |
| `VehicleDispatched`      | `{ vehicleId: string, tasks: TaskRef[] }`                                                     |
| `VehicleRegistered`      | `{ vehicleId: string, maxCapacity: number }`                                                  |

`Allocation = { productId: string, quantity: number, location: string }`

`OrderStatus = 'PENDING' | 'SUSPENDED' | 'ALLOCATED' | 'PICKING_COMPLETED' | 'SHIPPED' | 'CANCELLED'`

---

## Appendix B — REST API Summary

### Inventory Service (port 3001)
- `POST /inventory/receive` — receive goods (`{productId, quantity, location}`)
- `GET /inventory` — list all inventory rows
- `GET /inventory/health`

### Order Service (port 3002)
- `POST /orders` — place an order (`{ items }`)
- `GET /orders` — list all orders
- `PATCH /orders/:id/cancel`
- `PATCH /orders/:id/resume`
- `GET /orders/health`

### Picking Service (port 3003)
- `GET /picking/tasks`
- `POST /picking/tasks/:taskId/complete`
- `GET /picking/health`

### Shipping Service (port 3004)
- `GET /shipping/vehicles`
- `POST /shipping/vehicles` — register vehicle (`{vehicleId, maxCapacity}`)
- `POST /shipping/vehicles/:id/dispatch`
- `GET /shipping/pending`
- `GET /shipping/health`

### Inventory Simulator (port 3005)
- `GET /inbound/status`
- `POST /inbound/start` — `{intervalMs?}` (default 15000)
- `POST /inbound/stop`
- `GET /inbound/health`

### Shipping Simulator (port 3006)
- `GET /shipping-simulator/status`
- `POST /shipping-simulator/start`
- `POST /shipping-simulator/stop`
- `GET /shipping-simulator/health`

### Order Simulator (port 3007)
- `GET /order-simulator/status`
- `POST /order-simulator/start` — `{intervalMs?}` (default 15000)
- `POST /order-simulator/stop`
- `GET /order-simulator/health`

### Picking Simulator (port 3008)
- `GET /picking-simulator/status`
- `POST /picking-simulator/start`
- `POST /picking-simulator/stop`
- `GET /picking-simulator/health`

The full contract is maintained in [docs/api-reference.md](api-reference.md).

---

## Appendix C — Canonical NestJS Service Layout

Every core service follows the same CQRS-based structure, which simplifies onboarding and code review:

```
<service>/
├── Dockerfile
├── nest-cli.json
├── package.json                  # workspace member, declares Jest config
├── tsconfig.json / tsconfig.build.json
├── eslint.config.mjs
├── src/
│   ├── main.ts                   # bootstrap (Kafka transport + listen)
│   ├── app.module.ts             # MongooseModule + ClientsModule + CqrsModule
│   ├── app.controller.ts         # Thin dispatcher: CommandBus/QueryBus + @EventPattern
│   ├── events.gateway.ts         # Socket.IO gateway
│   ├── commands/                 # Write operations (CQRS command side)
│   │   ├── <name>.command.ts     # DTO class with constructor params
│   │   ├── <name>.handler.ts     # @CommandHandler — business logic, Kafka emit, DB writes
│   │   └── index.ts             # export CommandHandlers array
│   ├── queries/                  # Read operations (CQRS query side)
│   │   ├── <name>.query.ts       # DTO class (often empty)
│   │   ├── <name>.handler.ts     # @QueryHandler — MongoDB find() logic
│   │   └── index.ts             # export QueryHandlers array
│   └── schemas/                  # Mongoose schemas (one per aggregate)
└── test/
    ├── app.controller.spec.ts    # Mocks CommandBus + QueryBus
    ├── handlers.spec.ts          # Tests each handler with mocked deps
    ├── app.module.spec.ts
    ├── events.gateway.spec.ts
    ├── main.spec.ts
    ├── app.e2e-spec.ts
    └── jest-e2e.json
```

The `app.module.ts` wires the CQRS infrastructure:

```ts
@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || '...'),
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ClientsModule.register([{ name: 'KAFKA_CLIENT', ... }]),
    CqrsModule,  // enables CommandBus + QueryBus
  ],
  controllers: [AppController],
  providers: [EventsGateway, ...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}
```

This convergence on a canonical layout is itself an architectural decision: it lowers the cognitive cost of moving between services and makes the codebase amenable to *templated* tooling (lint configs, Dockerfiles, CI pipelines) without code generation.

---

*End of report.*
