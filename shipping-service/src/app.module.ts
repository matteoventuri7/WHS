import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CqrsModule } from '@nestjs/cqrs';
import { AppController } from './app.controller';
import { EventsGateway } from './events.gateway';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import {
  PendingShipment,
  PendingShipmentSchema,
} from './schemas/pending-shipment.schema';
import { CommandHandlers } from './commands';
import { QueryHandlers } from './queries';
import { ShipmentAssignmentService } from './services/shipment-assignment.service';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ||
        'mongodb://root:example@localhost:27017/shipping?authSource=admin',
    ),
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
      { name: PendingShipment.name, schema: PendingShipmentSchema },
    ]),
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'shipping-producer',
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
            groupId: 'shipping-consumer',
          },
        },
      },
    ]),
    CqrsModule,
  ],
  controllers: [AppController],
  providers: [
    EventsGateway,
    ShipmentAssignmentService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class AppModule {}
