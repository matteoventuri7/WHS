import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    this.logger.log(`Client connesso: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnesso: ${client.id}`);
  }

  notifyDataChanged() {
    this.server.emit('dataChanged');
  }
}
