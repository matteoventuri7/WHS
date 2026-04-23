import { Transport } from '@nestjs/microservices';

describe('main bootstrap', () => {
  const originalPort = process.env.PORT;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.PORT;
  });

  afterAll(() => {
    process.env.PORT = originalPort;
  });

  it('should bootstrap kafka microservice and listen on default port', async () => {
    const app = {
      connectMicroservice: jest.fn(),
      enableCors: jest.fn(),
      startAllMicroservices: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    const { NestFactory } = require('@nestjs/core');
    const createSpy = jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    require('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(app.connectMicroservice).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: Transport.KAFKA,
        options: expect.objectContaining({
          consumer: expect.objectContaining({ groupId: 'shipping-consumer' }),
        }),
      }),
    );
    expect(app.enableCors).toHaveBeenCalledTimes(1);
    expect(app.startAllMicroservices).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3004);
  });

  it('should use PORT from environment when provided', async () => {
    process.env.PORT = '3444';

    const app = {
      connectMicroservice: jest.fn(),
      enableCors: jest.fn(),
      startAllMicroservices: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    const { NestFactory } = require('@nestjs/core');
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    require('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.listen).toHaveBeenCalledWith('3444');
  });
});
