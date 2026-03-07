# WMS Event-Driven Architecture

Questo documento riepiloga l'architettura tecnica scelta per il simulatore del sistema di gestione del magazzino (WMS) basato su pattern Event-Driven ed Event Sourcing.

## 1. Stack Tecnologico

Il sistema è strutturato a microservizi al fine di garantire un alto disaccoppiamento e scalabilità. Le tecnologie principali in uso sono:

- **Message Broker:** Apache Kafka. Funge da spina dorsale per lo smistamento degli eventi di dominio tra i vari microservizi.
- **Microservizi Backend:** NestJS (Node.js/TypeScript). Ottimo ecosistema per l'integrazione nativa con Kafka e pattern strutturati (es. CQRS).
- **Database (Microservizi):** MongoDB. Ogni microservizio avrà il proprio database MongoDB isolato. Come richiesto da un'architettura event-driven, l'unica fonte di verità (Source of Truth) ed Event Store sarà unicamente l'Event Stream di Apache Kafka. I database MongoDB locali serviranno solo ai microservizi per salvare il proprio stato corrente, calcolato consumando i messaggi dal broker.
- **Frontend / BFF (Backend for Frontend):** Next.js (React/TypeScript). Gestirà l'interfaccia utente (il simulatore didattico) e comunicherà con i servizi/API, oppure invierà direttamente "Comandi" e farà query ai Read Models.
- **Infrastruttura:** Docker e Docker Compose per containerizzare e orchestrare Kafka (e Zookeeper/KRaft), MongoDB, i vari Microservizi NestJS e l'applicazione Next.js.

## 2. Pattern Architetturali

- **Event-Driven Architecture (EDA):** I servizi non comunicano tramite chiamate sincrone dirette (REST/gRPC), ma reagiscono asincronicamente agli eventi pubblicati su Kafka.
- **Event Sourcing:** Lo stato di ogni entità (un ordine, lo stato dell'inventario) non è salvato in modo puramente relazionale, ma è il risultato della serie di eventi (immutabili) presenti su Kafka. Kafka fungerà direttamente da Event Store.
- **Gestione dello Stato Semplificata:** Non utilizzeremo il pattern CQRS. Mantenere l'architettura semplice è prioritario: ogni microservizio aggiornerà il proprio stato locale in MongoDB consumando gli eventi da Kafka. Per le letture (es. da parte della UI), i microservizi esporranno delle API (REST/GraphQL) che interrogheranno direttamente il proprio database isolato.

## 3. Topologia dei Servizi (Bounded Contexts)

Il dominio è suddiviso in microservizi core autonomi, affiancati da servizi di simulazione:

### 3.1. Inventory Service
- **Responsabilità:** Gestione delle quantità di prodotto e delle locazioni (zone, corsie, scaffali). Ricezione merci in entrata (Inbound).
- **Comandi Principali:** `ReceiveGoods` (riceve merce dal fornitore), `StoreItem` (salva la merce in una specifica locazione).
- **Eventi Emessi:** `GoodsReceived`, `ItemStored`, `InventoryAllocated` (merce riservata per un ordine), `OutOfStock` (quando l'ordine richiede più merce di quella disponibile).
- **Logica Core:** Reagisce agli eventi di nuovi ordini provando ad allocare le risorse disponibili e comunicando l'esito al resto del sistema.

### 3.2. Order Service
- **Responsabilità:** Gestione del ciclo di vita degli ordini in uscita (Outbound).
- **Comandi Principali:** `PlaceOrder` (inserimento nuovo ordine di uscita).
- **Eventi Emessi:** `OrderPlaced`, `OrderSuspended`, `OrderReadyForPicking`.
- **Logica Core:** Una volta emesso l'evento `OrderPlaced`, resta in attesa di risposta dall'Inventory Service. Se riceve `OutOfStock`, emette `OrderSuspended`. Se riceve un riassortimento scatenato da un `ItemStored`, reinnesca automaticamente il tentativo di allocazione.

### 3.3. Picking Service
- **Responsabilità:** Generazione e gestione delle task operative di magazzino in base agli ordini confermati (istruzioni di reperimento su locazioni fisiche).
- **Comandi Principali:** `CompletePickingTask` (input dell'operatore nel simulatore per segnalare l'avvenuto prelievo).
- **Eventi Emessi:** `PickingTaskCreated`, `PickingTaskCompleted`.

### 3.4. Shipping Service
- **Responsabilità:** Assegnazione della merce prelevata ai veicoli disponibili e spedizione.
- **Comandi Principali:** `RegisterVehicle` (registrazione di un furgone con capienza max "X items"), `DispatchVehicle` (partenza del veicolo).
- **Eventi Emessi:** `VehicleRegistered`, `ShipmentAssigned`, `VehicleDispatched`.
- **Logica Core:** Appena sente `PickingTaskCompleted`, tenta di inserire i materiali nei veicoli in attesa rispettando i limiti capienza (items parametrizzati).

### 3.5. Simulatori (Inbound & Dispatch)
- **Responsabilità:** Generazione automatica di carichi di lavoro e automazione di processi per testare e mostrare il sistema in funzione.
- **Inbound Simulator (`inbound-service`):** Genera periodicamente merce in arrivo (simulando i fornitori), emettendo direttamente eventi Kafka `GoodsArriving` o simili.
- **Dispatch Simulator (`dispatch-service`):** Interroga periodicamente le API dello `Shipping Service` per trovare veicoli carichi pronti alla partenza e invia il comando di dispatch in automatico.

## 4. Diagramma di Flusso Esecutivo degli Eventi

1. **(UI -> API)** L'operatore simula un ordine inviando `PlaceOrder(Acqua: 24)`.
2. **Order Service** emette l'evento `OrderPlaced`.
3. **Inventory Service** cattura l'evento. Se sufficiente disponibilità, emette `InventoryAllocated(Locazione: B-12-33)`. Se no, `OutOfStock(Sospeso)`.
4. (Se Allocato) **Picking Service** cattura l'aggregazione di allocazioni e genera una entry, emettendo `PickingTaskCreated`.
5. **(UI -> API)** L'operatore visualizza il task e clicca su "Completa". Il Picking emette `PickingTaskCompleted`.
6. **Shipping Service** cattura il task completato e lo assegna al primo veicolo con capacità residua sufficiente emettendo `ShipmentAssigned`.
7. **Dispatch Simulator** (o operatore da UI) individua i veicoli carichi pronti e innesca la spedizione.
8. **Shipping Service** elabora il dispatch ed emette `VehicleDispatched`.

## 5. La UI di Next.js (Simulatore)

L'applicazione frontend presenterà dashboard separate per ogni dominio, permettendo all'utente "Dio" di scatenare tutti gli eventi:
- **Gestore Ordini:** Form di immissione e lista stato (Allocato, Sospeso, Spedito).
- **Gestione Inbound:** Per immettere merce (risolve gli OutOfStock).
- **Mappa/Lista Inventario:** Fotografia live dello stato mantenuto dall'Inventory Service nei propri database per vedere dove si trova fisicamente la merce.
- **Palmare Magazziniere:** Interfaccia di task list su cosa prelevare.
- **Piazzale Spedizioni:** Dashboard dei camionisti/spedizionieri.
