import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AppService } from '../src/app.service';
import { of, throwError } from 'rxjs';

describe('AppService', () => {
  let service: AppService;
  let httpService: HttpService;

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
    httpService = module.get<HttpService>(HttpService);
    
    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Ensure simulation is stopped after each test to prevent open handles
    service.stopSimulation();
  });

  describe('onModuleInit', () => {
    it('should log initialization message', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      await service.onModuleInit();
      expect(loggerSpy).toHaveBeenCalledWith('Connessione Kafka Producer (Dispatch) inizializzata.');
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

    it('should start simulation and set interval', () => {
      mockHttpService.get.mockReturnValue(of({ data: [] })); // mock first dispatch call

      const result = service.startSimulation(10000);

      expect(result).toEqual({ message: 'Dispatch simulation started', isSimulating: true, intervalMs: 10000 });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 });
      expect(mockHttpService.get).toHaveBeenCalledTimes(1); // called immediately
      
      // Advance time by interval
      jest.advanceTimersByTime(10000);
      expect(mockHttpService.get).toHaveBeenCalledTimes(2); // called again after interval
    });

    it('should not start if already simulating', () => {
      mockHttpService.get.mockReturnValue(of({ data: [] }));
      service.startSimulation(10000);
      
      const result = service.startSimulation(20000);
      
      expect(result).toEqual({ message: 'Simulation is already running', isSimulating: true });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 }); // unchanged
    });
  });

  describe('stopSimulation', () => {
    it('should stop running simulation', () => {
      mockHttpService.get.mockReturnValue(of({ data: [] }));
      service.startSimulation(10000);
      
      const result = service.stopSimulation();
      
      expect(result).toEqual({ message: 'Dispatch simulation stopped', isSimulating: false });
      expect(service.getStatus()).toEqual({ isSimulating: false, intervalMs: null });
    });

    it('should do nothing if not simulating', () => {
      const result = service.stopSimulation();
      
      expect(result).toEqual({ message: 'Simulation is not currently running' });
    });
  });

  describe('simulateDispatch', () => {
    it('should dispatch the vehicle with highest load if multiple are available', async () => {
      const vehicles = [
        { vehicleId: 'V1', status: 'AVAILABLE', currentLoad: 50, maxCapacity: 100, assignedTaskIds: ['T1'] },
        { vehicleId: 'V2', status: 'IN_TRANSIT', currentLoad: 100, maxCapacity: 100, assignedTaskIds: ['T2'] },
        { vehicleId: 'V3', status: 'AVAILABLE', currentLoad: 80, maxCapacity: 100, assignedTaskIds: ['T3'] },
        { vehicleId: 'V4', status: 'AVAILABLE', currentLoad: 0, maxCapacity: 100, assignedTaskIds: [] },
      ];
      
      mockHttpService.get.mockReturnValue(of({ data: vehicles }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));

      await service['simulateDispatch']();

      expect(mockHttpService.get).toHaveBeenCalledWith('http://localhost:3004/shipping/vehicles');
      // Should pick V3 because its load (80) > V1 load (50) and V2 is not AVAILABLE
      expect(mockHttpService.post).toHaveBeenCalledWith('http://localhost:3004/shipping/vehicles/V3/dispatch');
    });

    it('should log warning if shipping-service returns invalid data', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      mockHttpService.get.mockReturnValue(of({ data: null }));

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith('Formato risposta non valido da shipping-service');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log if no vehicles are ready', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      mockHttpService.get.mockReturnValue(of({ data: [{ vehicleId: 'V1', status: 'AVAILABLE', currentLoad: 0, assignedTaskIds: [] }] }));

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Nessun veicolo pronto per la partenza'));
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if shipping-service get request fails', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Connection refused')));

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith('Impossibile contattare shipping-service: Connection refused');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if shipping-service dispatch post request fails', async () => {
      const vehicles = [
        { vehicleId: 'V1', status: 'AVAILABLE', currentLoad: 50, maxCapacity: 100, assignedTaskIds: ['T1'] },
      ];
      mockHttpService.get.mockReturnValue(of({ data: vehicles }));
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Dispatch failed')));
      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith('Errore durante il dispatch del veicolo V1: Dispatch failed');
    });
  });
});
