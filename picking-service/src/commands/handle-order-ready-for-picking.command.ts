export class HandleOrderReadyForPickingCommand {
  constructor(
    public readonly orderId: string,
    public readonly allocations: any[],
  ) {}
}
