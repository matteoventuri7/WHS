import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<AppService>;

  beforeEach(async () => {
    const appServiceMock = {
      getStatus: jest.fn(),
      startSimulation: jest.fn(),
      stopSimulation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appServiceMock,
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get(AppService);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      appService.getStatus.mockReturnValue({
        isSimulating: false,
        intervalMs: null,
      });
      const status = appController.getStatus();
      expect(status).toEqual({ isSimulating: false, intervalMs: null });
      expect(appService.getStatus).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health ok', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'inbound',
      });
    });
  });

  describe('startSimulation', () => {
    it('should call startSimulation on the service without interval param', () => {
      appService.startSimulation.mockReturnValue({
        message: 'Inbound simulation started',
        isSimulating: true,
        intervalMs: 15000,
      });

      const result = appController.startSimulation();
      expect(result.message).toBe('Inbound simulation started');
      expect(appService.startSimulation).toHaveBeenCalledWith(undefined);
    });

    it('should call startSimulation on the service with provided interval param', () => {
      appService.startSimulation.mockReturnValue({
        message: 'Inbound simulation started',
        isSimulating: true,
        intervalMs: 10000,
      });

      const body = { intervalMs: 10000 };
      const result = appController.startSimulation(body);
      expect(result.intervalMs).toBe(10000);
      expect(appService.startSimulation).toHaveBeenCalledWith(10000);
    });
  });

  describe('stopSimulation', () => {
    it('should call stopSimulation on the service', () => {
      appService.stopSimulation.mockReturnValue({
        message: 'Inbound simulation stopped',
        isSimulating: false,
      });

      const result = appController.stopSimulation();
      expect(result.message).toBe('Inbound simulation stopped');
      expect(appService.stopSimulation).toHaveBeenCalled();
    });
  });
});
