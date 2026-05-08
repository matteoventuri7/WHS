import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AppService } from '../src/app.service';
import { of, throwError } from 'rxjs';

describe('AppService', () => {
  let service: AppService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  let mathRandomSpy: jest.SpyInstance;

  beforeEach(async () => {
    mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    httpService = module.get<HttpService>(HttpService);

    // Silence logger output in tests while preserving call assertions.
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Ensure simulation is stopped after each test to prevent open handles
    service.stopSimulation();
    mathRandomSpy.mockRestore();
  });

  describe('getStatus', () => {
    it('should return default status', () => {
      expect(service.getStatus()).toEqual({
        isSimulating: false,
        intervalMs: null,
      });
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

      expect(result).toEqual({
        message: 'Dispatch simulation started',
        isSimulating: true,
        intervalMs: 10000,
      });
      expect(service.getStatus()).toEqual({
        isSimulating: true,
        intervalMs: 10000,
      });
      expect(mockHttpService.get).toHaveBeenCalledTimes(1); // called immediately

      // Advance time by interval
      jest.advanceTimersByTime(10000);
      expect(mockHttpService.get).toHaveBeenCalledTimes(2); // called again after interval
    });

    it('should not start if already simulating', () => {
      mockHttpService.get.mockReturnValue(of({ data: [] }));
      service.startSimulation(10000);

      const result = service.startSimulation(20000);

      expect(result).toEqual({
        message: 'Simulation is already running',
        isSimulating: true,
      });
      expect(service.getStatus()).toEqual({
        isSimulating: true,
        intervalMs: 10000,
      }); // unchanged
    });
  });

  describe('stopSimulation', () => {
    it('should stop running simulation', () => {
      mockHttpService.get.mockReturnValue(of({ data: [] }));
      service.startSimulation(10000);

      const result = service.stopSimulation();

      expect(result).toEqual({
        message: 'Dispatch simulation stopped',
        isSimulating: false,
      });
      expect(service.getStatus()).toEqual({
        isSimulating: false,
        intervalMs: null,
      });
    });

    it('should do nothing if not simulating', () => {
      const result = service.stopSimulation();

      expect(result).toEqual({
        message: 'Simulation is not currently running',
      });
    });
  });

  describe('simulateDispatch', () => {
    it('should dispatch the vehicle with highest load if multiple are available', async () => {
      const vehicles = [
        {
          vehicleId: 'V1',
          status: 'AVAILABLE',
          currentLoad: 50,
          maxCapacity: 100,
          assignedTaskIds: ['T1'],
        },
        {
          vehicleId: 'V2',
          status: 'IN_TRANSIT',
          currentLoad: 100,
          maxCapacity: 100,
          assignedTaskIds: ['T2'],
        },
        {
          vehicleId: 'V3',
          status: 'AVAILABLE',
          currentLoad: 80,
          maxCapacity: 100,
          assignedTaskIds: ['T3'],
        },
        {
          vehicleId: 'V4',
          status: 'AVAILABLE',
          currentLoad: 0,
          maxCapacity: 100,
          assignedTaskIds: [],
        },
      ];

      mockHttpService.get.mockReturnValue(of({ data: vehicles }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));

      await service['simulateDispatch']();

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://localhost:3004/shipping/vehicles',
      );
      // Should pick V3 because its load (80) > V1 load (50) and V2 is not AVAILABLE
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:3004/shipping/vehicles/V3/dispatch',
      );
    });

    it('should log warning if shipping-service returns invalid data', async () => {
      const loggerSpy = service['logger'].warn as jest.Mock;
      mockHttpService.get.mockReturnValue(of({ data: null }));

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Invalid response format from shipping-service',
      );
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log if no vehicles are ready', async () => {
      const loggerSpy = service['logger'].log as jest.Mock;
      mockHttpService.get.mockReturnValue(
        of({
          data: [
            {
              vehicleId: 'V1',
              status: 'AVAILABLE',
              currentLoad: 0,
              assignedTaskIds: [],
            },
          ],
        }),
      );

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('No vehicles ready for dispatch'),
      );
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if shipping-service get request fails', async () => {
      const loggerSpy = service['logger'].error as jest.Mock;
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Unable to contact shipping-service: Connection refused',
      );
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if shipping-service dispatch post request fails', async () => {
      const vehicles = [
        {
          vehicleId: 'V1',
          status: 'AVAILABLE',
          currentLoad: 50,
          maxCapacity: 100,
          assignedTaskIds: ['T1'],
        },
      ];
      mockHttpService.get.mockReturnValue(of({ data: vehicles }));
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Dispatch failed')),
      );
      const loggerSpy = service['logger'].error as jest.Mock;

      await service['simulateDispatch']();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error during vehicle dispatch V1: Dispatch failed',
      );
    });
  });
});
