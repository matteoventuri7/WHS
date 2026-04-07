Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Nexus WMS - Event Driven Simulator" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Avvio dell'Infrastruttura (Kafka, MongoDB, Zookeeper)..." -ForegroundColor Yellow
cd E:\uni\WHS
docker-compose up -d

Write-Host "Attesa di 15 secondi per permettere a Kafka di avviarsi correttamente..." -ForegroundColor DarkGray
Start-Sleep -Seconds 15

Write-Host "`n[2/3] Avvio dei Microservizi NestJS..." -ForegroundColor Yellow
$services = @(
    @{ Name = "inventory-simulator-service"; Path = "simulators/inventory-simulator-service" },
    @{ Name = "inventory-service"; Path = "inventory-service" },
    @{ Name = "order-service"; Path = "order-service" },
    @{ Name = "picking-service"; Path = "picking-service" },
    @{ Name = "shipping-service"; Path = "shipping-service" },
    @{ Name = "shipping-simulator-service"; Path = "simulators/shipping-simulator-service" },
    @{ Name = "order-simulator-service"; Path = "simulators/order-simulator-service" }
)
foreach ($svc in $services) {
    Write-Host " -> Avvio $($svc.Name)..." -ForegroundColor Green
    Start-Process pwsh -ArgumentList "-NoExit -Command cd E:\uni\WHS\$($svc.Path); npm run start:dev" -WindowStyle Normal
}

Write-Host "`n[3/3] Avvio del Frontend Next.js..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command cd E:\uni\WHS\frontend; npm run dev" -WindowStyle Normal

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "Tutto avviato! Attendi circa 10 secondi per l'inizializzazione." -ForegroundColor Green
Write-Host "Visita la dashboard del simulatore su: http://localhost:3000" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
