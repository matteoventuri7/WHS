export class HandlePickingCompletedCommand {
  constructor(
    public readonly taskId: string,
    public readonly orderId: string,
    public readonly allocations: any[],
  ) {}
}
