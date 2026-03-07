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
- `status` (Enum String): Ciclo di vita limitato, puramente dicotomico ('PENDING' e 'COMPLETED').

## API REST (Endpoint Controller)
Il master hub gira sulla porta `3003`:
- `GET /picking/tasks`: Elenca la "To-Do List" operativa di magazzino in realt-time.
- `POST /picking/tasks/:taskId/complete`: Simula l'azione del palmare (o lettore RFID) con cui l'omino di magazzino in corsia dice: *"Ho posato i materiali fisicamente nell'area di uscita piazzale"*.

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
