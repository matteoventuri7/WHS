import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
        retry: {
          initialRetryTime: 300,
          retries: 15,
          factor: 2,
          maxRetryTime: 60000,
          randomizationFactor: 0.3,
        },
      },
      consumer: {
        groupId: 'shipping-consumer',
        retry: {
          multiplier: 2,
          initialRetryTime: 300,
          maxRetryTime: 60000,
        },
      },
    },
  });

  app.enableCors();
  await app.startAllMicroservices();
  const port = process.env.PORT || 3004;
  await app.listen(port);
}
bootstrap();
