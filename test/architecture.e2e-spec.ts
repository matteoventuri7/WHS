import { execSync } from 'child_process';
import axios from 'axios';

describe('Architecture E2E', () => {
  beforeAll(async () => {
    console.log('Stopping any existing docker containers...');
    execSync('npm run docker:stop', { stdio: 'inherit' });

    console.log('Cleaning up databases...');
    try {
      execSync('npm run docker:clean:db', { stdio: 'inherit' });
    } catch (e) {
      console.log('Clean db returned an error, ignoring...');
    }

    console.log('Starting architecture...');
    execSync('npm run docker:start', { stdio: 'inherit' });

    console.log('Waiting for services to be healthy...');
    const checkHealth = async () => {
      const endpoints = [
        'http://localhost:3001/inventory/health',
        'http://localhost:3002/orders/health',
        'http://localhost:3003/picking/health',
        'http://localhost:3004/shipping/health',
        'http://localhost:3005/inbound/health',
        'http://localhost:3006/dispatch/health',
        'http://localhost:3007/order-simulator/health',
        'http://localhost:3008/picking-simulator/health',
      ];
      const maxRetries = 24; // 2 minutes max
      for (let i = 0; i < maxRetries; i++) {
        try {
          const results = await Promise.all(
            endpoints.map(url => axios.get(url).catch(() => null))
          );
          if (results.every(res => res && res.status === 200)) {
            console.log('All services are healthy!');
            return;
          }
        } catch (e) {
          // ignore
        }
        console.log('Services not ready yet, waiting 5 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      throw new Error('Services did not become healthy in time');
    };
    await checkHealth();
  });

  afterAll(() => {
    console.log('Tearing down architecture...');
    execSync('npm run docker:stop', { stdio: 'inherit' });
  });

  it('should start architecture, enable simulators, wait 1 minute, and verify results', async () => {
    // Enable all simulators
    console.log('Starting Inventory Simulator...');
    await axios.post('http://localhost:3005/inbound/start');
    
    console.log('Starting Order Simulator...');
    await axios.post('http://localhost:3007/order-simulator/start');

    console.log('Starting Picking Simulator...');
    await axios.post('http://localhost:3008/picking-simulator/start');

    console.log('Starting Shipping Simulator...');
    await axios.post('http://localhost:3006/dispatch/start');

    console.log('Waiting for at least one vehicle to be dispatched...');
    let vehicleFound = false;
    for (let i = 0; i < 24; i++) {
      try {
        const res = await axios.get('http://localhost:3004/shipping/vehicles');
        if (res.status === 200 && res.data.length > 0) {
          vehicleFound = true;
          console.log(`Found ${res.data.length} vehicle(s), proceeding with assertions...`);
          break;
        }
      } catch (e) {
        // ignore errors
      }
      console.log('No vehicles yet, waiting 5 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (!vehicleFound) {
      throw new Error('Timeout: No vehicles found after 2 minutes');
    }

    // Verify Inventory
    console.log('Verifying Inventory Products...');
    const inventoryRes = await axios.get('http://localhost:3001/inventory');
    expect(inventoryRes.status).toBe(200);
    expect(inventoryRes.data.length).toBeGreaterThan(0);
    console.log(`Found ${inventoryRes.data.length} products.`);

    // Verify Orders
    console.log('Verifying Orders...');
    const ordersRes = await axios.get('http://localhost:3002/orders');
    expect(ordersRes.status).toBe(200);
    expect(ordersRes.data.length).toBeGreaterThan(0);
    console.log(`Found ${ordersRes.data.length} orders.`);

    // Verify Picking
    console.log('Verifying Picking Tasks...');
    const pickingRes = await axios.get('http://localhost:3003/picking/tasks');
    expect(pickingRes.status).toBe(200);
    expect(pickingRes.data.length).toBeGreaterThan(0);
    console.log(`Found ${pickingRes.data.length} picking tasks.`);

    // Verify Shipping
    console.log('Verifying Shipping Vehicles...');
    const shippingRes = await axios.get('http://localhost:3004/shipping/vehicles');
    expect(shippingRes.status).toBe(200);
    expect(shippingRes.data.length).toBeGreaterThan(0);
    console.log(`Found ${shippingRes.data.length} shipping vehicles.`);
  });
});
