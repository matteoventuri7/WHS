Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Nexus WMS - Event Driven Simulator" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Avvio dell'Infrastruttura (Kafka, MongoDB, Zookeeper)..." -ForegroundColor Yellow
cd E:\uni\WHS
docker-compose up -d

Write-Host "Attesa di 15 secondi per permettere a Kafka di avviarsi correttamente..." -ForegroundColor DarkGray
Start-Sleep -Seconds 15

Write-Host "`n[2/3] Avvio dei Microservizi NestJS..." -ForegroundColor Yellow
$services = "inbound-service", "inventory-service", "order-service", "picking-service", "shipping-service", "dispatch-service"
foreach ($svc in $services) {
    Write-Host " -> Avvio $svc..." -ForegroundColor Green
    Start-Process pwsh -ArgumentList "-NoExit -Command cd E:\uni\WHS\$svc; npm run start:dev" -WindowStyle Normal
}

Write-Host "`n[3/3] Avvio del Frontend Next.js..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command cd E:\uni\WHS\frontend; npm run dev" -WindowStyle Normal

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "Tutto avviato! Attendi circa 10 secondi per l'inizializzazione." -ForegroundColor Green
Write-Host "Visita la dashboard del simulatore su: http://localhost:3000" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
