import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsGateway } from './events.gateway';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import { PendingShipment, PendingShipmentSchema } from './schemas/pending-shipment.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/shipping?authSource=admin'),
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
          },
          consumer: {
            groupId: 'shipping-consumer',
          },
        },
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, EventsGateway],
})
export class AppModule { }
