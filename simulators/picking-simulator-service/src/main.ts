import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Abilitiamo CORS per poter essere interrogati da un eventuale frontend
  app.enableCors();

  const port = process.env.PORT || 3008;
  await app.listen(port);
  logger.log(`Picking Simulator Service in ascolto sulla porta ${port}`);
}
bootstrap();
