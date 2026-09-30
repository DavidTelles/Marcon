const userRepository = require('../repositories/userRepository');
const eventRepository = require('../repositories/rfidEventRepository');
const stockRepository = require('../repositories/stockRepository');
const productRepository = require('../repositories/productRepository');
const warehouseRepository = require('../repositories/warehouseRepository');
const { createRfidService } = require('../services/rfidService');
const { createStockService } = require('../services/stockService');

const stockService = createStockService({
  stockRepository,
  productRepository,
  warehouseRepository
});

const rfidService = createRfidService({
  userRepository,
  eventRepository,
  permissionLoader: (id) => userRepository.getPermissionsForUser(id)
});

module.exports = { stockService, rfidService };
