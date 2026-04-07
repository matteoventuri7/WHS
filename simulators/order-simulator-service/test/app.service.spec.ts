import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AppService } from '../src/app.service';
import { of, throwError } from 'rxjs';

describe('AppService', () => {
  let service: AppService;

  const mockKafkaClient = {
    emit: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
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
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);

    // Silence logger output in tests while preserving call assertions.
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopSimulation();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should log initialization message', async () => {
      const loggerSpy = service['logger'].log as jest.Mock;
      await service.onModuleInit();
      expect(loggerSpy).toHaveBeenCalledWith('Order simulator inizializzato.');
    });
  });

  describe('getStatus', () => {
    it('should return default status', () => {
      expect(service.getStatus()).toEqual({ isSimulating: false, intervalMs: null });
    });
  });

  describe('startSimulation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start simulation and set interval', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ productId: 'PROD-001', quantity: 100, reservedQuantity: 10 }] }));
      mockHttpService.post.mockReturnValue(of({ data: { orderId: '1' } }));

      const result = service.startSimulation(10000);
      await Promise.resolve();

      expect(result).toEqual({ message: 'Order simulation started', isSimulating: true, intervalMs: 10000 });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 });
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
    });

    it('should not start if already simulating', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ productId: 'PROD-001', quantity: 20, reservedQuantity: 0 }] }));
      mockHttpService.post.mockReturnValue(of({ data: { orderId: '1' } }));
      service.startSimulation(10000);

      const result = service.startSimulation(20000);

      expect(result).toEqual({ message: 'Simulation is already running', isSimulating: true });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 });
    });
  });

  describe('stopSimulation', () => {
    it('should stop running simulation', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ productId: 'PROD-001', quantity: 20, reservedQuantity: 0 }] }));
      mockHttpService.post.mockReturnValue(of({ data: { orderId: '1' } }));
      service.startSimulation(10000);

      const result = service.stopSimulation();

      expect(result).toEqual({ message: 'Order simulation stopped', isSimulating: false });
      expect(service.getStatus()).toEqual({ isSimulating: false, intervalMs: null });
    });

    it('should do nothing if not simulating', () => {
      const result = service.stopSimulation();
      
      expect(result).toEqual({ message: 'Simulation is not currently running' });
    });
  });

  describe('simulateOrder', () => {
    it('should create order for a random product among top available 5', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const inventory = [
        { productId: 'PROD-001', quantity: 100, reservedQuantity: 10 },
        { productId: 'PROD-001', quantity: 50, reservedQuantity: 0 },
        { productId: 'PROD-002', quantity: 40, reservedQuantity: 0 },
        { productId: 'PROD-003', quantity: 30, reservedQuantity: 0 },
      ];

      mockHttpService.get.mockReturnValue(of({ data: inventory }));
      mockHttpService.post.mockReturnValue(of({ data: { orderId: 'generated-order' } }));

      await service['simulateOrder']();

      expect(mockHttpService.get).toHaveBeenCalledWith('http://localhost:3001/inventory');
      expect(mockHttpService.post).toHaveBeenCalledWith('http://localhost:3002/orders', {
        items: [{ productId: 'PROD-001', quantity: 1 }],
      });
    });

    it('should log warning if inventory-service returns invalid data', async () => {
      const loggerSpy = service['logger'].warn as jest.Mock;
      mockHttpService.get.mockReturnValue(of({ data: null }));

      await service['simulateOrder']();

      expect(loggerSpy).toHaveBeenCalledWith('Formato risposta non valido da inventory-service');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should skip order generation if no products are available', async () => {
      const loggerSpy = service['logger'].log as jest.Mock;
      mockHttpService.get.mockReturnValue(of({ data: [{ productId: 'PROD-001', quantity: 10, reservedQuantity: 10 }] }));

      await service['simulateOrder']();

      expect(loggerSpy).toHaveBeenCalledWith('Nessun prodotto disponibile: ordine non generato.');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if inventory-service get request fails', async () => {
      const loggerSpy = service['logger'].error as jest.Mock;
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Connection refused')));

      await service['simulateOrder']();

      expect(loggerSpy).toHaveBeenCalledWith('Impossibile contattare inventory-service: Connection refused');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if order creation fails', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ productId: 'PROD-001', quantity: 20, reservedQuantity: 0 }] }));
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Order endpoint down')));
      const loggerSpy = service['logger'].error as jest.Mock;

      await service['simulateOrder']();

      expect(loggerSpy).toHaveBeenCalledWith('Errore durante la creazione ordine: Order endpoint down');
    });
  });
});
