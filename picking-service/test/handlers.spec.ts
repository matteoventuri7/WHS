import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PickingTask } from '../src/schemas/picking.schema';
import { EventsGateway } from '../src/events.gateway';
import { CompletePickingTaskHandler } from '../src/commands/complete-picking-task.handler';
import { HandleOrderReadyForPickingHandler } from '../src/commands/handle-order-ready-for-picking.handler';
import { CancelPickingTaskHandler } from '../src/commands/cancel-picking-task.handler';
import { GetAllTasksHandler } from '../src/queries/get-all-tasks.handler';
import { CompletePickingTaskCommand } from '../src/commands/complete-picking-task.command';
import { HandleOrderReadyForPickingCommand } from '../src/commands/handle-order-ready-for-picking.command';
import { CancelPickingTaskCommand } from '../src/commands/cancel-picking-task.command';
import { GetAllTasksQuery } from '../src/queries/get-all-tasks.query';

describe('Picking Command & Query Handlers', () => {
  let kafkaClient: any;
  let taskModel: any;
  let eventsGateway: any;

  beforeEach(() => {
    kafkaClient = { emit: jest.fn() };
    eventsGateway = { notifyDataChanged: jest.fn() };
    taskModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      taskId: 'T1',
      save: jest.fn().mockResolvedValue(true),
    }));
    taskModel.find = jest.fn();
    taskModel.findOne = jest.fn();
  });

  describe('CompletePickingTaskHandler', () => {
    let handler: CompletePickingTaskHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CompletePickingTaskHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(PickingTask.name), useValue: taskModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<CompletePickingTaskHandler>(CompletePickingTaskHandler);
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
    });

    it('should complete a pending task and emit PickingTaskCompleted', async () => {
      const task = {
        taskId: 'T1',
        orderId: 'O1',
        allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      taskModel.findOne.mockResolvedValue(task);

      const result = await handler.execute(new CompletePickingTaskCommand('T1'));

      expect(task.status).toBe('COMPLETED');
      expect(task.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('PickingTaskCompleted', {
        taskId: 'T1',
        orderId: 'O1',
        allocations: task.allocations,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(task);
    });

    it('should throw if task is not found', async () => {
      taskModel.findOne.mockResolvedValue(null);
      await expect(
        handler.execute(new CompletePickingTaskCommand('T1')),
      ).rejects.toThrow('Task non trovato o già completato');
    });

    it('should throw if task is already completed', async () => {
      taskModel.findOne.mockResolvedValue({ taskId: 'T1', status: 'COMPLETED' });
      await expect(
        handler.execute(new CompletePickingTaskCommand('T1')),
      ).rejects.toThrow('Task non trovato o già completato');
    });
  });

  describe('HandleOrderReadyForPickingHandler', () => {
    let handler: HandleOrderReadyForPickingHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleOrderReadyForPickingHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(PickingTask.name), useValue: taskModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<HandleOrderReadyForPickingHandler>(
        HandleOrderReadyForPickingHandler,
      );
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
    });

    it('should create a new picking task if none exists', async () => {
      taskModel.findOne.mockResolvedValue(null);

      await handler.execute(
        new HandleOrderReadyForPickingCommand('O1', [
          { productId: 'P1', quantity: 5, location: 'A1' },
        ]),
      );

      expect(taskModel).toHaveBeenCalledWith({
        orderId: 'O1',
        allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
        status: 'PENDING',
      });
      expect(kafkaClient.emit).toHaveBeenCalledWith('PickingTaskCreated', {
        taskId: 'T1',
        orderId: 'O1',
        allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should not create task if one already exists for the order', async () => {
      taskModel.findOne.mockResolvedValue({ taskId: 'T1', orderId: 'O1' });

      await handler.execute(
        new HandleOrderReadyForPickingCommand('O1', []),
      );

      expect(kafkaClient.emit).not.toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).not.toHaveBeenCalled();
    });
  });

  describe('CancelPickingTaskHandler', () => {
    let handler: CancelPickingTaskHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CancelPickingTaskHandler,
          { provide: getModelToken(PickingTask.name), useValue: taskModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<CancelPickingTaskHandler>(CancelPickingTaskHandler);
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
      jest.spyOn(handler['logger'], 'warn').mockImplementation(() => undefined);
    });

    it('should cancel a pending task', async () => {
      const task = {
        taskId: 'T1',
        orderId: 'O1',
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      taskModel.findOne.mockResolvedValue(task);

      const result = await handler.execute(new CancelPickingTaskCommand('O1'));

      expect(task.status).toBe('CANCELLED');
      expect(task.save).toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'Picking task annullato.' });
    });

    it('should return success if no task exists for the order', async () => {
      taskModel.findOne.mockResolvedValue(null);

      const result = await handler.execute(new CancelPickingTaskCommand('O1'));

      expect(result).toEqual({
        success: true,
        message: 'Nessun picking task associato.',
      });
    });

    it('should throw if task is not in PENDING status', async () => {
      taskModel.findOne.mockResolvedValue({
        taskId: 'T1',
        orderId: 'O1',
        status: 'COMPLETED',
      });

      await expect(
        handler.execute(new CancelPickingTaskCommand('O1')),
      ).rejects.toThrow(
        'Impossibile annullare: il task di picking è in stato COMPLETED',
      );
    });
  });

  describe('GetAllTasksHandler', () => {
    let handler: GetAllTasksHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GetAllTasksHandler,
          { provide: getModelToken(PickingTask.name), useValue: taskModel },
        ],
      }).compile();
      handler = module.get<GetAllTasksHandler>(GetAllTasksHandler);
    });

    it('should return all tasks', async () => {
      const tasks = [{ taskId: 'T1', status: 'PENDING' }];
      taskModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(tasks),
      });

      const result = await handler.execute(new GetAllTasksQuery());
      expect(result).toBe(tasks);
    });
  });
});
