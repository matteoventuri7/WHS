import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  private readonly inventoryServiceUrl =
    process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001/inventory';

  constructor(private readonly httpService: HttpService) {}

  getStatus() {
    return {
      isSimulating: this.isSimulating,
      intervalMs: this.currentInterval,
    };
  }

  startSimulation(intervalMs: number = 15000) {
    if (this.isSimulating) {
      return { message: 'Simulation is already running', isSimulating: true };
    }

    this.isSimulating = true;
    this.currentInterval = intervalMs;
    this.logger.log(
      `Automatic simulation started (every ${intervalMs / 1000} seconds)...`,
    );

    // Eseguiamo subito la prima passata
    this.simulateInbound();

    this.simulationInterval = setInterval(() => {
      this.simulateInbound();
    }, intervalMs);

    return {
      message: 'Inbound simulation started',
      isSimulating: true,
      intervalMs,
    };
  }

  stopSimulation() {
    if (!this.isSimulating) {
      return { message: 'Simulation is not currently running' };
    }

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    this.isSimulating = false;
    this.currentInterval = null;
    this.logger.log('Automatic simulation stopped.');

    return { message: 'Inbound simulation stopped', isSimulating: false };
  }

  private async simulateInbound() {
    this.logger.log('Generating inbound events...');
    const products = [
      'PROD-001',
      'PROD-002',
      'PROD-003',
      'PROD-004',
      'PROD-005',
    ];
    const locations = ['A1', 'A2', 'B1', 'B2', 'C1'];

    const eventsToEmit = Math.floor(Math.random() * 5) + 1; // Da 1 a 5 articoli per simulazione

    for (let i = 0; i < eventsToEmit; i++) {
      const productId = products[Math.floor(Math.random() * products.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];
      const quantity = Math.floor(Math.random() * 100) + 10;

      const payload = { productId, quantity, location };
      this.logger.log(
        `Sending incoming goods via HTTP: ${JSON.stringify(payload)}`,
      );
      try {
        await firstValueFrom(
          this.httpService.post(`${this.inventoryServiceUrl}/receive`, payload),
        );
      } catch (error: any) {
        this.logger.error(
          `Error sending to inventory-service: ${error.message}`,
        );
      }
    }
  }
}
