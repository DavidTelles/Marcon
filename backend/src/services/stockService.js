const AppError = require('../utils/AppError');
const { executeWorkspaceAction, ActionError } = require('../workspace/workspace-actions');

// REST adapts to the same official stock workflows used by the UI.
function createStockService({ stockRepository, productRepository, warehouseRepository }) {
  async function locateProduct(productId) {
    const product = await productRepository.findById(productId);
    if (!product) throw new AppError(404, 'Peça inexistente');
    const stocks = await stockRepository.listByProduct(product.id);
    return { product, locations: stocks.map((s) => ({ ...s, quantity: Number(s.quantity),
      reserved: Number(s.reserved || 0), available: Number(s.quantity) - Number(s.reserved || 0) - Number(s.committed || 0) })) };
  }
  async function changeQuantity({ product_id, warehouse_id, warehouse_to_id, quantity, type, request_id, notes, actor, requestKey, qr_code, confirmation }) {
    if (!actor) throw new AppError(401, 'Sessão ausente');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new AppError(400, 'Quantidade inválida');
    const product = await productRepository.findById(product_id);
    if (!product || product.is_active === false) throw new AppError(404, 'Peça inexistente ou inativa');
    const warehouse = await warehouseRepository.findById(warehouse_id);
    if (!warehouse || warehouse.is_active === false) throw new AppError(404, 'Almoxarifado inexistente ou inativo');
    let action;
    if (type === 'TRANSFER') {
      const destination = await warehouseRepository.findById(warehouse_to_id);
      if (!destination || destination.is_active === false) throw new AppError(404, 'Destino inexistente ou inativo');
      action = { type: 'transfer', code: product.code, from: warehouse.name, to: destination.name, quantity, reason: notes, requestKey };
    } else if (type === 'IN') {
      action = { type: 'stockEntry', code: product.code, warehouse: warehouse.name, quantity, reason: notes, requestKey };
    } else if (type === 'OUT') {
      if (!Number.isSafeInteger(request_id) || !qr_code || !confirmation) throw new AppError(422, 'Saída exige requisição em separação, QR, quantidade e a confirmação obtida em /api/requests/:id/pickup/prepare');
      action = { type: 'confirmPick', id: request_id, code: product.code, sourceWarehouseId: Number(warehouse.id), qrCode: qr_code, confirmedQuantity: quantity, confirmation, requestKey };
    } else throw new AppError(400, 'Use o fluxo oficial para esta movimentação');
    try {
      const result = await executeWorkspaceAction(actor, action);
      return { ...result, ...(type === 'TRANSFER' ? { status: 'Solicitada' } : {}) };
    } catch (error) {
      if (error instanceof ActionError) throw new AppError(error.status, error.message);
      throw error;
    }
  }
  return { locateProduct, changeQuantity, listStock: (filters) => stockRepository.list(filters), listMovements: (filters) => stockRepository.listMovements(filters) };
}
module.exports = { createStockService };
