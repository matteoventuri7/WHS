describe('main bootstrap', () => {
  const originalPort = process.env.PORT;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    const { Logger } = require('@nestjs/common');
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    delete process.env.PORT;
  });

  afterAll(() => {
    process.env.PORT = originalPort;
  });

  it('should bootstrap app with default port and CORS enabled', async () => {
    const app = {
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    const { NestFactory } = require('@nestjs/core');
    const createSpy = jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    require('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(app.enableCors).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3007);
  });

  it('should use PORT from environment when provided', async () => {
    process.env.PORT = '3999';

    const app = {
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    const { NestFactory } = require('@nestjs/core');
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    require('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.listen).toHaveBeenCalledWith('3999');
  });
});
