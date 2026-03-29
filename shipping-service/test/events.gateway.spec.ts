import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from '../src/events.gateway';
import { Server } from 'socket.io';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    gateway.server = { emit: jest.fn() } as unknown as Server;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should log client connection', () => {
      const loggerSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.handleConnection({ id: 'client1' });
      expect(loggerSpy).toHaveBeenCalledWith('Client connesso: client1');
    });
  });

  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      const loggerSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.handleDisconnect({ id: 'client2' });
      expect(loggerSpy).toHaveBeenCalledWith('Client disconnesso: client2');
    });
  });

  describe('notifyDataChanged', () => {
    it('should emit dataChanged event', () => {
      gateway.notifyDataChanged();
      expect(gateway.server.emit).toHaveBeenCalledWith('dataChanged');
    });
  });
});
