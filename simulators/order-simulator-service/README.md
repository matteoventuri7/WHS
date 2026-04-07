# Order Simulator Service

Servizio NestJS che genera ordini automatici leggendo la disponibilita dall'inventory-service.

## Endpoint

- POST /order-simulator/start
  - Avvia la simulazione periodica.
  - Body opzionale: { "intervalMs": 15000 }
- POST /order-simulator/stop
  - Ferma la simulazione.
- GET /order-simulator/status
  - Ritorna stato corrente: isSimulating e intervalMs.
- GET /order-simulator/health
  - Health check del simulatore.

## Flusso di simulazione

A ogni ciclo:
1. Legge l'inventario da INVENTORY_SERVICE_URL.
2. Calcola i prodotti disponibili e sceglie in modo random tra i top 5.
3. Crea un ordine su ORDER_SERVICE_URL.
4. Applica la regola di cancellazione random hard coded:
   - con probabilita del 10% sceglie un ordine non completato in modo casuale
   - prova ad annullarlo con PATCH /orders/:id/cancel

## Regola di cancellazione random

La probabilita e hard coded nel codice a 0.1 (10%), senza configurazione da variabili ambiente.

Il simulatore considera non cancellabili gli ordini con status:
- SHIPPED
- CANCELLED
- PICKING_COMPLETED

In caso di errore durante la cancellazione random, il simulatore continua a funzionare e registra solo un warning.

## Configurazione supportata

- INVENTORY_SERVICE_URL (default: http://localhost:3001/inventory)
- ORDER_SERVICE_URL (default: http://localhost:3002/orders)

Non esistono variabili ambiente per la probabilita o per il timing della cancellazione random.

## Sviluppo locale

```bash
npm install
npm run start:dev
```

## Test

```bash
npm run test
npm run lint
```
