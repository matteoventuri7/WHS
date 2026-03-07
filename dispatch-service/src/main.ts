import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Abilitiamo CORS per poter essere interrogati da un eventuale frontend
  app.enableCors();

  await app.listen(3006);
  logger.log(`Dispatch Service (Simulator) in ascolto sulla porta 3006`);
}
bootstrap();
