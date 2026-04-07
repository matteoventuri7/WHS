import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getStatus: jest.fn().mockReturnValue({ isSimulating: true, intervalMs: 1000 }),
            startSimulation: jest.fn().mockReturnValue({ message: 'started' }),
            stopSimulation: jest.fn().mockReturnValue({ message: 'stopped' }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('getStatus', () => {
    it('should return order simulation status', () => {
      expect(appController.getStatus()).toEqual({ isSimulating: true, intervalMs: 1000 });
      expect(appService.getStatus).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok', service: 'order-simulator' });
    });
  });

  describe('startSimulation', () => {
    it('should call startSimulation with intervalMs', () => {
      expect(appController.startSimulation({ intervalMs: 5000 })).toEqual({ message: 'started' });
      expect(appService.startSimulation).toHaveBeenCalledWith(5000);
    });

    it('should call startSimulation without body', () => {
      expect(appController.startSimulation()).toEqual({ message: 'started' });
      expect(appService.startSimulation).toHaveBeenCalledWith(undefined);
    });
  });

  describe('stopSimulation', () => {
    it('should call stopSimulation', () => {
      expect(appController.stopSimulation()).toEqual({ message: 'stopped' });
      expect(appService.stopSimulation).toHaveBeenCalled();
    });
  });
});
