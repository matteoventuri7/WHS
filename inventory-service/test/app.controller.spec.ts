import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      receiveGoods: jest.fn(),
      getAllInventory: jest.fn(),
      handleOrderPlaced: jest.fn(),
      handleOrderCancelled: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('REST Endpoints', () => {
    describe('POST /inventory/receive', () => {
      it('should call appService.receiveGoods with correct parameters', async () => {
        const body = { productId: 'P1', quantity: 10, location: 'A1' };
        const mockResult = { productId: 'P1', quantity: 10, location: 'A1', reservedQuantity: 0 };
        jest.spyOn(appService, 'receiveGoods').mockResolvedValue(mockResult as any);

        const result = await appController.receiveGoods(body);

        expect(appService.receiveGoods).toHaveBeenCalledWith('P1', 10, 'A1');
        expect(result).toEqual(mockResult);
      });
    });

    describe('GET /inventory', () => {
      it('should call appService.getAllInventory', async () => {
        const mockInventory = [{ productId: 'P1', quantity: 10, location: 'A1', reservedQuantity: 0 }];
        jest.spyOn(appService, 'getAllInventory').mockResolvedValue(mockInventory as any);

        const result = await appController.getInventory();

        expect(appService.getAllInventory).toHaveBeenCalled();
        expect(result).toEqual(mockInventory);
      });
    });

    describe('GET /inventory/health', () => {
      it('should return health status', () => {
        const expectedResult = { status: 'ok', service: 'inventory' };
        expect(appController.getHealth()).toEqual(expectedResult);
      });
    });
  });

  describe('Kafka Event Handlers', () => {
    describe('OrderPlaced', () => {
      it('should call handleOrderPlaced on appService if message is valid', async () => {
        const message = { orderId: 'O1', items: [{ productId: 'P1', quantity: 5 }] };
        await appController.handleOrderPlaced(message);
        expect(appService.handleOrderPlaced).toHaveBeenCalledWith(message);
      });

      it('should not call handleOrderPlaced if message is invalid', async () => {
        await appController.handleOrderPlaced(null);
        expect(appService.handleOrderPlaced).not.toHaveBeenCalled();

        await appController.handleOrderPlaced({});
        expect(appService.handleOrderPlaced).not.toHaveBeenCalled();
      });
    });

    describe('OrderCancelled', () => {
      it('should call handleOrderCancelled on appService if message is valid', async () => {
        const message = { orderId: 'O1', previousStatus: 'ALLOCATED' };
        await appController.handleOrderCancelled(message);
        expect(appService.handleOrderCancelled).toHaveBeenCalledWith(message);
      });

      it('should not call handleOrderCancelled if message is invalid', async () => {
        await appController.handleOrderCancelled(null);
        expect(appService.handleOrderCancelled).not.toHaveBeenCalled();

        await appController.handleOrderCancelled({});
        expect(appService.handleOrderCancelled).not.toHaveBeenCalled();
      });
    });

    describe('GoodsArriving', () => {
      it('should call receiveGoods on appService if message is valid', async () => {
        const message = { productId: 'P1', quantity: 20, location: 'B2' };
        await appController.handleGoodsArriving(message);
        expect(appService.receiveGoods).toHaveBeenCalledWith('P1', 20, 'B2');
      });

      it('should not call receiveGoods if payload is incomplete', async () => {
        await appController.handleGoodsArriving(null as any);
        expect(appService.receiveGoods).not.toHaveBeenCalled();

        await appController.handleGoodsArriving({ productId: 'P1', quantity: 10 } as any); // Missing location
        expect(appService.receiveGoods).not.toHaveBeenCalled();
      });
    });
  });
});
