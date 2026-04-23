import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type PickingTaskRecord = {
  taskId: string;
  status: string;
};

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  private readonly pickingServiceUrl =
    process.env.PICKING_SERVICE_URL || 'http://localhost:3003/picking';

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.logger.log('Picking simulator inizializzato.');
  }

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
      `Avviata la simulazione automatica (ogni ${intervalMs / 1000} secondi)...`,
    );

    // Eseguiamo subito la prima passata
    void this.simulatePicking();

    this.simulationInterval = setInterval(() => {
      void this.simulatePicking();
    }, intervalMs);

    return {
      message: 'Picking simulation started',
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

    return { message: 'Picking simulation stopped', isSimulating: false };
  }

  private async simulatePicking() {
    this.logger.log('Ricerca picking task PENDING da completare...');

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.pickingServiceUrl}/tasks`),
      );

      const tasks = response.data;
      if (!Array.isArray(tasks)) {
        this.logger.warn('Formato risposta non valido da picking-service');
        return;
      }

      const pendingTasks = (tasks as PickingTaskRecord[]).filter(
        (task) =>
          task && task.status === 'PENDING' && typeof task.taskId === 'string',
      );

      if (pendingTasks.length === 0) {
        this.logger.log('Nessun picking task PENDING disponibile.');
        return;
      }

      const selectedIndex = Math.floor(Math.random() * pendingTasks.length);
      const selectedTask = pendingTasks[selectedIndex];

      try {
        await firstValueFrom(
          this.httpService.post(
            `${this.pickingServiceUrl}/tasks/${selectedTask.taskId}/complete`,
          ),
        );

        this.logger.log(
          `Picking task ${selectedTask.taskId} completato automaticamente.`,
        );
      } catch (completeError: any) {
        this.logger.error(
          `Errore durante il completamento del task ${selectedTask.taskId}: ${completeError.message}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Impossibile contattare picking-service: ${error.message}`,
      );
    }
  }
}
