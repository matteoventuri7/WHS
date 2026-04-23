import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  // URL of the shipping service
  private readonly shippingServiceUrl =
    process.env.SHIPPING_SERVICE_URL || 'http://localhost:3004/shipping';

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.logger.log('Connessione Kafka Producer (Dispatch) inizializzata.');
  }

  getStatus() {
    return {
      isSimulating: this.isSimulating,
      intervalMs: this.currentInterval,
    };
  }

  startSimulation(intervalMs: number = 20000) {
    if (this.isSimulating) {
      return { message: 'Simulation is already running', isSimulating: true };
    }

    this.isSimulating = true;
    this.currentInterval = intervalMs;
    this.logger.log(
      `Avviata la simulazione automatica (ogni ${intervalMs / 1000} secondi)...`,
    );

    // Eseguiamo subito la prima passata
    this.simulateDispatch();

    this.simulationInterval = setInterval(() => {
      this.simulateDispatch();
    }, intervalMs);

    return {
      message: 'Dispatch simulation started',
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
    this.logger.log('Simulazione automatica arrestata.');

    return { message: 'Dispatch simulation stopped', isSimulating: false };
  }

  private async simulateDispatch() {
    this.logger.log('Controllo veicoli pronti per la spedizione...');

    // Genera randomicamente un nuovo camion (50% di probabilità)
    if (Math.random() < 0.5) {
      this.logger.log('Generazione di un nuovo camion random...');
      await this.generateTruck().catch(() => {});
    }

    try {
      // 1. Recupera i veicoli dallo shipping-service
      const response = await firstValueFrom(
        this.httpService.get(`${this.shippingServiceUrl}/vehicles`),
      );

      const vehicles = response.data;
      if (!vehicles || !Array.isArray(vehicles)) {
        this.logger.warn('Formato risposta non valido da shipping-service');
        return;
      }

      // 2. Filtra i veicoli AVAILABLE e con un carico assegnato
      const readyVehicles = vehicles.filter(
        (v) =>
          v.status === 'AVAILABLE' &&
          (v.currentLoad > 0 ||
            (v.assignedTaskIds && v.assignedTaskIds.length > 0)),
      );

      if (readyVehicles.length === 0) {
        this.logger.log(
          'Nessun veicolo pronto per la partenza (AVAILABLE e con carico > 0).',
        );
        return;
      }

      // 3. Seleziona il veicolo con il carico maggiore (o il primo disponibile)
      readyVehicles.sort((a, b) => b.currentLoad - a.currentLoad);
      const vehicleToDispatch = readyVehicles[0];

      this.logger.log(
        `Trovato veicolo pronto: ${vehicleToDispatch.vehicleId} (Load: ${vehicleToDispatch.currentLoad}/${vehicleToDispatch.maxCapacity})`,
      );

      // 4. Invia la richiesta di dispatch a shipping-service
      try {
        await firstValueFrom(
          this.httpService.post(
            `${this.shippingServiceUrl}/vehicles/${vehicleToDispatch.vehicleId}/dispatch`,
          ),
        );
        this.logger.log(
          `Richiesta di dispatch inviata con successo per il veicolo ${vehicleToDispatch.vehicleId}.`,
        );
      } catch (dispatchError: any) {
        this.logger.error(
          `Errore durante il dispatch del veicolo ${vehicleToDispatch.vehicleId}: ${dispatchError.message}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Impossibile contattare shipping-service: ${error.message}`,
      );
    }
  }

  async generateTruck() {
    const randomId = Math.floor(Math.random() * 10000);
    const vehicleId = `SIM-TRUCK-${randomId}`;
    const maxCapacity = Math.floor(Math.random() * 50) + 50; // Random capacity between 50 and 100

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.shippingServiceUrl}/vehicles`, {
          vehicleId,
          maxCapacity,
        }),
      );
      this.logger.log(
        `Nuovo camion generato dal simulatore: ${vehicleId} (Capacity: ${maxCapacity})`,
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Errore durante la generazione del camion: ${error.message}`,
      );
      throw error;
    }
  }
}
