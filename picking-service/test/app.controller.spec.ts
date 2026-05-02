import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompletePickingTaskCommand } from '../src/commands/complete-picking-task.command';
import { HandleOrderReadyForPickingCommand } from '../src/commands/handle-order-ready-for-picking.command';
import { CancelPickingTaskCommand } from '../src/commands/cancel-picking-task.command';
import { GetAllTasksQuery } from '../src/queries/get-all-tasks.query';

describe('AppController', () => {
  let appController: AppController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  beforeEach(async () => {
    commandBus = { execute: jest.fn() } as any;
    queryBus = { execute: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  describe('getTasks', () => {
    it('should execute GetAllTasksQuery', async () => {
      const result = [{ taskId: '1', orderId: 'O1', status: 'PENDING' }];
      queryBus.execute.mockResolvedValue(result);

      expect(await appController.getTasks()).toBe(result);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetAllTasksQuery());
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
    it('should execute CompletePickingTaskCommand', async () => {
      const taskId = 'task-123';
      const result = { taskId, status: 'COMPLETED' };
      commandBus.execute.mockResolvedValue(result);

      expect(await appController.completeTask(taskId)).toBe(result);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new CompletePickingTaskCommand(taskId),
      );
    });
  });

  describe('handleOrderReadyForPicking', () => {
    it('should execute HandleOrderReadyForPickingCommand if orderId is provided', async () => {
      const message = { orderId: 'O123', allocations: [] };
      await appController.handleOrderReadyForPicking(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandleOrderReadyForPickingCommand('O123', []),
      );
    });

    it('should not execute command if message is missing orderId', async () => {
      const message = { otherField: 'something' };
      await appController.handleOrderReadyForPicking(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleCancelPickingTask', () => {
    it('should execute CancelPickingTaskCommand if message includes orderId', async () => {
      const message = { orderId: 'O123' };
      await appController.handleCancelPickingTask(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new CancelPickingTaskCommand('O123'),
      );
    });

    it('should not execute command when orderId is missing', async () => {
      const message = { otherField: 'value' };
      await appController.handleCancelPickingTask(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });
});
