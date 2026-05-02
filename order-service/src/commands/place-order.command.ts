export class PlaceOrderCommand {
  constructor(
    public readonly items: { productId: string; quantity: number }[],
  ) {}
}
