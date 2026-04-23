import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../src/app.service';
import { getModelToken } from '@nestjs/mongoose';
import { Inventory } from '../src/schemas/inventory.schema';
import { EventsGateway } from '../src/events.gateway';

describe('AppService', () => {
  let appService: AppService;

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

  const mockEventsGateway = {
    notifyDataChanged: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: 'KAFKA_CLIENT',
          useValue: mockKafkaClient,
        },
        {
          provide: getModelToken(Inventory.name),
          useValue: mockInventoryModel,
        },
        {
          provide: EventsGateway,
          useValue: mockEventsGateway,
        },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to kafka client', async () => {
      await appService.onModuleInit();
      expect(mockKafkaClient.connect).toHaveBeenCalled();
    });
  });

  describe('receiveGoods', () => {
    it('should save inventory, emit event and notify gateway', async () => {
      const mockItem = {
        productId: 'P1',
        quantity: 15,
        reservedQuantity: 0,
        location: 'A1',
      };
      mockInventoryModel.findOneAndUpdate.mockResolvedValue(mockItem);

      const result = await appService.receiveGoods('P1', 15, 'A1');

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

      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toEqual(mockItem);
    });
  });

  describe('getAllInventory', () => {
    it('should return all inventory items', async () => {
      const mockItems = [{ productId: 'P1', quantity: 10, location: 'A1' }];
      mockInventoryModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockItems),
      });

      const result = await appService.getAllInventory();

      expect(mockInventoryModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockItems);
    });
  });

  describe('handleOrderPlaced', () => {
    it('should allocate inventory successfully and emit InventoryAllocated', async () => {
      const payload = {
        orderId: 'O1',
        items: [{ productId: 'P1', quantity: 5 }],
      };

      // Mock findOne (available stock)
      mockInventoryModel.findOne.mockResolvedValueOnce({
        _id: 'id1',
        productId: 'P1',
        location: 'A1',
        quantity: 10,
        reservedQuantity: 0,
      });
      // Mock findOneAndUpdate (reserve item)
      mockInventoryModel.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'id1',
        quantity: 10,
        reservedQuantity: 5,
      });

      await appService.handleOrderPlaced(payload);

      expect(mockInventoryModel.findOne).toHaveBeenCalledWith({
        productId: 'P1',
        $expr: { $gt: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0] },
      });

      expect(mockInventoryModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'id1',
          $expr: {
            $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 5],
          },
        },
        { $inc: { reservedQuantity: 5 } },
        { returnDocument: 'after' },
      );

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('InventoryAllocated', {
        orderId: 'O1',
        allocations: [{ productId: 'P1', quantity: 5, location: 'A1' }],
      });

      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should allocate from multiple locations if required', async () => {
      const payload = {
        orderId: 'O2',
        items: [{ productId: 'P2', quantity: 15 }],
      };

      // Mock findOne loop 1
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

      // Mock findOne loop 2
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

      await appService.handleOrderPlaced(payload);

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('InventoryAllocated', {
        orderId: 'O2',
        allocations: [
          { productId: 'P2', quantity: 10, location: 'A1' },
          { productId: 'P2', quantity: 5, location: 'B1' },
        ],
      });
      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should fail to allocate, rollback partial reservations, and emit OutOfStock', async () => {
      const payload = {
        orderId: 'O3',
        items: [{ productId: 'P3', quantity: 10 }],
      };

      // Only 5 available in total
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
      // Next iteration finds no stock
      mockInventoryModel.findOne.mockResolvedValueOnce(null);

      await appService.handleOrderPlaced(payload);

      // Verify rollback for the partial location A1
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
      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
    });
  });

  describe('handleOrderCancelled', () => {
    it('should release reserved allocations and notify gateway', async () => {
      const payload = {
        orderId: 'O4',
        previousStatus: 'ALLOCATED',
        allocations: [
          { productId: 'P1', quantity: 5, location: 'A1' },
          { productId: 'P2', quantity: 2, location: 'B1' },
        ],
      };

      await appService.handleOrderCancelled(payload);

      expect(mockInventoryModel.updateOne).toHaveBeenCalledWith(
        { productId: 'P1', location: 'A1' },
        { $inc: { reservedQuantity: -5 } },
      );

      expect(mockInventoryModel.updateOne).toHaveBeenCalledWith(
        { productId: 'P2', location: 'B1' },
        { $inc: { reservedQuantity: -2 } },
      );

      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if no allocations are provided', async () => {
      const payload = {
        orderId: 'O5',
        previousStatus: 'PENDING',
        allocations: [],
      };

      await appService.handleOrderCancelled(payload);

      expect(mockInventoryModel.updateOne).not.toHaveBeenCalled();
      expect(mockEventsGateway.notifyDataChanged).toHaveBeenCalled();
    });
  });
});
