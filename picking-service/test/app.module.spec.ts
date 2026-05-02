import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../src/app.module';
import { AppController } from '../src/app.controller';
import { EventsGateway } from '../src/events.gateway';

describe('AppModule', () => {
  it('should be defined', () => {
    expect(AppModule).toBeDefined();
  });

  it('should register controllers, providers and imports', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    );
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);

    expect(controllers).toContain(AppController);
    expect(providers).toContain(EventsGateway);
    expect(imports.length).toBeGreaterThan(0);
  });
});
