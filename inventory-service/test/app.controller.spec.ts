import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReceiveGoodsCommand } from '../src/commands/receive-goods.command';
import { HandleOrderPlacedCommand } from '../src/commands/handle-order-placed.command';
import { HandleOrderCancelledCommand } from '../src/commands/handle-order-cancelled.command';
import { GetAllInventoryQuery } from '../src/queries/get-all-inventory.query';

describe('AppController', () => {
  let appController: AppController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;
  let kafkaClient: any;

  beforeEach(async () => {
    commandBus = { execute: jest.fn() } as any;
    queryBus = { execute: jest.fn() } as any;
    kafkaClient = { connect: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
        { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  describe('onModuleInit', () => {
    it('should connect to kafka client', async () => {
      await appController.onModuleInit();
      expect(kafkaClient.connect).toHaveBeenCalled();
    });
  });

  describe('REST Endpoints', () => {
    describe('POST /inventory/receive', () => {
      it('should execute ReceiveGoodsCommand', async () => {
        const body = { productId: 'P1', quantity: 10, location: 'A1' };
        const mockResult = {
          productId: 'P1',
          quantity: 10,
          location: 'A1',
          reservedQuantity: 0,
        };
        commandBus.execute.mockResolvedValue(mockResult);

        const result = await appController.receiveGoods(body);

        expect(commandBus.execute).toHaveBeenCalledWith(
          new ReceiveGoodsCommand('P1', 10, 'A1'),
        );
        expect(result).toEqual(mockResult);
      });
    });

    describe('GET /inventory', () => {
      it('should execute GetAllInventoryQuery', async () => {
        const mockInventory = [
          { productId: 'P1', quantity: 10, location: 'A1', reservedQuantity: 0 },
        ];
        queryBus.execute.mockResolvedValue(mockInventory);

        const result = await appController.getInventory();

        expect(queryBus.execute).toHaveBeenCalledWith(new GetAllInventoryQuery());
        expect(result).toEqual(mockInventory);
      });
    });

    describe('GET /inventory/health', () => {
      it('should return health status', () => {
        expect(appController.getHealth()).toEqual({
          status: 'ok',
          service: 'inventory',
        });
      });
    });
  });

  describe('Kafka Event Handlers', () => {
    describe('OrderPlaced', () => {
      it('should execute HandleOrderPlacedCommand if message is valid', async () => {
        const message = {
          orderId: 'O1',
          items: [{ productId: 'P1', quantity: 5 }],
        };
        await appController.handleOrderPlaced(message);
        expect(commandBus.execute).toHaveBeenCalledWith(
          new HandleOrderPlacedCommand('O1', message.items),
        );
      });

      it('should not execute command if message is invalid', async () => {
        await appController.handleOrderPlaced(null);
        expect(commandBus.execute).not.toHaveBeenCalled();

        await appController.handleOrderPlaced({});
        expect(commandBus.execute).not.toHaveBeenCalled();
      });
    });

    describe('OrderCancelled', () => {
      it('should execute HandleOrderCancelledCommand if message is valid', async () => {
        const message = {
          orderId: 'O1',
          previousStatus: 'ALLOCATED',
          allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
        };
        await appController.handleOrderCancelled(message);
        expect(commandBus.execute).toHaveBeenCalledWith(
          new HandleOrderCancelledCommand('O1', 'ALLOCATED', message.allocations),
        );
      });

      it('should not execute command if message is invalid', async () => {
        await appController.handleOrderCancelled(null);
        expect(commandBus.execute).not.toHaveBeenCalled();

        await appController.handleOrderCancelled({});
        expect(commandBus.execute).not.toHaveBeenCalled();
      });
    });
  });
});
