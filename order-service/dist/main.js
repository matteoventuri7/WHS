"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const microservices_1 = require("@nestjs/microservices");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.connectMicroservice({
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
            },
            consumer: {
                groupId: 'order-consumer',
            },
        },
    });
    app.enableCors();
    await app.startAllMicroservices();
    const port = process.env.PORT || 3002;
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map