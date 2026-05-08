import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Inventory } from '../src/schemas/inventory.schema';
import { ReceiveGoodsHandler } from '../src/commands/receive-goods.handler';
import { HandleOrderPlacedHandler } from '../src/commands/handle-order-placed.handler';
import { HandleOrderCancelledHandler } from '../src/commands/handle-order-cancelled.handler';
import { GetAllInventoryHandler } from '../src/queries/get-all-inventory.handler';
import { ReceiveGoodsCommand } from '../src/commands/receive-goods.command';
import { HandleOrderPlacedCommand } from '../src/commands/handle-order-placed.command';
import { HandleOrderCancelledCommand } from '../src/commands/handle-order-cancelled.command';
import { GetAllInventoryQuery } from '../src/queries/get-all-inventory.query';

describe('Inventory Command & Query Handlers', () => {
  const mockKafkaClient = {
    connect: jest.fn(),
    emit: jest.fn(),
  };

  const mockInventoryModel = {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ReceiveGoodsHandler', () => {
    let handler: ReceiveGoodsHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReceiveGoodsHandler,
          { provide: 'KAFKA_CLIENT', useValue: mockKafkaClient },
          { provide: getModelToken(Inventory.name), useValue: mockInventoryModel },
        ],
      }).compile();
      handler = module.get<ReceiveGoodsHandler>(ReceiveGoodsHandler);
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
    });

    it('should save inventory, emit event and notify gateway', async () => {
      const mockItem = {
        productId: 'P1',
        quantity: 15,
        reservedQuantity: 0,
        location: 'A1',
      };
      mockInventoryModel.findOneAndUpdate.mockResolvedValue(mockItem);

      const result = await handler.execute(
        new ReceiveGoodsCommand('P1', 15, 'A1'),
      );

      expect(mockInventoryModel.findOneAndUpdate).toHaveBeenCalledWith(
        { productId: 'P1', location: 'A1' },
        { $inc: { quantity: 15 }, $setOnInsert: { reservedQuantity: 0 } },
        { returnDocument: 'after', upsert: true },
      );

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('ItemStored', {
        productId: 'P1',
        location: 'A1',
        addedQuantity: 15,
        totalQuantity: mockItem.quantity,
      });

      expect(result).toEqual(mockItem);
    });
  });

  describe('HandleOrderPlacedHandler', () => {
    let handler: HandleOrderPlacedHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleOrderPlacedHandler,
          { provide: 'KAFKA_CLIENT', useValue: mockKafkaClient },
          { provide: getModelToken(Inventory.name), useValue: mockInventoryModel },
        ],
      }).compile();
      handler = module.get<HandleOrderPlacedHandler>(HandleOrderPlacedHandler);
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
      jest.spyOn(handler['logger'], 'warn').mockImplementation(() => undefined);
    });

    it('should allocate inventory successfully and emit InventoryAllocated', async () => {
      mockInventoryModel.findOne.mockResolvedValueOnce({
        _id: 'id1',
        productId: 'P1',
        location: 'A1',
        quantity: 10,
        reservedQuantity: 0,
      });
      mockInventoryModel.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'id1',
        quantity: 10,
        reservedQuantity: 5,
      });

      await handler.execute(
        new HandleOrderPlacedCommand('O1', [{ productId: 'P1', quantity: 5 }]),
      );

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('InventoryAllocated', {
        orderId: 'O1',
        allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
      });
    });

    it('should allocate from multiple locations if required', async () => {
      mockInventoryModel.findOne.mockResolvedValueOnce({
        _id: 'loc1',
        productId: 'P2',
        location: 'A1',
        quantity: 10,
        reservedQuantity: 0,
      });
      mockInventoryModel.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'loc1',
        quantity: 10,
        reservedQuantity: 10,
      });
      mockInventoryModel.findOne.mockResolvedValueOnce({
        _id: 'loc2',
        productId: 'P2',
        location: 'B1',
        quantity: 10,
        reservedQuantity: 0,
      });
      mockInventoryModel.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'loc2',
        quantity: 10,
        reservedQuantity: 5,
      });

      await handler.execute(
        new HandleOrderPlacedCommand('O2', [{ productId: 'P2', quantity: 15 }]),
      );

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('InventoryAllocated', {
        orderId: 'O2',
        allocations: [
          { productId: 'P2', quantity: 10, location: 'A1' },
          { productId: 'P2', quantity: 5, location: 'B1' },
        ],
      });
    });

    it('should fail to allocate, rollback and emit OutOfStock', async () => {
      mockInventoryModel.findOne.mockResolvedValueOnce({
        _id: 'id1',
        productId: 'P3',
        location: 'A1',
        quantity: 5,
        reservedQuantity: 0,
      });
      mockInventoryModel.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'id1',
        quantity: 5,
        reservedQuantity: 5,
      });
      mockInventoryModel.findOne.mockResolvedValueOnce(null);

      await handler.execute(
        new HandleOrderPlacedCommand('O3', [{ productId: 'P3', quantity: 10 }]),
      );

      expect(mockInventoryModel.updateOne).toHaveBeenCalledWith(
        { productId: 'P3', location: 'A1' },
        { $inc: { reservedQuantity: -5 } },
      );
      expect(mockKafkaClient.emit).toHaveBeenCalledWith('OutOfStock', {
        orderId: 'O3',
      });
      expect(mockKafkaClient.emit).not.toHaveBeenCalledWith(
        'InventoryAllocated',
        expect.any(Object),
      );
    });
  });

  describe('HandleOrderCancelledHandler', () => {
    let handler: HandleOrderCancelledHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HandleOrderCancelledHandler,
          { provide: getModelToken(Inventory.name), useValue: mockInventoryModel },
        ],
      }).compile();
      handler = module.get<HandleOrderCancelledHandler>(
        HandleOrderCancelledHandler,
      );
      jest.spyOn(handler['logger'], 'log').mockImplementation(() => undefined);
    });

    it('should release reserved allocations and notify gateway', async () => {
      await handler.execute(
        new HandleOrderCancelledCommand('O4', 'ALLOCATED', [
          { productId: 'P1', quantity: 5, location: 'A1' },
          { productId: 'P2', quantity: 2, location: 'B1' },
        ]),
      );

      expect(mockInventoryModel.updateOne).toHaveBeenCalledWith(
        { productId: 'P1', location: 'A1' },
        { $inc: { reservedQuantity: -5 } },
      );
      expect(mockInventoryModel.updateOne).toHaveBeenCalledWith(
        { productId: 'P2', location: 'B1' },
        { $inc: { reservedQuantity: -2 } },
      );
    });

    it('should do nothing if no allocations are provided', async () => {
      await handler.execute(
        new HandleOrderCancelledCommand('O5', 'PENDING', []),
      );

      expect(mockInventoryModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('GetAllInventoryHandler', () => {
    let handler: GetAllInventoryHandler;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GetAllInventoryHandler,
          { provide: getModelToken(Inventory.name), useValue: mockInventoryModel },
        ],
      }).compile();
      handler = module.get<GetAllInventoryHandler>(GetAllInventoryHandler);
    });

    it('should return all inventory items', async () => {
      const mockItems = [{ productId: 'P1', quantity: 10, location: 'A1' }];
      mockInventoryModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockItems),
      });

      const result = await handler.execute(new GetAllInventoryQuery());

      expect(mockInventoryModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockItems);
    });
  });
});
