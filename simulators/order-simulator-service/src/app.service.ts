import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type InventoryRecord = {
  productId: string;
  quantity: number;
  reservedQuantity: number;
};

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  private readonly inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001/inventory';
  private readonly orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3002/orders';

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    private readonly httpService: HttpService,
  ) { }

  async onModuleInit() {
    this.logger.log('Order simulator inizializzato.');
  }

  getStatus() {
    return {
      isSimulating: this.isSimulating,
      intervalMs: this.currentInterval
    };
  }

  startSimulation(intervalMs: number = 15000) {
    if (this.isSimulating) {
      return { message: 'Simulation is already running', isSimulating: true };
    }

    this.isSimulating = true;
    this.currentInterval = intervalMs;
    this.logger.log(`Avviata la simulazione automatica (ogni ${intervalMs / 1000} secondi)...`);

    // Eseguiamo subito la prima passata
    void this.simulateOrder();

    this.simulationInterval = setInterval(() => {
      void this.simulateOrder();
    }, intervalMs);

    return {
      message: 'Order simulation started',
      isSimulating: true,
      intervalMs
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
    this.logger.log('Simulazione automatica arrestata.');

    return { message: 'Order simulation stopped', isSimulating: false };
  }

  private async simulateOrder() {
    this.logger.log('Analisi inventario per generare un nuovo ordine...');

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.inventoryServiceUrl)
      );

      const inventoryRows = response.data;
      if (!Array.isArray(inventoryRows)) {
        this.logger.warn('Formato risposta non valido da inventory-service');
        return;
      }

      const availableByProduct = new Map<string, number>();

      for (const row of inventoryRows as InventoryRecord[]) {
        if (!row || typeof row.productId !== 'string') {
          continue;
        }

        const total = Number(row.quantity ?? 0);
        const reserved = Number(row.reservedQuantity ?? 0);
        const available = Math.max(0, total - reserved);
        if (available <= 0) {
          continue;
        }

        const current = availableByProduct.get(row.productId) ?? 0;
        availableByProduct.set(row.productId, current + available);
      }

      const topProducts = Array.from(availableByProduct.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topProducts.length === 0) {
        this.logger.log('Nessun prodotto disponibile: ordine non generato.');
        return;
      }

      const selectedIndex = Math.floor(Math.random() * topProducts.length);
      const [selectedProductId, selectedAvailability] = topProducts[selectedIndex];
      const quantity = Math.floor(Math.random() * 50) + 1;

      try {
        await firstValueFrom(
          this.httpService.post(this.orderServiceUrl, {
            items: [{ productId: selectedProductId, quantity }],
          })
        );

        this.logger.log(
          `Ordine generato: ${quantity}x ${selectedProductId} (disponibilita top: ${selectedAvailability}).`,
        );
      } catch (orderError: any) {
        this.logger.error(`Errore durante la creazione ordine: ${orderError.message}`);
      }
    } catch (error: any) {
      this.logger.error(`Impossibile contattare inventory-service: ${error.message}`);
    }
  }
}
