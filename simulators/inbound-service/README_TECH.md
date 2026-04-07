# Inventory Service Technical Documentation

## Overview
L'**Inventory Service** è responsabile del tracciamento dello stato fisico del magazzino. Gestisce le locazioni, i livelli di giacenza (stock) per ciascun prodotto e l'allocazione delle risorse richieste dagli ordini in uscita.

## Tecnologie Core
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Modello Dati (Schema Mongoose)
L'entità principale del dominio è l'**Inventory**:
- `productId` (String): L'identificativo univoco dell'articolo (SKU).
- `location` (String): La locazione fisica all'interno del magazzino (es. Corsia, Scaffale, Livello).
- `quantity` (Number): La quantità totale fisicamente presente per quella coppia `productId-location`.
- `reservedQuantity` (Number): La quantità attualmente "bloccata"/allocata per ordini in fase di prelevamento.
  - *NB:* La quantità *disponibile* effettiva (Available to Promise) è calcolata come `quantity - reservedQuantity`.

## API REST (Endpoint Controller)
Il servizio espone API REST sulla porta `3001` per l'interazione diretta, in particolare per la simulazione dell'Inbound:
- `GET /inventory`: Ritorna una fotografia di tutti i record presenti a magazzino, mostrando giacenze e riserve (Read Model locale).
- `POST /inventory/receive`: Endpoint per registrare l'ingresso di nuova merce (*Inbound*). Richiede payload: `{ productId, location, quantity }`.

## Logica Event-Driven (Consumer e Producer)

### 1. Ricezione Merci (Inbound Handling)
Quando l'API `/receive` viene invocata, il servizio:
1. Cerca su DB un record esistente per lo stesso prodotto nella stessa locazione. Se esiste, somma la quantità, altrimenti crea un nuovo record.
2. **Emissione Evento:** Produce verso Kafka (`localhost:29092`) il messaggio **`ItemStored`**.
   - **Perché:** Quest'evento è cruciale affinché l'Order Service sappia che c'è nuova merce e possa riprovare ad allocare eventuali ordini precedentemente bloccati (Out of Stock).

### 2. Gestione Allocazione (Order Placement Handling)
Il servizio si iscrive al Consumer Group Kafka `inventory-consumer` e resta in ascolto passivo di uno specifico evento:

- **Ascolto evento `OrderPlaced`**
  - Quando arriva un evento `OrderPlaced` (emesso dall'Order Service), il payload contiene i prodotti e le quantità richieste per l'ordine in transito.
  - **Logica Core:** Itera su ogni prodotto richiesto, cercando sul DB Mongoose le locazioni dove è stoccato cercando di raggiungere la quota richiesta.
  - Per ogni locazione, calcola l'Available to Promise (`quantity - reservedQuantity`). Se positivo, "blocca" la parte necessaria incrementando temporaneamente `reservedQuantity`.
  - **Successo:** Se tutta la merce richiesta viene coperta matematicamente dallo stock, emette verso Kafka l'evento **`InventoryAllocated`**, includendo un array di allocazioni (`[{ productId, quantity, location }]`) che indicherà esattamente "da dove prendere" la merce.
  - **Fallimento (OutOfStock):** Se la somma delle quantità fisiche disponibili è inferiore al totale richiesto dall'ordine, l'allocazione fallisce. Viene effettuato un **Rollback** nel DB (azzerando eventuali incrementi parziali fatti al `reservedQuantity` durante il loop precedente) e viene emesso verso Kafka l'evento **`OutOfStock`** associato all'ID dell'ordine.
