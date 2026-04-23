import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../src/app.service';
import { getModelToken } from '@nestjs/mongoose';
import { PickingTask } from '../src/schemas/picking.schema';
import { EventsGateway } from '../src/events.gateway';
import { Logger } from '@nestjs/common';

describe('AppService', () => {
  let appService: AppService;
  let taskModel: any;
  let kafkaClient: any;
  let eventsGateway: any;

  beforeEach(async () => {
    taskModel = {
      find: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      findOne: jest.fn(),
    };

    // Mock constructor for new taskModel
    const mockTaskModel = function (data: any) {
      Object.assign(this, data);
      this.taskId = 'generated-task-id';
      this.save = jest.fn().mockResolvedValue(this);
    };
    Object.assign(mockTaskModel, taskModel);

    kafkaClient = {
      emit: jest.fn(),
    };

    eventsGateway = {
      notifyDataChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: getModelToken(PickingTask.name), useValue: mockTaskModel },
        { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
        { provide: EventsGateway, useValue: eventsGateway },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);

    // suppress logger
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(appService).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should log initialization', async () => {
      await appService.onModuleInit();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        'Connessione Kafka Producer per Picking Service inizializzata.',
      );
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks', async () => {
      const mockTasks = [{ taskId: '1' }, { taskId: '2' }];
      taskModel.exec.mockResolvedValue(mockTasks);

      const result = await appService.getAllTasks();

      expect(taskModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockTasks);
    });
  });

  describe('handleOrderReadyForPicking', () => {
    it('should create a picking task if it does not exist', async () => {
      taskModel.findOne.mockResolvedValue(null);

      const payload = { orderId: 'O123', allocations: [{ id: 'A1' }] };
      await appService.handleOrderReadyForPicking(payload);

      expect(taskModel.findOne).toHaveBeenCalledWith({ orderId: 'O123' });
      expect(kafkaClient.emit).toHaveBeenCalledWith('PickingTaskCreated', {
        taskId: 'generated-task-id',
        orderId: 'O123',
        allocations: [{ id: 'A1' }],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should not create a task if it already exists', async () => {
      taskModel.findOne.mockResolvedValue({ orderId: 'O123', taskId: 'T1' });

      const payload = { orderId: 'O123', allocations: [{ id: 'A1' }] };
      await appService.handleOrderReadyForPicking(payload);

      expect(taskModel.findOne).toHaveBeenCalledWith({ orderId: 'O123' });
      expect(kafkaClient.emit).not.toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).not.toHaveBeenCalled();
    });
  });

  describe('completePickingTask', () => {
    it('should complete task if it is PENDING', async () => {
      const mockTask = {
        taskId: 'T123',
        orderId: 'O123',
        allocations: [{ id: 'A1' }],
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      taskModel.findOne.mockResolvedValue(mockTask);

      const result = await appService.completePickingTask('T123');

      expect(taskModel.findOne).toHaveBeenCalledWith({ taskId: 'T123' });
      expect(mockTask.status).toBe('COMPLETED');
      expect(mockTask.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('PickingTaskCompleted', {
        taskId: mockTask.taskId,
        orderId: mockTask.orderId,
        allocations: mockTask.allocations,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(mockTask);
    });

    it('should throw an error if task is not found', async () => {
      taskModel.findOne.mockResolvedValue(null);
      await expect(appService.completePickingTask('T123')).rejects.toThrow(
        'Task non trovato o già completato',
      );
    });

    it('should throw an error if task is not PENDING', async () => {
      const mockTask = { taskId: 'T123', status: 'COMPLETED' };
      taskModel.findOne.mockResolvedValue(mockTask);
      await expect(appService.completePickingTask('T123')).rejects.toThrow(
        'Task non trovato o già completato',
      );
    });
  });

  describe('cancelPickingTask', () => {
    it('should return success if task is not found', async () => {
      taskModel.findOne.mockResolvedValue(null);

      const result = await appService.cancelPickingTask('O123');
      expect(result).toEqual({
        success: true,
        message: 'Nessun picking task associato.',
      });
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        `Nessun picking task trovato per l'ordine O123. Annullamento consentito.`,
      );
    });

    it('should cancel the task if it is PENDING', async () => {
      const mockTask = {
        taskId: 'T123',
        orderId: 'O123',
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      taskModel.findOne.mockResolvedValue(mockTask);

      const result = await appService.cancelPickingTask('O123');
      expect(mockTask.status).toBe('CANCELLED');
      expect(mockTask.save).toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Picking task annullato.',
      });
    });

    it('should throw an error if task cannot be cancelled', async () => {
      const mockTask = {
        taskId: 'T123',
        orderId: 'O123',
        status: 'IN_PROGRESS',
        save: jest.fn(),
      };
      taskModel.findOne.mockResolvedValue(mockTask);

      await expect(appService.cancelPickingTask('O123')).rejects.toThrow(
        'Impossibile annullare: il task di picking è in stato IN_PROGRESS',
      );
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        `Impossibile annullare Picking Task T123 per ordine O123 (stato: IN_PROGRESS).`,
      );
    });
  });
});
