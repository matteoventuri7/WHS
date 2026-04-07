import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
  ) { }

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.log('Connessione Kafka Producer (Inbound) inizializzata.');
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
    this.simulateInbound();

    this.simulationInterval = setInterval(() => {
      this.simulateInbound();
    }, intervalMs);

    return {
      message: 'Inbound simulation started',
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

    return { message: 'Inbound simulation stopped', isSimulating: false };
  }

  private async simulateInbound() {
    this.logger.log('Generazione eventi inbound...');
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
        `Emissione evento GoodsArriving: ${JSON.stringify(payload)}`,
      );
      this.kafkaClient.emit('GoodsArriving', payload);
    }
  }
}
