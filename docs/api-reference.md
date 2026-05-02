# WHS Microservices API Reference

Documento di riepilogo completo degli endpoint REST e messaggi Kafka per ogni microservizio del sistema WHS (Warehouse Management System).

**Struttura del documento:**
- **Endpoint REST**: Metodo HTTP, percorso e descrizione
- **Kafka Consumati**: Messaggi che il servizio ascolta
- **Kafka Inviati**: Messaggi che il servizio emette

---

## Servizi Principali (Event-Driven)

### 1. Inventory Service (Porta 3001)

**Descrizione**: Gestisce l'inventario del magazzino, le prenotazioni di stock e la ricezione della merce.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `POST` | `/inventory/receive` | Riceve nuova merce in magazzino. Payload: `{productId, quantity, location}` |
| `GET` | `/inventory` | Restituisce tutti gli articoli in inventario |
| `GET` | `/inventory/health` | Health check del servizio |

#### Kafka - Messaggi Consumati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `OrderPlaced` | `{orderId, items: [{productId, quantity}]}` | Tentativo di allocazione stock per un nuovo ordine |
| `OrderCancelled` | `{orderId, previousStatus, allocations}` | Rilascio delle prenotazioni di stock |

#### Kafka - Messaggi Inviati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `ItemStored` | `{productId, location, addedQuantity, totalQuantity}` | Confermato l'immagazzinamento della merce |
| `InventoryAllocated` | `{orderId, allocations: [{productId, quantity, location}]}` | Stock allocato con successo per l'ordine |
| `OutOfStock` | `{orderId}` | Impossibile allocare lo stock richiesto |

---

### 2. Order Service (Porta 3002)

**Descrizione**: Gestisce la creazione, lo stato e il ciclo di vita degli ordini.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `POST` | `/orders` | Crea un nuovo ordine. Payload: `{items: [{productId, quantity}]}` |
| `GET` | `/orders` | Restituisce tutti gli ordini |
| `PATCH` | `/orders/{id}/cancel` | Annulla un ordine (se cancellabile) |
| `PATCH` | `/orders/{id}/resume` | Riprende un ordine precedentemente sospeso |
| `GET` | `/orders/health` | Health check del servizio |

#### Kafka - Messaggi Consumati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `InventoryAllocated` | `{orderId, allocations}` | Conferma allocazione stock → ordine passa a ALLOCATED |
| `OutOfStock` | `{orderId}` | Stock insufficiente → ordine passa a SUSPENDED |
| `ItemStored` | (nessun payload specifico) | Ripristino automatico ordini SUSPENDED |
| `ShipmentAssigned` | `{orderId}` | Spedizione assegnata a veicolo → ordine passa a SHIPPED |
| `PickingTaskCompleted` | `{orderId}` | Picking completato → ordine passa a PICKING_COMPLETED |

#### Kafka - Messaggi Inviati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `OrderPlaced` | `{orderId, items: [{productId, quantity}]}` | Nuovo ordine creato, pronto per allocazione |
| `OrderCancelled` | `{orderId, previousStatus, allocations}` | Ordine annullato con rollback stock |
| `CancelPickingTask` | `{orderId}` | Richiesta asincrona di annullamento del picking task associato |
| `OrderReadyForPicking` | `{orderId, allocations}` | Stock allocato, pronto per il picking |
| `OrderSuspended` | `{orderId}` | Ordine sospeso in attesa di stock |

---

### 3. Picking Service (Porta 3003)

**Descrizione**: Gestisce i compiti di prelievo (picking) degli articoli dal magazzino.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/picking/tasks` | Restituisce tutti i picking task |
| `POST` | `/picking/tasks/{taskId}/complete` | Contrassegna un task come completato |
| `GET` | `/picking/health` | Health check del servizio |

#### Kafka - Messaggi Consumati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `OrderReadyForPicking` | `{orderId, allocations}` | Crea un nuovo picking task per l'ordine |
| `CancelPickingTask` | `{orderId}` | Annulla il picking task associato a un ordine |

#### Kafka - Messaggi Inviati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `PickingTaskCreated` | `{taskId, orderId, allocations}` | Nuovo task di picking creato |
| `PickingTaskCompleted` | `{taskId, orderId, allocations}` | Picking completato, pronto per spedizione |

---

### 4. Shipping Service (Porta 3004)

**Descrizione**: Gestisce l'assegnazione di spedizioni ai veicoli e il dispatching.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/shipping/vehicles` | Restituisce tutti i veicoli registrati |
| `GET` | `/shipping/pending` | Restituisce le spedizioni in sospeso (in attesa di veicoli disponibili) |
| `POST` | `/shipping/vehicles` | Registra un nuovo veicolo. Payload: `{vehicleId, maxCapacity}` |
| `POST` | `/shipping/vehicles/{id}/dispatch` | Invia il veicolo al deposito (cambia stato a DISPATCHED) |
| `GET` | `/shipping/health` | Health check del servizio |

#### Kafka - Messaggi Consumati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `PickingTaskCompleted` | `{taskId, orderId, allocations}` | Tenta di assegnare a un veicolo disponibile |

#### Kafka - Messaggi Inviati

| Evento | Payload | Descrizione |
|--------|---------|-------------|
| `VehicleRegistered` | `{vehicleId, maxCapacity}` | Nuovo veicolo registrato nel sistema |
| `ShipmentAssigned` | `{taskId, orderId, vehicleId}` | Spedizione assegnata a un veicolo |
| `VehicleDispatched` | `{vehicleId, tasks}` | Veicolo partito con le spedizioni assegnate |

---

## Servizi Simulatori (HTTP-Only)

> **Nota**: I servizi simulatori controllano i servizi principali esclusivamente tramite HTTP REST API. Non emettono né consumano eventi Kafka.

---

### 5. Inventory Simulator Service (Porta 3005 - Inbound)

**Descrizione**: Simula l'arrivo di merci nel magazzino con intervalli regolabili.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/inbound/status` | Restituisce lo stato della simulazione (isSimulating, intervalMs) |
| `POST` | `/inbound/start` | Avvia la simulazione con intervallo configurabile. Payload: `{intervalMs?}` (default 15000ms) |
| `POST` | `/inbound/stop` | Arresta la simulazione |
| `GET` | `/inbound/health` | Health check del servizio |

#### Comportamento

- **Simulazione**: Ogni intervallo genera 1-5 richieste `POST /inventory/receive` con prodotti casuali (PROD-001 a PROD-005)
- **Payload**: `{productId, quantity, location}`
- **Locazioni**: A1, A2, B1, B2, C1
- **HTTP Calls**:
  - `POST http://inventory-service:3001/inventory/receive`

---

### 6. Order Simulator Service

**Descrizione**: Simula la creazione di ordini basati sulla disponibilità di inventario e cancellazioni casuali.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/order-simulator/status` | Restituisce lo stato della simulazione |
| `POST` | `/order-simulator/start` | Avvia la simulazione. Payload: `{intervalMs?}` (default 15000ms) |
| `POST` | `/order-simulator/stop` | Arresta la simulazione |
| `GET` | `/order-simulator/health` | Health check del servizio |

#### Comportamento

- **Simulazione**: Ogni intervallo:
  1. Recupera l'inventario dal `/inventory` service
  2. Seleziona un prodotto disponibile tra i top 5
  3. Crea un ordine via `POST /orders`
  4. Cancella randomicamente (~10%) un ordine non completato
- **HTTP Calls**: 
  - `GET http://inventory-service:3001/inventory`
  - `POST http://order-service:3002/orders`
  - `GET http://order-service:3002/orders`
  - `PATCH http://order-service:3002/orders/{orderId}/cancel`


---

### 7. Picking Simulator Service

**Descrizione**: Simula il completamento automatico dei picking task.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/picking-simulator/status` | Restituisce lo stato della simulazione |
| `POST` | `/picking-simulator/start` | Avvia la simulazione. Payload: `{intervalMs?}` (default 15000ms) |
| `POST` | `/picking-simulator/stop` | Arresta la simulazione |
| `GET` | `/picking-simulator/health` | Health check del servizio |

#### Comportamento

- **Simulazione**: Ogni intervallo:
  1. Recupera i picking task dal `/picking/tasks`
  2. Filtra i task con status `PENDING`
  3. Completa uno random via `POST /picking/tasks/{taskId}/complete`
- **HTTP Calls**:
  - `GET http://picking-service:3003/picking/tasks`
  - `POST http://picking-service:3003/picking/tasks/{taskId}/complete`

---

### 8. Shipping Simulator Service (Porta 3006 - Dispatch)

**Descrizione**: Simula il dispatch di veicoli e genera automaticamente nuovi camion.

#### Endpoint REST

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET` | `/dispatch/status` | Restituisce lo stato della simulazione |
| `POST` | `/dispatch/start` | Avvia la simulazione. Payload: `{intervalMs?}` (default 20000ms) |
| `POST` | `/dispatch/stop` | Arresta la simulazione |
| `POST` | `/dispatch/truck` | Genera manualmente un nuovo camion (random ID e capacità 50-100) |
| `GET` | `/dispatch/health` | Health check del servizio |

#### Comportamento

- **Simulazione**: Ogni intervallo:
  1. 50% di probabilità di generare un nuovo camion random
  2. Recupera i veicoli da `/shipping/vehicles`
  3. Filtra veicoli AVAILABLE con carico assegnato (currentLoad > 0 o assignedTaskIds.length > 0)
  4. Ordina per carico decrescente e dispatch il primo → `POST /shipping/vehicles/{vehicleId}/dispatch`
- **HTTP Calls**:
  - `GET http://shipping-service:3004/shipping/vehicles`
  - `POST http://shipping-service:3004/shipping/vehicles` (per generare camioni)
  - `POST http://shipping-service:3004/shipping/vehicles/{vehicleId}/dispatch`

#### Kafka - Messaggi Consumati

Nessuno (simulatore puro).

#### Kafka - Messaggi Inviati

Nessuno (comunica via HTTP con shipping-service).

---

## Flussi di Comunicazione Principali

### Happy Path: Ordine → Spedizione

```
1. Order Service
   ├─→ POST /orders
   └─→ emit: OrderPlaced

2. Inventory Service (consuma: OrderPlaced)
   ├─→ Alloca stock
   └─→ emit: InventoryAllocated (o OutOfStock)

3. Order Service (consuma: InventoryAllocated)
   ├─→ Status: ALLOCATED
   └─→ emit: OrderReadyForPicking

4. Picking Service (consuma: OrderReadyForPicking)
   ├─→ Crea picking task
   └─→ emit: PickingTaskCreated

5. Picking Service (stato interno o simulatore)
   ├─→ Completa picking task
   └─→ emit: PickingTaskCompleted

6. Shipping Service (consuma: PickingTaskCompleted)
   ├─→ Assegna a veicolo disponibile
   └─→ emit: ShipmentAssigned

7. Order Service (consuma: ShipmentAssigned)
   └─→ Status: SHIPPED
```

### Cancellazione Ordine

```
1. Order Service
   ├─→ PATCH /orders/{id}/cancel
   ├─→ emit: CancelPickingTask  (solo se ordine era in stato ALLOCATED)
   └─→ emit: OrderCancelled (previousStatus, allocations)

2. Picking Service (consuma: CancelPickingTask)
   └─→ Task → CANCELLED (se in stato PENDING, idempotente)

3. Inventory Service (consuma: OrderCancelled)
   ├─→ Rilascia le prenotazioni di stock
   └─→ emit: ItemStored

4. Order Service (consuma: ItemStored)
   ├─→ Riprova allocazione ordini SUSPENDED
   └─→ emit: OrderPlaced (per i sospesi)
```

### Out of Stock → Ripresa

```
1. Order Service (consuma: OutOfStock)
   ├─→ Status: SUSPENDED
   └─→ emit: OrderSuspended

2. (Arriva merce: Inbound Simulator)
   └─→ POST /inventory/receive (HTTP)

3. Inventory Service (riceve merce via HTTP)
   ├─→ Immagazzina
   └─→ emit: ItemStored

4. Order Service (consuma: ItemStored)
   ├─→ Riprova allocazione ordini SUSPENDED
   └─→ emit: OrderPlaced
```

---

## Configurazione Ambiente

### Variabili d'Ambiente (per Simulatori)

```bash
# Inventory Simulator (Inbound)
# (nessuna, usa default)

# Order Simulator
ORDER_SERVICE_URL=http://order-service:3002/orders
INVENTORY_SERVICE_URL=http://inventory-service:3001/inventory

# Picking Simulator
PICKING_SERVICE_URL=http://picking-service:3003/picking

# Shipping Simulator (Dispatch)
SHIPPING_SERVICE_URL=http://shipping-service:3004/shipping
```

### MongoDB URIs

Tutti i servizi usano variabile `MONGODB_URI` (injected in docker-compose):

```
# Ogni servizio usa il proprio container DB dedicato:
mongodb://root:example@inventory-db:27017/inventory?authSource=admin
mongodb://root:example@order-db:27018/order?authSource=admin
mongodb://root:example@picking-db:27019/picking?authSource=admin
mongodb://root:example@shipping-db:27020/shipping?authSource=admin
```

### Kafka Broker

- **Broker**: `kafka:9092` (interno docker-compose, listener PLAINTEXT)
- **Topics**: Pre-creati da `kafka-init` container

---

## Consumer Groups Kafka

Ogni servizio ha un consumer group associato per garantire che i messaggi siano processati una sola volta:

| Servizio | Consumer Group |
|----------|----------------|
| Inventory Service | `inventory-consumer` |
| Order Service | `order-consumer` |
| Picking Service | `picking-consumer` |
| Shipping Service | `shipping-consumer` |

---

## Health Check Endpoint Standard

Tutti i servizi espongono un endpoint health check standardizzato:

```
GET /{service-name}/health
Response: { status: 'ok', service: '{service-name}' }
```

**Servizio** → **Percorso**:
- Inventory → `GET /inventory/health`
- Order → `GET /orders/health`
- Picking → `GET /picking/health`
- Shipping → `GET /shipping/health`
- Inbound Simulator → `GET /inbound/health`
- Order Simulator → `GET /order-simulator/health`
- Picking Simulator → `GET /picking-simulator/health`
- Dispatch Simulator → `GET /dispatch/health`

---

## Port Mapping

| Servizio | Porta | Tipo |
|----------|-------|------|
| Inventory Service | 3001 | NestJS + WebSocket |
| Order Service | 3002 | NestJS + WebSocket |
| Picking Service | 3003 | NestJS + WebSocket |
| Shipping Service | 3004 | NestJS + WebSocket |
| Inbound Simulator | 3005 | NestJS |
| Dispatch Simulator | 3006 | NestJS |
| Order Simulator | 3007 | NestJS |
| Picking Simulator | 3008 | NestJS |
| Kafka Broker | 9092 (localhost), 29092 (docker) | Message Broker |
| MongoDB Services | 27017–27020 | Database (una per servizio core) |

---

## Note Tecniche

1. **Event-Driven Architecture**: La comunicazione tra servizi principali è **100% asincrona** via Kafka.

2. **Local State Management**: Ogni servizio ha il proprio MongoDB isolato per mantenere lo stato calcolato dagli eventi.

3. **Idempotency**: I listener Kafka sono idempotenti (es. il picking task non viene ricreato se esiste già per lo stesso ordine).

4. **Simulatori**: I simulatori controllano i servizi via HTTP REST API e generano carico di test/simulazione.

5. **WebSocket Real-Time**: Tutti e 4 i servizi principali (Inventory, Order, Picking, Shipping) espongono WebSocket gateway per notificare il frontend dei cambiamenti in tempo reale via evento `dataChanged`.

6. **Cancellazione Picking**: L'order service emette `CancelPickingTask` via Kafka quando un ordine allocato viene annullato; il picking service gestisce l'annullamento in modo asincrono e idempotente.

---

**Ultimo aggiornamento**: Aprile 2026
**Versione**: 1.0
