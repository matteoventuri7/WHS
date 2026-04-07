import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../src/app.service';
import { ClientKafka } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';

describe('AppService', () => {
  let appService: AppService;
  let kafkaClient: jest.Mocked<ClientKafka>;

  beforeEach(async () => {
    const kafkaClientMock = {
      connect: jest.fn(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: 'KAFKA_CLIENT',
          useValue: kafkaClientMock,
        },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
    kafkaClient = module.get('KAFKA_CLIENT') as jest.Mocked<ClientKafka>;

    // Suppress logs during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    appService.stopSimulation();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(appService).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to kafka client', async () => {
      await appService.onModuleInit();
      expect(kafkaClient.connect).toHaveBeenCalled();
    });
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

    it('should start simulation and emit immediately', () => {
      const result = appService.startSimulation(5000);
      expect(result).toEqual({
        message: 'Inbound simulation started',
        isSimulating: true,
        intervalMs: 5000,
      });
      expect(appService.getStatus().isSimulating).toBe(true);
      expect(kafkaClient.emit).toHaveBeenCalled();
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
      expect(kafkaClient.emit).not.toHaveBeenCalled(); // No additional immediate emit
    });

    it('should emit events on interval', () => {
      appService.startSimulation(5000);
      kafkaClient.emit.mockClear();

      jest.advanceTimersByTime(5000);
      expect(kafkaClient.emit).toHaveBeenCalled();

      kafkaClient.emit.mockClear();
      jest.advanceTimersByTime(10000); // Advance 2 more intervals
      expect(kafkaClient.emit).toHaveBeenCalled();
      // Emits could be multiple per interval, but at least it should be called
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
});
