import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from '../src/events.gateway';
import { Logger } from '@nestjs/common';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    gateway.server = { emit: jest.fn() } as any;

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should log client connection', () => {
    gateway.handleConnection({ id: 'client-1' });
    expect(Logger.prototype.log).toHaveBeenCalledWith('Client connesso: client-1');
  });

  it('should log client disconnection', () => {
    gateway.handleDisconnect({ id: 'client-2' });
    expect(Logger.prototype.log).toHaveBeenCalledWith('Client disconnesso: client-2');
  });

  it('should emit dataChanged event', () => {
    gateway.notifyDataChanged();
    expect(gateway.server.emit).toHaveBeenCalledWith('dataChanged');
  });
});
