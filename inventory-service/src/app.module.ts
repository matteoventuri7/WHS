import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CqrsModule } from '@nestjs/cqrs';
import { AppController } from './app.controller';
import { Inventory, InventorySchema } from './schemas/inventory.schema';
import { CommandHandlers } from './commands';
import { QueryHandlers } from './queries';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ||
        'mongodb://root:example@localhost:27017/inventory?authSource=admin',
    ),
    MongooseModule.forFeature([
      { name: Inventory.name, schema: InventorySchema },
    ]),
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'inventory-producer',
            brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
            retry: {
              initialRetryTime: 100,
              retries: 8,
              factor: 2,
              maxRetryTime: 30000,
              randomizationFactor: 0.2,
            },
          },
          consumer: {
            groupId: 'inventory-consumer',
          },
        },
      },
    ]),
    CqrsModule,
  ],
  controllers: [AppController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}
