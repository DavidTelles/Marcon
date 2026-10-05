const stockRepository = require('../repositories/stockRepository');
const productRepository = require('../repositories/productRepository');
const warehouseRepository = require('../repositories/warehouseRepository');
const { createStockService } = require('../services/stockService');

const stockService = createStockService({
  stockRepository,
  productRepository,
  warehouseRepository
});

module.exports = { stockService };
