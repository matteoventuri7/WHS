export class HandleInventoryAllocatedCommand {
  constructor(
    public readonly orderId: string,
    public readonly allocations: any[],
  ) {}
}
