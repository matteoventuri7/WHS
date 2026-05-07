import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Order } from '../src/schemas/order.schema';
import { EventsGateway } from '../src/events.gateway';
import { PlaceOrderHandler } from '../src/commands/place-order.handler';
import { CancelOrderHandler } from '../src/commands/cancel-order.handler';
import { ResumeOrderHandler } from '../src/commands/resume-order.handler';
import { HandleInventoryAllocatedHandler } from '../src/commands/handle-inventory-allocated.handler';
import { HandleOutOfStockHandler } from '../src/commands/handle-out-of-stock.handler';
import { HandleItemStoredHandler } from '../src/commands/handle-item-stored.handler';
import { HandleShipmentAssignedHandler } from '../src/commands/handle-shipment-assigned.handler';
import { HandlePickingCompletedHandler } from '../src/commands/handle-picking-completed.handler';
import { GetAllOrdersHandler } from '../src/queries/get-all-orders.handler';
import { PlaceOrderCommand } from '../src/commands/place-order.command';
import { CancelOrderCommand } from '../src/commands/cancel-order.command';
import { ResumeOrderCommand } from '../src/commands/resume-order.command';
import { HandleInventoryAllocatedCommand } from '../src/commands/handle-inventory-allocated.command';
import { HandleOutOfStockCommand } from '../src/commands/handle-out-of-stock.command';
import { HandleItemStoredCommand } from '../src/commands/handle-item-stored.command';
import { HandleShipmentAssignedCommand } from '../src/commands/handle-shipment-assigned.command';
import { HandlePickingCompletedCommand } from '../src/commands/handle-picking-completed.command';
import { GetAllOrdersQuery } from '../src/queries/get-all-orders.query';

describe('Order Command & Query Handlers', () => {
  let kafkaClient: any;
  let orderModel: any;
  let eventsGateway: any;

  beforeEach(() => {
    kafkaClient = { emit: jest.fn() };
    eventsGateway = { notifyDataChanged: jest.fn() };
    orderModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      orderId: 'O1',
      save: jest.fn().mockResolvedValue(true),
    }));
    orderModel.find = jest.fn();
    orderModel.findOne = jest.fn();
  });

  describe('PlaceOrderHandler', () => {
    let handler: PlaceOrderHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PlaceOrderHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<PlaceOrderHandler>(PlaceOrderHandler);
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should place a new order and emit OrderPlaced event', async () => {
      const items = [{ productId: 'p1', quantity: 10 }];
      const result = await handler.execute(new PlaceOrderCommand(items));

      expect(result.status).toBe('PENDING');
      expect(result.items).toEqual(items);
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: 'O1',
        items,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should not emit OrderPlaced if order is not created properly', async () => {
      const originalImpl = orderModel.prototype;
      orderModel.mockImplementationOnce(() => undefined);
      
      const items = [{ productId: 'p1', quantity: 10 }];
      try {
        await handler.execute(new PlaceOrderCommand(items));
      } catch (e) {
        // expect throw or graceful fail depending on handler
      }
      expect(kafkaClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('CancelOrderHandler', () => {
    let handler: CancelOrderHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CancelOrderHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<CancelOrderHandler>(CancelOrderHandler);
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should throw Error if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await expect(
        handler.execute(new CancelOrderCommand('O1')),
      ).rejects.toThrow('Order O1 not found');
    });

    it('should throw Error if order is shipped', async () => {
      orderModel.findOne.mockResolvedValue({
        orderId: 'O1',
        status: 'SHIPPED',
      });
      await expect(
        handler.execute(new CancelOrderCommand('O1')),
      ).rejects.toThrow('Cannot cancel a shipped order');
    });

    it('should throw Error if picking task is already completed', async () => {
      orderModel.findOne.mockResolvedValue({
        orderId: 'O1',
        status: 'PICKING_COMPLETED',
      });
      await expect(
        handler.execute(new CancelOrderCommand('O1')),
      ).rejects.toThrow('Cannot cancel an order with completed picking task');
    });

    it('should return order immediately if already cancelled', async () => {
      const order = { orderId: 'O1', status: 'CANCELLED' };
      orderModel.findOne.mockResolvedValue(order);
      const result = await handler.execute(new CancelOrderCommand('O1'));
      expect(result).toBe(order);
    });

    it('should cancel pending order and emit OrderCancelled event', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        allocations: [],
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      const result = await handler.execute(new CancelOrderCommand('O1'));

      expect(order.status).toBe('CANCELLED');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderCancelled', {
        orderId: 'O1',
        previousStatus: 'PENDING',
        allocations: [],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(order);
    });

    it('should emit CancelPickingTask if order is ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        allocations: [],
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new CancelOrderCommand('O1'));

      expect(kafkaClient.emit).toHaveBeenCalledWith('CancelPickingTask', {
        orderId: 'O1',
      });
      expect(order.status).toBe('CANCELLED');
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderCancelled', {
        orderId: 'O1',
        previousStatus: 'ALLOCATED',
        allocations: [],
      });
    });
  });

  describe('ResumeOrderHandler', () => {
    let handler: ResumeOrderHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ResumeOrderHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<ResumeOrderHandler>(ResumeOrderHandler);
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should throw Error if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await expect(
        handler.execute(new ResumeOrderCommand('O1')),
      ).rejects.toThrow('Order O1 not found');
    });

    it('should throw Error if order is not suspended', async () => {
      orderModel.findOne.mockResolvedValue({ orderId: 'O1', status: 'PENDING' });
      await expect(
        handler.execute(new ResumeOrderCommand('O1')),
      ).rejects.toThrow('Can only resume suspended orders');
    });

    it('should resume order and emit OrderPlaced event', async () => {
      const order = {
        orderId: 'O1',
        status: 'SUSPENDED',
        items: [{ productId: 'p1', quantity: 1 }],
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      const result = await handler.execute(new ResumeOrderCommand('O1'));

      expect(order.status).toBe('PENDING');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: 'O1',
        items: order.items,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(order);
    });
  });

  describe('HandleInventoryAllocatedHandler', () => {
    let handler: HandleInventoryAllocatedHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleInventoryAllocatedHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<HandleInventoryAllocatedHandler>(
        HandleInventoryAllocatedHandler,
      );
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should update order status to ALLOCATED and emit OrderReadyForPicking', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        allocations: [],
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(
        new HandleInventoryAllocatedCommand('O1', ['a1']),
      );

      expect(order.status).toBe('ALLOCATED');
      expect(order.allocations).toEqual(['a1']);
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderReadyForPicking', {
        orderId: 'O1',
        allocations: ['a1'],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is already ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        save: jest.fn(),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(
        new HandleInventoryAllocatedCommand('O1', ['a1']),
      );

      expect(order.save).not.toHaveBeenCalled();
    });
  });

  describe('HandleOutOfStockHandler', () => {
    let handler: HandleOutOfStockHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleOutOfStockHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<HandleOutOfStockHandler>(HandleOutOfStockHandler);
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should update order status to SUSPENDED and emit OrderSuspended', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new HandleOutOfStockCommand('O1'));

      expect(order.status).toBe('SUSPENDED');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderSuspended', {
        orderId: 'O1',
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is already SUSPENDED', async () => {
      const order = {
        orderId: 'O1',
        status: 'SUSPENDED',
        save: jest.fn(),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new HandleOutOfStockCommand('O1'));

      expect(order.save).not.toHaveBeenCalled();
    });
  });

  describe('HandleItemStoredHandler', () => {
    let handler: HandleItemStoredHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleItemStoredHandler,
          { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
          { provide: getModelToken(Order.name), useValue: orderModel },
        ],
      }).compile();
      handler = module.get<HandleItemStoredHandler>(HandleItemStoredHandler);
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should re-emit OrderPlaced for all suspended orders', async () => {
      const order1 = {
        orderId: 'O1',
        items: [{ productId: 'p1', quantity: 1 }],
        status: 'SUSPENDED',
      };
      const order2 = {
        orderId: 'O2',
        items: [{ productId: 'p2', quantity: 2 }],
        status: 'SUSPENDED',
      };

      const findResult = {
        sort: jest.fn().mockResolvedValue([order1, order2]),
      };
      orderModel.find.mockReturnValue(findResult);

      await handler.execute(new HandleItemStoredCommand());

      expect(orderModel.find).toHaveBeenCalledWith({ status: 'SUSPENDED' });
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: order1.orderId,
        items: order1.items,
      });
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: order2.orderId,
        items: order2.items,
      });
    });
  });

  describe('HandleShipmentAssignedHandler', () => {
    let handler: HandleShipmentAssignedHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleShipmentAssignedHandler,
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<HandleShipmentAssignedHandler>(
        HandleShipmentAssignedHandler,
      );
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should update order status to SHIPPED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new HandleShipmentAssignedCommand('O1'));

      expect(order.status).toBe('SHIPPED');
      expect(order.save).toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await handler.execute(new HandleShipmentAssignedCommand('O1'));
    });
  });

  describe('HandlePickingCompletedHandler', () => {
    let handler: HandlePickingCompletedHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandlePickingCompletedHandler,
          { provide: getModelToken(Order.name), useValue: orderModel },
          { provide: EventsGateway, useValue: eventsGateway },
        ],
      }).compile();
      handler = module.get<HandlePickingCompletedHandler>(
        HandlePickingCompletedHandler,
      );
      jest
        .spyOn(handler['logger'], 'log')
        .mockImplementation(() => undefined);
    });

    it('should update order status to PICKING_COMPLETED when order is ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new HandlePickingCompletedCommand('O1'));

      expect(order.status).toBe('PICKING_COMPLETED');
      expect(order.save).toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await handler.execute(new HandlePickingCompletedCommand('O1'));
      expect(eventsGateway.notifyDataChanged).not.toHaveBeenCalled();
    });

    it('should ignore event if order is not ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'CANCELLED',
        save: jest.fn().mockResolvedValue(true),
      };
      orderModel.findOne.mockResolvedValue(order);

      await handler.execute(new HandlePickingCompletedCommand('O1'));

      expect(order.status).toBe('CANCELLED');
      expect(order.save).not.toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).not.toHaveBeenCalled();
    });
  });

  describe('GetAllOrdersHandler', () => {
    let handler: GetAllOrdersHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GetAllOrdersHandler,
          { provide: getModelToken(Order.name), useValue: orderModel },
        ],
      }).compile();
      handler = module.get<GetAllOrdersHandler>(GetAllOrdersHandler);
    });

    it('should return all orders', async () => {
      const orders = [{ orderId: 'O1', status: 'PENDING' }];
      orderModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(orders),
      });

      const result = await handler.execute(new GetAllOrdersQuery());
      expect(result).toBe(orders);
      expect(orderModel.find).toHaveBeenCalled();
    });
  });
});
