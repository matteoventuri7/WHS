export class ReceiveGoodsCommand {
  constructor(
    public readonly productId: string,
    public readonly quantity: number,
    public readonly location: string,
  ) {}
}
