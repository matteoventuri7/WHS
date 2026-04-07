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
      expect(loggerSpy).toHaveBeenCalledWith('Picking simulator inizializzato.');
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
      mockHttpService.get.mockReturnValue(of({ data: [{ taskId: 'TASK-001', status: 'PENDING' }] }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));

      const result = service.startSimulation(10000);
      await Promise.resolve();

      expect(result).toEqual({ message: 'Picking simulation started', isSimulating: true, intervalMs: 10000 });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 });
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
      expect(mockHttpService.get).toHaveBeenCalledWith('http://localhost:3003/picking/tasks');
      expect(mockHttpService.post).toHaveBeenCalledWith('http://localhost:3003/picking/tasks/TASK-001/complete');

      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
    });

    it('should not start if already simulating', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ taskId: 'TASK-001', status: 'PENDING' }] }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));
      service.startSimulation(10000);

      const result = service.startSimulation(20000);

      expect(result).toEqual({ message: 'Simulation is already running', isSimulating: true });
      expect(service.getStatus()).toEqual({ isSimulating: true, intervalMs: 10000 });
    });
  });

  describe('stopSimulation', () => {
    it('should stop running simulation', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ taskId: 'TASK-001', status: 'PENDING' }] }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));
      service.startSimulation(10000);

      const result = service.stopSimulation();

      expect(result).toEqual({ message: 'Picking simulation stopped', isSimulating: false });
      expect(service.getStatus()).toEqual({ isSimulating: false, intervalMs: null });
    });

    it('should do nothing if not simulating', () => {
      const result = service.stopSimulation();
      
      expect(result).toEqual({ message: 'Simulation is not currently running' });
    });
  });

  describe('simulatePicking', () => {
    it('should complete one random pending task', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99);

      const tasks = [
        { taskId: 'TASK-100', status: 'COMPLETED' },
        { taskId: 'TASK-101', status: 'PENDING' },
        { taskId: 'TASK-102', status: 'PENDING' },
      ];

      mockHttpService.get.mockReturnValue(of({ data: tasks }));
      mockHttpService.post.mockReturnValue(of({ data: { success: true } }));

      await service['simulatePicking']();

      expect(mockHttpService.get).toHaveBeenCalledWith('http://localhost:3003/picking/tasks');
      expect(mockHttpService.post).toHaveBeenCalledWith('http://localhost:3003/picking/tasks/TASK-102/complete');
    });

    it('should log warning if picking-service returns invalid data', async () => {
      const loggerSpy = service['logger'].warn as jest.Mock;
      mockHttpService.get.mockReturnValue(of({ data: null }));

      await service['simulatePicking']();

      expect(loggerSpy).toHaveBeenCalledWith('Formato risposta non valido da picking-service');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should skip completion if no pending task is available', async () => {
      const loggerSpy = service['logger'].log as jest.Mock;
      mockHttpService.get.mockReturnValue(of({ data: [{ taskId: 'TASK-100', status: 'COMPLETED' }] }));

      await service['simulatePicking']();

      expect(loggerSpy).toHaveBeenCalledWith('Nessun picking task PENDING disponibile.');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if picking-service get request fails', async () => {
      const loggerSpy = service['logger'].error as jest.Mock;
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Connection refused')));

      await service['simulatePicking']();

      expect(loggerSpy).toHaveBeenCalledWith('Impossibile contattare picking-service: Connection refused');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log error if task completion fails', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockHttpService.get.mockReturnValue(of({ data: [{ taskId: 'TASK-901', status: 'PENDING' }] }));
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Complete endpoint down')));
      const loggerSpy = service['logger'].error as jest.Mock;

      await service['simulatePicking']();

      expect(loggerSpy).toHaveBeenCalledWith('Errore durante il completamento del task TASK-901: Complete endpoint down');
    });
  });
});
