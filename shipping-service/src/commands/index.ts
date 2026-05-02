import { RegisterVehicleHandler } from './register-vehicle.handler';
import { DispatchVehicleHandler } from './dispatch-vehicle.handler';
import { HandlePickingCompletedHandler } from './handle-picking-completed.handler';

export const CommandHandlers = [
  RegisterVehicleHandler,
  DispatchVehicleHandler,
  HandlePickingCompletedHandler,
];
