const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const blockRepository = require('../repositories/blockRepository');
const sectorRepository = require('../repositories/sectorRepository');
const warehouseRepository = require('../repositories/warehouseRepository');
const productRepository = require('../repositories/productRepository');
const AppError = require('../utils/AppError');
const { stockService } = require('../services/container');
const { executeWorkspaceAction } = require('../workspace/workspace-actions');


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
  const result = await saveProduct(req.user, req.body);
  success(res, 201, await productRepository.findById(result.id));
});
async function saveProduct(actor, body, existing) {
  const warehouse = body.warehouse_id ? await warehouseRepository.findById(body.warehouse_id)
    : (await warehouseRepository.list()).find((w) => w.is_active && w.is_central);
  if (!warehouse) throw new AppError(422, 'Selecione um almoxarifado existente');
  return executeWorkspaceAction(actor, { type: 'savePart', warehouse: warehouse.name,
    requestKey: body.requestKey, preserveQuantity: !!existing,
    localQuantity: body.amount ?? body.quantity ?? 0, reason: body.reason,
    part: { id: existing?.id, code: body.sku ?? body.code ?? existing?.code,
      qrCode: body.qr_code ?? existing?.qr_code ?? body.sku ?? body.code,
      name: body.name ?? existing?.name, location: body.location ?? body.corridor ?? existing?.location,
      unit: body.unit ?? existing?.unit ?? 'un', category: body.category ?? existing?.category ?? 'Peças',
      description: body.description ?? existing?.description ?? '',
      packSize: body.pack_size ?? existing?.pack_size ?? 1,
      minimum: body.min_quantity ?? existing?.min_quantity ?? 1,
      leadDays: body.lead_days ?? existing?.lead_days ?? 7,
      estimatedCost: body.reference_unit_price ?? existing?.reference_unit_price ?? 0,
      aisle: body.corridor, shelf: body.shelf, capacity: body.capacity, mapNodeId: body.map_node_id,
      localMinimum: body.local_minimum,
    } });
}
const updateProduct = asyncHandler(async (req, res) => {
  const existing = await productRepository.findById(req.params.id);
  if (!existing) throw new AppError(404, 'Peça inexistente');
  if (req.body.is_active === false) await executeWorkspaceAction(req.user, { type: 'deletePart', id: Number(existing.id) });
  else await saveProduct(req.user, req.body, existing);
  success(res, 200, await productRepository.findById(existing.id));
});
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
