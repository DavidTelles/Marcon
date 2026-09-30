const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const blockRepository = require('../repositories/blockRepository');
const sectorRepository = require('../repositories/sectorRepository');
const warehouseRepository = require('../repositories/warehouseRepository');
const productRepository = require('../repositories/productRepository');
const AppError = require('../utils/AppError');
const { stockService } = require('../services/container');


const listBlocks = asyncHandler(async (req, res) => success(res, 200, await blockRepository.list()));
const createBlock = asyncHandler(async (req, res) => success(res, 201, await blockRepository.create(req.body)));
const updateBlock = asyncHandler(async (req, res) => success(res, 200, await blockRepository.update(req.params.id, req.body)));

const listSectors = asyncHandler(async (req, res) => success(res, 200, await sectorRepository.list()));
const createSector = asyncHandler(async (req, res) => success(res, 201, await sectorRepository.create(req.body)));
const updateSector = asyncHandler(async (req, res) => success(res, 200, await sectorRepository.update(req.params.id, req.body)));

const listWarehouses = asyncHandler(async (req, res) => success(res, 200, await warehouseRepository.list()));
const createWarehouse = asyncHandler(async (req, res) => success(res, 201, await warehouseRepository.create(req.body)));
const updateWarehouse = asyncHandler(async (req, res) => success(res, 200, await warehouseRepository.update(req.params.id, req.body)));

const listProducts = asyncHandler(async (req, res) => success(res, 200, await productRepository.list()));
const getProduct = asyncHandler(async (req, res) => {
  const product = await productRepository.findById(req.params.id);
  if (!product) throw new AppError(404, 'Peça inexistente');
  success(res, 200, product);
});
const createProduct = asyncHandler(async (req, res) => {
  const sku = String(req.body.sku || req.body.id || `SKU-${Date.now()}`);
  const product = await productRepository.create({ ...req.body, sku });
  const amount = req.body.amount ?? req.body.quantity;
  if (amount && req.body.warehouse_id) {
    await stockService.changeQuantity({
      product_id: product.id,
      warehouse_id: req.body.warehouse_id,
      quantity: Number(amount),
      type: 'IN',
      user_id: req.user.dbId,
      notes: 'Entrada inicial'
    });
  }
  success(res, 201, product);
});
const updateProduct = asyncHandler(async (req, res) => success(res, 200, await productRepository.update(req.params.id, req.body)));
const locateProduct = asyncHandler(async (req, res) => {
  success(res, 200, await stockService.locateProduct(req.params.id));
});

module.exports = {
  listBlocks,
  createBlock,
  updateBlock,
  listSectors,
  createSector,
  updateSector,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  locateProduct
};
