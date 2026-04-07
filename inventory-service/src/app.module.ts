import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsGateway } from './events.gateway';
import { Inventory, InventorySchema } from './schemas/inventory.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/inventory?authSource=admin'),
    MongooseModule.forFeature([{ name: Inventory.name, schema: InventorySchema }]),
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
  ],
  controllers: [AppController],
  providers: [AppService, EventsGateway],
})
export class AppModule { }
