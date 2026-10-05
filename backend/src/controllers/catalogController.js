const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const blockRepository = require('../repositories/blockRepository');
const sectorRepository = require('../repositories/sectorRepository');
const warehouseRepository = require('../repositories/warehouseRepository');
const productRepository = require('../repositories/productRepository');
const AppError = require('../utils/AppError');
const { stockService } = require('../services/container');
const { executeWorkspaceAction } = require('../workspace/workspace-actions');
const { getPool } = require('../config/db');

const resolveCode = asyncHandler(async (req, res) => {
  const raw = req.body?.code;
  if (typeof raw !== 'string' || !raw.length || raw.length > 1024 || raw.includes('\0'))
    throw new AppError(400, 'Conteúdo do código inválido');
  // Exact, stored identifiers only. Never fetch a URL or infer a printed number.
  const [parts] = await getPool().execute('SELECT id,code,name,unit FROM parts WHERE active=TRUE AND (code=? OR qr_code=?) LIMIT 2', [raw, raw]);
  if (!parts.length) throw new AppError(404, 'Código desconhecido; confirme o vínculo no cadastro');
  if (parts.length !== 1) throw new AppError(409, 'Código ambíguo; revise os vínculos antes de continuar');
  const part = parts[0];
  const global = ['admin', 'almoxarifado'].includes(req.user.role);
  if (global && req.user.permissionOverrides?.['stock.manage'] === false) throw new AppError(403,'Permissão de estoque bloqueada');
  if (!global && (!Number.isSafeInteger(Number(req.user.blockId)) || Number(req.user.blockId) < 1))
    throw new AppError(403, 'Configure o vínculo com um bloco para consultar seu saldo autorizado');
  const [balances] = await getPool().execute(`SELECT w.id AS warehouseId,w.name AS warehouse,i.quantity AS physical,p.unit,
    i.quantity-COALESCE((SELECT SUM(r.quantity) FROM request_reservations r WHERE r.part_id=i.part_id AND r.warehouse_id=i.warehouse_id),0)-COALESCE((SELECT SUM(t.quantity) FROM stock_transfers t WHERE t.part_id=i.part_id AND t.source_warehouse_id=i.warehouse_id AND t.status='Solicitada'),0) AS available
    FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id JOIN parts p ON p.id=i.part_id WHERE i.part_id=? AND w.active=TRUE ${global ? '' : 'AND w.block_id=?'} ORDER BY w.id`, global ? [part.id] : [part.id, Number(req.user.blockId)]);
  success(res, 200, { rawCode: raw, material: part, balances: balances.map(b=>({warehouseId:Number(b.warehouseid ?? b.warehouseId),warehouse:b.warehouse,physical:Number(b.physical),available:Number(b.available),unit:b.unit})), scope: global ? 'Almoxarifados autorizados pelo perfil de estoque' : 'Almoxarifados vinculados ao bloco autorizado' });
});


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
  resolveCode,
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
