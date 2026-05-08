import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type InventoryRecord = {
  productId: string;
  quantity: number;
  reservedQuantity: number;
};

type OrderRecord = {
  orderId?: string;
  status?: string;
};

type CreatedOrderResponse = {
  orderId?: string;
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private static readonly RANDOM_CANCEL_PROBABILITY = 0.1;
  private static readonly NON_CANCELLABLE_STATUSES = new Set([
    'SHIPPED',
    'CANCELLED',
    'PICKING_COMPLETED',
  ]);

  private simulationInterval: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private currentInterval: number | null = null;

  private readonly inventoryServiceUrl =
    process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001/inventory';
  private readonly orderServiceUrl =
    process.env.ORDER_SERVICE_URL || 'http://localhost:3002/orders';

  constructor(private readonly httpService: HttpService) {}

  getStatus() {
    return {
      isSimulating: this.isSimulating,
      intervalMs: this.currentInterval,
    };
  }

  startSimulation(intervalMs: number = 15000) {
    if (this.isSimulating) {
      return { message: 'Simulation is already running', isSimulating: true };
    }

    this.isSimulating = true;
    this.currentInterval = intervalMs;
    this.logger.log(
      `Automatic simulation started (every ${intervalMs / 1000} seconds)...`,
    );

    // Eseguiamo subito la prima passata
    void this.simulateOrder();

    this.simulationInterval = setInterval(() => {
      void this.simulateOrder();
    }, intervalMs);

    return {
      message: 'Order simulation started',
      isSimulating: true,
      intervalMs,
    };
  }

  stopSimulation() {
    if (!this.isSimulating) {
      return { message: 'Simulation is not currently running' };
    }

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    this.isSimulating = false;
    this.currentInterval = null;
    this.logger.log('Automatic simulation stopped.');

    return { message: 'Order simulation stopped', isSimulating: false };
  }

  private async simulateOrder() {
    this.logger.log('Analyzing inventory to generate a new order...');

    try {
      const response = await firstValueFrom(
        this.httpService.get<InventoryRecord[]>(this.inventoryServiceUrl),
      );

      const inventoryRows = response.data;
      if (!Array.isArray(inventoryRows)) {
        this.logger.warn('Invalid response format from inventory-service');
        return;
      }

      const availableByProduct = new Map<string, number>();

      for (const row of inventoryRows) {
        if (!row || typeof row.productId !== 'string') {
          continue;
        }

        const total = Number(row.quantity ?? 0);
        const reserved = Number(row.reservedQuantity ?? 0);
        const available = Math.max(0, total - reserved);
        if (available <= 0) {
          continue;
        }

        const current = availableByProduct.get(row.productId) ?? 0;
        availableByProduct.set(row.productId, current + available);
      }

      const topProducts = Array.from(availableByProduct.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topProducts.length === 0) {
        this.logger.log('No products available: order not generated.');
        return;
      }

      const selectedIndex = Math.floor(Math.random() * topProducts.length);
      const [selectedProductId, selectedAvailability] =
        topProducts[selectedIndex];
      const quantity = Math.floor(Math.random() * 50) + 1;

      try {
        const orderCreationResponse = await firstValueFrom(
          this.httpService.post<CreatedOrderResponse>(this.orderServiceUrl, {
            items: [{ productId: selectedProductId, quantity }],
          }),
        );

        const createdOrderId =
          typeof orderCreationResponse.data?.orderId === 'string'
            ? orderCreationResponse.data.orderId
            : 'sconosciuto';

        this.logger.log(
          `Order generated: ${createdOrderId} - ${quantity}x ${selectedProductId} (top availability: ${selectedAvailability}).`,
        );

        await this.maybeCancelRandomNonCompletedOrder();
      } catch (orderError: unknown) {
        this.logger.error(
          `Error during order creation: ${this.getErrorMessage(orderError)}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Unable to contact inventory-service: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async maybeCancelRandomNonCompletedOrder() {
    if (!this.shouldAttemptRandomCancellation()) {
      return;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<OrderRecord[]>(this.orderServiceUrl),
      );
      if (!Array.isArray(response.data)) {
        this.logger.warn(
          'Invalid response format from order-service during cancellable order selection',
        );
        return;
      }

      const cancellableOrders = response.data.filter((order) =>
        this.isCancellableOrder(order),
      );
      if (cancellableOrders.length === 0) {
        this.logger.log(
          'No incomplete orders available for random cancellation.',
        );
        return;
      }

      const randomIndex = Math.floor(Math.random() * cancellableOrders.length);
      const orderToCancel = cancellableOrders[randomIndex];
      if (!orderToCancel?.orderId) {
        return;
      }

      await firstValueFrom(
        this.httpService.patch(
          `${this.orderServiceUrl}/${orderToCancel.orderId}/cancel`,
          {},
        ),
      );

      this.logger.log(
        `Order ${orderToCancel.orderId} cancelled via random 10% rule.`,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Random cancellation attempt failed: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private shouldAttemptRandomCancellation() {
    return Math.random() < AppService.RANDOM_CANCEL_PROBABILITY;
  }

  private isCancellableOrder(order: OrderRecord) {
    if (
      typeof order?.orderId !== 'string' ||
      typeof order.status !== 'string'
    ) {
      return false;
    }

    return !AppService.NON_CANCELLABLE_STATUSES.has(order.status.toUpperCase());
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
