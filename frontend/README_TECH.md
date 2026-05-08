# Frontend (NexusWMS Dashboard) Technical Documentation

## Overview
The **Frontend** is a Next.js 16 + React 19 web application that serves as the unified operator console and monitoring dashboard for the WHS (Warehouse Management System). It provides real-time views into orders, inventory, picking tasks, and shipping operations. The frontend never exposes microservice URLs to the client; instead, all requests are proxied through Next.js server-side rewrites, making the system deploy-ready and secure.

## Core Technologies
- **Framework:** Next.js 16 (React 19)
- **Styling:** Tailwind CSS 4 + PostCSS 4
- **Real-Time:** Server-Sent Events (SSE) via Kafka consumer endpoint
- **HTTP Client:** Fetch API with Next.js rewrites
- **Build Tool:** TypeScript 5.7.3
- **Package Manager:** npm (Node 22.22.2)

## Architecture: Backend for Frontend (BFF) Pattern

### API Gateway via Next.js Rewrites

The frontend acts as a **Backend for Frontend** (BFF) that proxies all microservice communication through Next.js server-side rewrites. This ensures:

1. **No Client-Side Exposure:** Microservice URLs are never sent to the browser
2. **Security:** Microservice details are server-side environment variables only
3. **Portability:** Change `NEXT_PUBLIC_*` env vars to deploy to different clusters (Docker, Kubernetes, Cloud)
4. **Unified Entry Point:** Single port (3000) for all client requests

### Request Flow

```
Browser (http://localhost:3000)
    ↓
    ├─ GET /api/inventory/items
    │      ↓ (Next.js rewrite)
    │  → http://inventory-service:3001/inventory/items
    │
    ├─ POST /api/orders
    │      ↓ (Next.js rewrite)
    │  → http://order-service:3002/orders
    │
    └─ GET /api/events (SSE stream)
           ↓ (Kafka consumer in Next.js API route)
           Subscribe to Kafka topics
           Stream messages to browser as Server-Sent Events
```

### Environment Variables

Server-side only (loaded via `requireEnv()` in `next.config.ts`):
- `INVENTORY_SERVICE_URL`: Default `http://inventory-service:3001`
- `ORDER_SERVICE_URL`: Default `http://order-service:3002`
- `PICKING_SERVICE_URL`: Default `http://picking-service:3003`
- `SHIPPING_SERVICE_URL`: Default `http://shipping-service:3004`
- `INBOUND_SIMULATOR_URL`: Default `http://inventory-simulator-service:3005`
- `DISPATCH_SIMULATOR_URL`: Default `http://shipping-simulator-service:3006`
- `ORDER_SIMULATOR_URL`: Default `http://order-simulator-service:3007`
- `PICKING_SIMULATOR_URL`: Default `http://picking-simulator-service:3008`
- `KAFKA_BROKERS`: Default `localhost:29092` (for SSE Kafka consumer)

## Frontend Structure

```
frontend/
  src/
    app/
      page.tsx               # Dashboard home
      (inventory)/           # Inventory & Inbound routes
        layout.tsx
        page.tsx
      (orders)/              # Order Management routes
        layout.tsx
        page.tsx
      (picking)/             # Picking Operations routes
        layout.tsx
        page.tsx
      (shipping)/            # Shipping & Dispatch routes
        layout.tsx
        page.tsx
      (status)/              # System Status routes
        layout.tsx
        page.tsx
      api/
        events/              # SSE endpoint for Kafka consumer
          route.ts
        [service]/           # API proxies
          [...path]/
            route.ts         # Dynamic catch-all rewrite
    components/
      inventory/             # Inventory-specific UI components
      orders/                # Order-specific UI components
      picking/               # Picking-specific UI components
      shipping/              # Shipping-specific UI components
      shared/                # Reusable components (buttons, forms, etc.)
    hooks/
      useRealtimeSSE.ts      # Hook for subscribing to Kafka events
    styles/
      globals.css            # Tailwind base styles
```

## Key Features

### 1. Real-Time Event Streaming (SSE)

The `/api/events` endpoint implements a Server-Sent Events stream:

```typescript
// Browser
const events = useRealtimeSSE(['OrderPlaced', 'InventoryAllocated', 'PickingTaskCompleted'], async (message) => {
  console.log('New event:', message);
  // Refresh UI with new data
});
```

**How it works:**
1. Frontend connects to `/api/events` as an EventSource (SSE)
2. Next.js server creates a Kafka consumer
3. Server subscribes to specified topics (OrderPlaced, InventoryAllocated, etc.)
4. On each Kafka message, server sends SSE data to browser
5. Browser React components update state reactively

### 2. Dashboard Pages

| Route | Purpose | Real-Time Topics |
|-------|---------|------------------|
| `/` | Dashboard home / overview | All events |
| `/inventory` | Stock levels by location | `ItemStored`, `InventoryAllocated`, `OutOfStock` |
| `/orders` | Order lifecycle tracking | `OrderPlaced`, `OrderSuspended`, `OrderCancelled`, `PickingTaskCompleted`, `ShipmentAssigned` |
| `/picking` | Picking operations console | `PickingTaskCreated`, `PickingTaskCompleted` |
| `/shipping` | Vehicle dispatch yard | `VehicleRegistered`, `ShipmentAssigned`, `VehicleDispatched` |
| `/status` | System health check | Health endpoints for all services |

### 3. Operator Controls

- **Inventory & Inbound:** "Receive Goods" form + toggle inbound simulator
- **Order Management:** "Place Order" form + cancel order button + toggle order simulator
- **Picking Operations:** List of tasks with "Mark Completed" button + toggle picking simulator
- **Shipping & Dispatch:** Vehicle list + "Add Truck" button + "Dispatch" button + toggle dispatch simulator
- **System Status:** Health check aggregator + refresh button

### 4. Simulator Toggles

Each domain tab includes a toggle to start/stop the corresponding simulator:
- Inbound Simulator (15s default interval)
- Order Simulator (15s default interval, ~10% cancellation rate)
- Picking Simulator (15s default interval)
- Dispatch Simulator (20s default interval, 50% vehicle generation)

Simulators can be stopped to allow manual testing or to highlight specific scenarios.

## Styling & UX

- **Tailwind CSS 4:** Utility-first styling with dark mode support
- **Lucide React Icons:** Consistent icon library across all pages
- **Framer Motion:** Smooth animations for state transitions
- **Responsive Design:** Mobile-friendly layouts (assumes operator tablets/desktops primarily)
- **Color Scheme:** Dark blue/navy background with neon accent colors (orange, cyan, green, purple)
- **Real-Time Indicators:** "Connected to Kafka" badge shows SSE connection status

## Performance Optimizations

1. **Next.js Image Optimization:** `next/image` for product/vehicle icons (if any)
2. **Server-Side Rendering:** API routes for Kafka consumer (avoids client-side Kafka dependencies)
3. **Incremental Static Regeneration (ISR):** Health check page cached with revalidation
4. **React Compiler:** Babel plugin enabled for auto-memoization
5. **Streaming:** SSE naturally streams updates incrementally

## Deployment

### Docker Build
```bash
docker build -f Dockerfile -t whs-frontend:latest .
```

### Environment Setup
Create `.env.local`:
```
INVENTORY_SERVICE_URL=http://inventory-service:3001
ORDER_SERVICE_URL=http://order-service:3002
PICKING_SERVICE_URL=http://picking-service:3003
SHIPPING_SERVICE_URL=http://shipping-service:3004
INBOUND_SIMULATOR_URL=http://inventory-simulator-service:3005
DISPATCH_SIMULATOR_URL=http://shipping-simulator-service:3006
ORDER_SIMULATOR_URL=http://order-simulator-service:3007
PICKING_SIMULATOR_URL=http://picking-simulator-service:3008
KAFKA_BROKERS=kafka:9092
```

### Development
```bash
npm run dev     # Start dev server on port 3000
npm run build   # Build for production
npm run start   # Start production server
npm run lint    # ESLint check
```

## Integration Points

The frontend communicates with:
1. **Inventory Service** → GET inventory, POST receive goods
2. **Order Service** → GET orders, POST create order, DELETE/PATCH cancel/resume
3. **Picking Service** → GET tasks, POST complete task
4. **Shipping Service** → GET vehicles, POST register vehicle, POST dispatch
5. **Simulators** → GET status, POST start, POST stop
6. **Kafka Topics** (via SSE) → All event streams for real-time updates

## Error Handling & Resilience

- **API Timeout:** 5000ms default for microservice calls
- **Fallback UI:** Displays "Service Unavailable" if backend unreachable
- **Retry Logic:** Automatic retry on network error (3 attempts with exponential backoff)
- **SSE Reconnection:** Auto-reconnect if EventSource closes
- **Graceful Degradation:** Simulators can be disabled; manual operations still available

## Security Considerations

- **CORS:** Enabled on all microservices (frontend on port 3000, services internal)
- **Server-Side Rendering:** No sensitive URLs or credentials exposed to client
- **Environment Variables:** All URLs are server-side; client only knows `/api/*`
- **Authentication:** Not implemented (academic scope); in production add OAuth2/JWT
