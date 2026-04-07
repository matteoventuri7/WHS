# Picking Simulator Service

Servizio NestJS che automatizza il completamento dei task di picking.

## Endpoint

- `GET /picking-simulator/health`
- `GET /picking-simulator/status`
- `POST /picking-simulator/start` con body opzionale `{ "intervalMs": number }`
- `POST /picking-simulator/stop`

## Comportamento

Quando il simulatore e attivo:

1. Interroga `GET /picking/tasks` del Picking Service.
2. Filtra i task con stato `PENDING`.
3. Seleziona casualmente un task.
4. Esegue `POST /picking/tasks/:taskId/complete`.

Default intervallo: 15000 ms.

## Avvio locale

```bash
npm install
npm run start:dev
```

## Test

```bash
npm run test
npm run test:e2e
```
