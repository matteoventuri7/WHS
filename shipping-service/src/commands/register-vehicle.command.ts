export class RegisterVehicleCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly maxCapacity: number,
  ) {}
}
