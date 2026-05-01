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

  it('should bootstrap app and listen on default port', async () => {
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
    expect(app.listen).toHaveBeenCalledWith(3005);
  });

  it('should use PORT from environment when provided', async () => {
    process.env.PORT = '3555';

    const app = {
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    const { NestFactory } = require('@nestjs/core');
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    require('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.listen).toHaveBeenCalledWith('3555');
  });
});
