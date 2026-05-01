import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<Partial<AppService>>;

  beforeEach(async () => {
    appService = {
      getAllTasks: jest.fn(),
      completePickingTask: jest.fn(),
      handleOrderReadyForPicking: jest.fn(),
      cancelPickingTask: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  describe('getTasks', () => {
    it('should return an array of tasks', async () => {
      const result = [{ taskId: '1', orderId: 'O1', status: 'PENDING' }];
      (appService.getAllTasks as jest.Mock).mockResolvedValue(result);

      expect(await appController.getTasks()).toBe(result);
      expect(appService.getAllTasks).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'picking',
      });
    });
  });

  describe('completeTask', () => {
    it('should complete a task', async () => {
      const taskId = 'task-123';
      const result = { taskId, status: 'COMPLETED' };
      (appService.completePickingTask as jest.Mock).mockResolvedValue(result);

      expect(await appController.completeTask(taskId)).toBe(result);
      expect(appService.completePickingTask).toHaveBeenCalledWith(taskId);
    });
  });

  describe('handleOrderReadyForPicking', () => {
    it('should handle order ready event if orderId is provided', async () => {
      const message = { orderId: 'O123', allocations: [] };
      await appController.handleOrderReadyForPicking(message);
      expect(appService.handleOrderReadyForPicking).toHaveBeenCalledWith(
        message,
      );
    });

    it('should not call service if message is missing orderId', async () => {
      const message = { otherField: 'something' };
      await appController.handleOrderReadyForPicking(message);
      expect(appService.handleOrderReadyForPicking).not.toHaveBeenCalled();
    });
  });

  describe('handleCancelPickingTask', () => {
    it('should dispatch cancellation if message includes orderId', async () => {
      const message = { orderId: 'O123' };

      await appController.handleCancelPickingTask(message);

      expect(appService.cancelPickingTask).toHaveBeenCalledWith('O123');
    });

    it('should ignore message when orderId is missing', async () => {
      const message = { otherField: 'value' };

      await appController.handleCancelPickingTask(message);

      expect(appService.cancelPickingTask).not.toHaveBeenCalled();
    });
  });
});
