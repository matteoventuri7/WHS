"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
let AppService = AppService_1 = class AppService {
    kafkaClient;
    logger = new common_1.Logger(AppService_1.name);
    constructor(kafkaClient) {
        this.kafkaClient = kafkaClient;
    }
    async onModuleInit() {
        this.logger.log('Connessione Kafka Producer (Inbound) inizializzata.');
    }
    async simulateInbound() {
        this.logger.log('Simulazione inbound in corso...');
        const products = ['PROD-001', 'PROD-002', 'PROD-003', 'PROD-004', 'PROD-005'];
        const locations = ['A1', 'A2', 'B1', 'B2', 'C1'];
        const eventsToEmit = Math.floor(Math.random() * 5) + 1;
        for (let i = 0; i < eventsToEmit; i++) {
            const productId = products[Math.floor(Math.random() * products.length)];
            const location = locations[Math.floor(Math.random() * locations.length)];
            const quantity = Math.floor(Math.random() * 100) + 10;
            const payload = { productId, quantity, location };
            this.logger.log(`Emissione evento GoodsArriving: ${JSON.stringify(payload)}`);
            this.kafkaClient.emit('GoodsArriving', payload);
        }
        return { message: 'Inbound simulation started', eventsEmitted: eventsToEmit };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('KAFKA_CLIENT')),
    __metadata("design:paramtypes", [microservices_1.ClientKafka])
], AppService);
//# sourceMappingURL=app.service.js.map