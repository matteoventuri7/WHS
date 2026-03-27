"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const microservices_1 = require("@nestjs/microservices");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const events_gateway_1 = require("./events.gateway");
const order_schema_1 = require("./schemas/order.schema");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/order?authSource=admin'),
            mongoose_1.MongooseModule.forFeature([{ name: order_schema_1.Order.name, schema: order_schema_1.OrderSchema }]),
            microservices_1.ClientsModule.register([
                {
                    name: 'KAFKA_CLIENT',
                    transport: microservices_1.Transport.KAFKA,
                    options: {
                        client: {
                            clientId: 'order-producer',
                            brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
                        },
                        consumer: {
                            groupId: 'order-consumer',
                        },
                    },
                },
            ]),
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, events_gateway_1.EventsGateway],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map