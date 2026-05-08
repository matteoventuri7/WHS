import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type PickingTaskRecord = {
  taskId: string;
  status: string;
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  private readonly pickingServiceUrl =
    process.env.PICKING_SERVICE_URL || 'http://localhost:3003/picking';

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
    this.logger.log('Automatic simulation stopped.');

    return { message: 'Picking simulation stopped', isSimulating: false };
  }

  private async simulatePicking() {
    this.logger.log('Searching for PENDING picking tasks to complete...');

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.pickingServiceUrl}/tasks`),
      );

      const tasks = response.data;
      if (!Array.isArray(tasks)) {
        this.logger.warn('Invalid response format from picking-service');
        return;
      }

      const pendingTasks = (tasks as PickingTaskRecord[]).filter(
        (task) =>
          task && task.status === 'PENDING' && typeof task.taskId === 'string',
      );

      if (pendingTasks.length === 0) {
        this.logger.log('No PENDING picking tasks available.');
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
          `Picking task ${selectedTask.taskId} completed automatically.`,
        );
      } catch (completeError: any) {
        this.logger.error(
          `Error completing task ${selectedTask.taskId}: ${completeError.message}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Unable to contact picking-service: ${error.message}`,
      );
    }
  }
}
