import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterVehicleCommand } from './commands/register-vehicle.command';
import { DispatchVehicleCommand } from './commands/dispatch-vehicle.command';
import { HandlePickingCompletedCommand } from './commands/handle-picking-completed.command';
import { GetAllVehiclesQuery } from './queries/get-all-vehicles.query';
import { GetPendingShipmentsQuery } from './queries/get-pending-shipments.query';

@Controller('shipping')
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('vehicles')
  async getVehicles() {
    return this.queryBus.execute(new GetAllVehiclesQuery());
  }

  @Get('pending')
  async getPendingShipments() {
    return this.queryBus.execute(new GetPendingShipmentsQuery());
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'shipping' };
  }

  @Post('vehicles')
  async registerVehicle(
    @Body() body: { vehicleId: string; maxCapacity: number },
  ) {
    return this.commandBus.execute(
      new RegisterVehicleCommand(body.vehicleId, Number(body.maxCapacity)),
    );
  }

  @Post('vehicles/:id/dispatch')
  async dispatchVehicle(@Param('id') vehicleId: string) {
    return this.commandBus.execute(new DispatchVehicleCommand(vehicleId));
  }

  @EventPattern('PickingTaskCompleted')
  async handlePickingTaskCompleted(@Payload() message: any) {
    if (message && message.taskId) {
      await this.commandBus.execute(
        new HandlePickingCompletedCommand(
          message.taskId,
          message.orderId,
          message.allocations,
        ),
      );
    }
  }
}
