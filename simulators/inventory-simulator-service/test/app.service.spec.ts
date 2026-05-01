import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../src/app.service';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('AppService', () => {
  let appService: AppService;
  let httpService: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    const httpServiceMock = {
      post: jest.fn().mockReturnValue(of({ data: {} })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: HttpService,
          useValue: httpServiceMock,
        },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
    httpService = module.get(HttpService);

    // Suppress logs during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    appService.stopSimulation();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(appService).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = appService.getStatus();
      expect(status).toEqual({ isSimulating: false, intervalMs: null });
    });

    it('should return current status when simulating', () => {
      appService.startSimulation(10000);
      const status = appService.getStatus();
      expect(status).toEqual({ isSimulating: true, intervalMs: 10000 });
    });
  });

  describe('startSimulation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start simulation and call HTTP immediately', () => {
      const result = appService.startSimulation(5000);
      expect(result).toEqual({
        message: 'Inbound simulation started',
        isSimulating: true,
        intervalMs: 5000,
      });
      expect(appService.getStatus().isSimulating).toBe(true);
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should not start simulation if already running', () => {
      appService.startSimulation(5000);
      jest.clearAllMocks();

      const result = appService.startSimulation(2000);
      expect(result).toEqual({
        message: 'Simulation is already running',
        isSimulating: true,
      });
      expect(appService.getStatus().intervalMs).toBe(5000); // Should remain the old interval
      expect(httpService.post).not.toHaveBeenCalled(); // No additional immediate call
    });

    it('should call HTTP on interval', () => {
      appService.startSimulation(5000);
      httpService.post.mockClear();

      jest.advanceTimersByTime(5000);
      expect(httpService.post).toHaveBeenCalled();

      httpService.post.mockClear();
      jest.advanceTimersByTime(10000); // Advance 2 more intervals
      expect(httpService.post).toHaveBeenCalled();
    });
  });

  describe('stopSimulation', () => {
    it('should stop running simulation', () => {
      appService.startSimulation(5000);
      const result = appService.stopSimulation();

      expect(result).toEqual({
        message: 'Inbound simulation stopped',
        isSimulating: false,
      });
      expect(appService.getStatus().isSimulating).toBe(false);
    });

    it('should not stop if not running', () => {
      const result = appService.stopSimulation();
      expect(result).toEqual({
        message: 'Simulation is not currently running',
      });
    });
  });

  describe('simulateInbound', () => {
    it('should POST to inventory-service /receive endpoint', async () => {
      await appService['simulateInbound']();
      expect(httpService.post).toHaveBeenCalled();
      const callArgs = httpService.post.mock.calls[0];
      expect(callArgs[0]).toBe('http://localhost:3001/inventory/receive');
      expect(callArgs[1]).toHaveProperty('productId');
      expect(callArgs[1]).toHaveProperty('quantity');
      expect(callArgs[1]).toHaveProperty('location');
    });

    it('should log error if HTTP call fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );
      const errorSpy = jest.spyOn(appService['logger'], 'error');

      await appService['simulateInbound']();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection refused'),
      );
    });
  });
});
