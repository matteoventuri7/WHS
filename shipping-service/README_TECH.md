# Shipping Service Technical Documentation

## Overview
Lo **Shipping Service** gestisce l'ultimo miglio. Rappresenta il concetto di piazzale esterno: camion, banchine di carico, ottimizzazione pesi/volumi e autorizzazioni di ripartenza furgonati dai Gate di uscita.

## Tecnologie Core
- **Framework:** NestJS
- **Database:** MongoDB (via Mongoose)
- **Message Broker:** Apache Kafka

## Modello Dati (Schema Mongoose)
L'entità core per questo servizio non è "l'ordine spedito", ma il contenitore vettore, ovvero il **Vehicle**:
- `vehicleId` (String): L'identificativo del camion/furgone sul piazzale.
- `maxCapacity` (Number): Simulatore approssimativo del "quanta merce entra nel trailer", calcolato a items (o volume in kg su gestionali complessi).
- `currentLoad` (Number): Stato live del riempimento del bilico (da 0 a `maxCapacity`).
- `assignedTaskIds` (Array di String): Traccia per riferimento inverso quali "Picking Task completati" sono montati a bordo del furgone (permettendoci la stampa bollettazione).
- `status` (Enum String): Tracking tracking logistico ('AVAILABLE' o 'DISPATCHED' cioè in marcia stradale).

## API REST (Endpoint Controller)
Microservizio agganciato sulla porta locale `3004`:
- `GET /shipping/vehicles`: Visione tabellare realtime del parco mezzi a banchina e livello di riempimento percentuale.
- `POST /shipping/vehicles`: Modulo di immatricolazione rapida del furgone. Crea record `AVAILABLE` permettendogli di stanziare sul "Piazzale di smistamento" adiacente.
- `POST /shipping/vehicles/:id/dispatch`: Tasto conclusivo manuale. Autorizza ad alzare la sbarra per i furgoni, cambiando la variabile e confermando il traguardo d'espatrio dei pacchi a bordo.

## Logica Event-Driven (Consumer e Producer)

### 1. Sistema di auto-smistamento sul Piazzale (Core Routing Logics)
Questo microservizio riceve un impulso (in quanto consumer group `shipping-consumer`) e deve prendere immediatamente una scelta algoritmica.

- **Ascolto evento `PickingTaskCompleted`**
  - **Impulso in entrata:** Un Umano operatore (sul Picking Service) ha terminato di raccogliere la merce da vari scaffali, l'ha impacchettata su un transpall e depositata in area spedizione. Il carico è *Fisicamente sul molo*.
  - **Calcolo Logico (Knapsack ridotto):** Il microservizio riceve le `allocations`. Tira una semplice somma algoritmica di "quanti item devo ficcare in un camion" (`totalItems`).
  - Scorre tutti i Camion `AVAILABLE` nel DB Mongo. Valida il cap residuo matematico: se `Vehicle.maxCapacity - Vehicle.currentLoad >= totalItems`, allora prenota il mezzo.
  - Mutata la base dati MongoDB (aumento del currentLoad e salvataggio nell'array dei colli), viene prodotto l'Evento chiave **`ShipmentAssigned`**.

### 2. Disattivazione finale della Bolla Eventata e Tracking (Dispatch Flow)
- L'emissione di evento `VehicleDispatched` funge da segnatura finale inviata su Kafka per storicizzare in data-warehouse che il camion è decollato dalla via o informare architetture esterne.
