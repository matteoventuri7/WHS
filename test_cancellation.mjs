async function run() {
  console.log("--- TEST 1: Cancellazione Ordine con Picking Task PENDING ---");
  console.log("Creazione primo ordine (WATER-24, qty: 5)...");
  const res1 = await fetch('http://localhost:3002/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ productId: 'WATER-24', quantity: 5 }] })
  });
  const order1 = await res1.json();
  console.log("Ordine 1 creato:", order1.orderId);
  
  console.log("Attesa di 2 secondi per allocazione inventario e creazione picking task...");
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("Tentativo di annullamento Ordine 1...");
  const resCancel1 = await fetch(`http://localhost:3002/orders/${order1.orderId}/cancel`, { method: 'PATCH' });
  console.log("Esito annullamento Ordine 1 (Status):", resCancel1.status);
  const cancelText1 = await resCancel1.text();
  console.log("Risposta:", cancelText1);

  console.log("\n--- TEST 2: Cancellazione Ordine con Picking Task COMPLETED ---");
  console.log("Creazione secondo ordine (WATER-24, qty: 5)...");
  const res2 = await fetch('http://localhost:3002/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ productId: 'WATER-24', quantity: 5 }] })
  });
  const order2 = await res2.json();
  console.log("Ordine 2 creato:", order2.orderId);
  
  console.log("Attesa di 2 secondi per allocazione e creazione picking task...");
  await new Promise(r => setTimeout(r, 2000));
  
  const tasksRes = await fetch('http://localhost:3003/picking/tasks');
  const tasks = await tasksRes.json();
  const task2 = tasks.find(t => t.orderId === order2.orderId);
  if (task2) {
    console.log("Trovato picking task PENDING:", task2.taskId);
    console.log("Forzamento completamento del picking task...");
    const compRes = await fetch(`http://localhost:3003/picking/tasks/${task2.taskId}/complete`, { method: 'POST' });
    console.log("Esito Completamento:", compRes.status);
    
    console.log("Tentativo di annullamento Ordine 2...");
    const resCancel2 = await fetch(`http://localhost:3002/orders/${order2.orderId}/cancel`, { method: 'PATCH' });
    console.log("Esito annullamento Ordine 2 (Status):", resCancel2.status);
    const cancelText2 = await resCancel2.text();
    console.log("Risposta:", cancelText2);
  } else {
    console.log("Picking task non trovato. Assicurati che l'inventario abbia WATER-24 disponibile.");
    // controlla stato ordine
    const ordRes = await fetch('http://localhost:3002/orders');
    const all = await ordRes.json();
    console.log("Stato Ordine 2:", all.find(o => o.orderId === order2.orderId)?.status);
  }
}

run().catch(console.error);
