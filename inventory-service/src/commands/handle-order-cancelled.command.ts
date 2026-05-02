export class HandleOrderCancelledCommand {
  constructor(
    public readonly orderId: string,
    public readonly previousStatus: string,
    public readonly allocations?: any[],
  ) {}
}
