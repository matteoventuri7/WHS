#!/bin/bash

set -e

echo "Waiting for Kafka to be ready..."
sleep 5

kafka_broker="${KAFKA_BROKER:-localhost:9092}"
echo "Creating Kafka topics on broker: $kafka_broker"

# Function to create topic
create_topic() {
    local topic_name=$1
    echo "Creating topic: $topic_name"
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$kafka_broker" \
        --create \
        --topic "$topic_name" \
        --partitions 1 \
        --replication-factor 1 \
        --if-not-exists
}

# Create all topics
create_topic "OrderPlaced"
create_topic "OrderCancelled"
create_topic "OrderReadyForPicking"
create_topic "OrderSuspended"
create_topic "InventoryAllocated"
create_topic "OutOfStock"
create_topic "ItemStored"
create_topic "PickingTaskCreated"
create_topic "PickingTaskCompleted"
create_topic "CancelPickingTask"
create_topic "ShipmentAssigned"
create_topic "VehicleDispatched"
create_topic "VehicleRegistered"

echo "All Kafka topics created successfully!"
