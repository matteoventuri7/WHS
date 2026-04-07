import { OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
export declare class AppService implements OnModuleInit {
    private readonly kafkaClient;
    private readonly logger;
    constructor(kafkaClient: ClientKafka);
    onModuleInit(): Promise<void>;
    simulateInbound(): Promise<{
        message: string;
        eventsEmitted: number;
    }>;
}
