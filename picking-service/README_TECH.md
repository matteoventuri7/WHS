# Picking Service Technical Documentation

## Overview
Il **Picking Service** costituisce il Task Manager degli operatori fisici di magazzino. La sua semantica è slegata direttamente dall'Outbound o dallo Stock puro (sebbene li dipenda). Lui gestisce puramente i "Lavori di Prelievo" da far svolgere agli umani (o ai robot industriali).

## Tecnologie Core
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Modello Dati (Schema Mongoose)
L'entità principale del dominio è il **PickingTask**:
- `taskId` (String): ID univoco del lavoro fisico assegnato e stampato al magazziniere.
- `orderId` (String): Reference di collegamento con l'Ordine cliente padre.
- `allocations` (Array): L'elenco operativo del lavoratore (es. "Vai in B-12 e preleva 20 bottiglie").
- `status` (Enum String): Ciclo di vita del task (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

## API REST (Endpoint Controller)
Il master hub gira sulla porta `3003`:
- `GET /picking/tasks`: Elenca la "To-Do List" operativa di magazzino in realt-time.
- `POST /picking/tasks/:taskId/complete`: Simula l'azione del palmare (o lettore RFID) con cui l'omino di magazzino in corsia dice: *"Ho posato i materiali fisicamente nell'area di uscita piazzale"*.
- `POST /picking/tasks/order/:orderId/cancel`: Endpoint sincrono invocato dall'**Order Service** per annullare il task di picking associato a un dato ordine. Funge da guardia bloccante.

## Logica Event-Driven (Consumer e Producer)

### 1. Innesco (Trigger)
Questo servizio non fa partire "azioni d'impulso". Tutto è pre-avviato in ascolto sul consumer group `picking-consumer`.

- **Ascolto evento `OrderReadyForPicking`**
  - **Reazione:** Prende lo schema elaborato dall'Order service. L'Inventory ha precedentemente confermato che "c'è merce in queste specifiche locazioni e il badge `reservedQuantity` è aumentato". Il Picking Service riceve questi dati e crea il **Task di Lavoro Fisico** assegnandolo ad un database Mongo locale (stato: `PENDING`). Da questo momento compare nei monitor sul piano e viene mostrato anche nel tablet dell'operatore.
  - Genera inoltre, facoltativamente a log diagnostici, un trigger a vuoto `PickingTaskCreated` su Kafka.

### 2. Conclusione Materiale del Workflow d'Isola
- **Emissione evento `PickingTaskCompleted`**
  - Quando un attore Umano invia l'API `/complete`, lo status del documento MongoDB muta in `COMPLETED`.
  - In sequenza reattiva, l'operativo Produce (emette su Kafka) evento `PickingTaskCompleted`, avvertendo la filiera di sistema (lo Shipping ed eventuale scarico effettivo della pre-ricevuta di invio).

### 3. Cancellazione di un Picking Task (Flusso Sincrono)
Questo servizio espone un endpoint dedicato che l'Order Service chiama in modo sincrono durante il processo di cancellazione dell'ordine padre.

- **`POST /picking/tasks/order/:orderId/cancel`**
  - **Pre-condizione `PENDING`:** Se il task esiste ed è ancora in stato `PENDING` (il magazziniere non ha ancora iniziato), il servizio aggiorna lo stato in **`CANCELLED`** sul MongoDB locale e risponde `200 OK`. Il task compare nella UI con badge rosso e icona di avviso.
  - **Pre-condizione `IN_PROGRESS`:** Il task è già in lavorazione. Il servizio risponde `400 Bad Request` con il messaggio `"Il picking task è già in corso e non può essere annullato"`. L'ordine padre non viene cancellato.
  - **Pre-condizione `COMPLETED`:** Il task è già concluso. Il servizio risponde `400 Bad Request`. L'ordine non può essere annullato.
  - **Nessun task trovato:** Se non esiste alcun picking task per quell'ordine, risponde `200 OK` (non c'è nulla da bloccare, l'ordine può essere cancellato liberamente).
