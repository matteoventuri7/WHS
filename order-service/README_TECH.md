# Order Service Technical Documentation

## Overview
L'**Order Service** è il punto di ingresso per gli ordini di spedizione merci (Outbound). Agisce come orchestratore per la validazione di evasibilità di un ordine.

## Tecnologie Core
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Modello Dati (Schema Mongoose)
L'entità principale del dominio è l'**Order**:
- `orderId` (String): ID univoco dell'ordine.
- `items` (Array di `{ productId, quantity }`): La lista della spesa.
- `status` (Enum String): Traccia il ciclo di vita (`PENDING`, `SUSPENDED`, `ALLOCATED`, `PICKING_COMPLETED`, `SHIPPED`, `CANCELLED`).
- `allocations` (Array Libero): Un bucket in cui il microservizio salva le istruzioni esatte su "dove trovare" la merce in magazzino, ricevute dall'Inventory Service in un momento successivo.

## API REST (Endpoint Controller)
Il servizio opera sulla porta `3002`:
- `GET /orders`: Mostra lo stato in tempo reale di tutti gli ordini e del loro Lifecycle (Read Model locale).
- `POST /orders`: Endpoint transazionale per ricevere una richiesta cliente (es. UI). Immette un nuovo record nel database locale in stato `PENDING` e scatena il flusso Event-Driven.
- `DELETE /orders/:orderId`: Avvia il flusso di cancellazione di un ordine. Prima di aggiornare il proprio stato, coordina in modo sincrono con il Picking Service.

## Logica Event-Driven (Consumer e Producer)

### 1. Inserimento Nuovo Ordine
L'azione primaria (via API) si traduce in:
1. Salvataggio su Mongo in stato `PENDING`.
2. **Emissione Evento:** Produzione verso Kafka di **`OrderPlaced`**. 
   - Notare che l'Order Service **non sa** e **non chiede** in modo sincrono se c'è stock. Si fida del fatto che un sistema "a valle" (Inventory) reagirà a questo messaggio in differita.

### 2. Gestione Coreografica degli Stati (Consumer)
L'Order Service resta in ascolto del Consumer Group Kafka `order-consumer`. Reagisce ai seguenti eventi, modificando la variabile di stato (`status`) sul proprio database MongoDB per riflettere le mutazioni di dominio.

- **Ascolto evento `InventoryAllocated`**
  - **Reazione:** Quando riceve l'ok dall'Inventory, aggiorna il proprio stato da PENDING a **ALLOCATED**, associandoci le localizzazioni fisiche ricevute.
  - **Emissione a valle:** Reagisce a catena emettendo `OrderReadyForPicking`. Passa il rimpallo al Picking Service dicendogli: *"Questa merce è assegnata all'ordine X, il magazziniere può prenderla"*.

- **Ascolto evento `OutOfStock`**
  - **Reazione:** Il tentativo di evasione è andato male per colpa di un item mancante in magazzino. L'Ordine transita nello stato **SUSPENDED**. Nessuno nel flusso a valle farà nulla.

- **Ascolto evento `ItemStored`** (Evento "Cuore" della reattività)
  - Questo evento viene sparato passivamente dall'Inventory Service ogni qualvolta un camion fornitore scarica merce (Inbound).
  - **Reazione:** L'Order Service si "risveglia" selettivamente. Va sul DB a pescare **tutti** gli ordini attualmente in stato `SUSPENDED` (ordinandoli per data). Per ognuno di essi, prova a re-emettere su Kafka il pacchetto **`OrderPlaced`**, come fosse un ordine appena arrivato, sperando che stavolta il magazzino abbia gli articoli a sufficienza.

- **Ascolto evento `ShipmentAssigned`**
  - **Reazione:** Quando un camion ha fisicamente caricato la merce prelevata nel piazzale del magazzino, aggiorna lo status a **`SHIPPED`**. Questo conclude il ciclo di vita utile tracciato da questo servizio.

- **Ascolto evento `PickingTaskCompleted`**
  - **Reazione:** Quando il Picking Service conferma il completamento del task, l'ordine passa da `ALLOCATED` a **`PICKING_COMPLETED`**.
  - **Effetto sulla UI:** questo stato intermedio impedisce cancellazioni tardive e consente di nascondere subito il bottone di annullamento prima che arrivi `ShipmentAssigned`.

### 3. Cancellazione di un Ordine (Flusso Sincrono)
La cancellazione avviene tramite una chiamata API REST e **non** transita su Kafka, poiché richiede una risposta immediata (sincrona) prima di procedere.

1. Il service riceve la richiesta di annullamento.
2. **Coordinamento con Picking Service:** Esegue una chiamata HTTP `POST /picking/tasks/order/:orderId/cancel` verso il Picking Service.
  - Se l'ordine è in stato `PICKING_COMPLETED`, l'annullamento viene bloccato immediatamente.
   - Se il Picking Service risponde **`200 OK`**: il picking task è stato annullato con successo (era ancora `PENDING`). L'Order Service procede ad aggiornare lo stato dell'ordine in **`CANCELLED`** su MongoDB.
   - Se il Picking Service risponde **`400 Bad Request`**: il task è già avanzato (`IN_PROGRESS` o `COMPLETED`) e la cancellazione viene **bloccata**. L'errore viene propagato alla UI con la motivazione.
3. Se l'ordine non ha ancora un task di picking associato (es. ancora `PENDING` o `SUSPENDED`), viene marcato direttamente come `CANCELLED` senza passare per il Picking Service.
