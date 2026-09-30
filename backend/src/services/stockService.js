const AppError = require('../utils/AppError');
const { withTransaction } = require('../config/db');
const { MOVEMENT_TYPE } = require('../config/constants');

// Tipos aceitos pela API REST e seu equivalente no ledger unificado.
const KIND = {
  IN: 'entrada',
  RETURN: 'devolucao',
  RELEASE: 'ajuste_entrada',
  OUT: 'saida',
  RESERVE: 'ajuste_saida',
  ADJUST: null, // definido pelo sinal do delta
  TRANSFER: null // gera par transferencia_saida/transferencia_entrada
};

function createStockService({ stockRepository, productRepository, warehouseRepository }) {
  async function locateProduct(productId) {
    const product = await productRepository.findById(productId);
    if (!product) throw new AppError(404, 'Peça inexistente');
    const stocks = await stockRepository.listByProduct(product.id);
    return {
      product,
      locations: stocks.map((s) => ({
        warehouse_id: s.warehouse_id,
        warehouse_code: s.warehouse_code,
        warehouse_name: s.warehouse_name,
        warehouse_type: s.warehouse_type,
        quantity: Number(s.quantity),
        corridor: s.corridor,
        shelf: s.shelf,
        available: Number(s.quantity) > 0
      }))
    };
  }

  async function insertMovement(conn, { partId, warehouseId, kind, quantity, userId, requestId, notes }) {
    if (!quantity) return;
    await conn.execute(
      'INSERT INTO stock_movements (part_id, warehouse_id, kind, quantity, actor_id, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [partId, warehouseId, kind, quantity, userId, notes || 'Movimentação via API', requestId || null]
    );
  }

  async function lockInventory(conn, partId, warehouseId) {
    const [rows] = await conn.execute(
      'SELECT * FROM inventory WHERE part_id = ? AND warehouse_id = ? FOR UPDATE',
      [partId, warehouseId]
    );
    if (rows[0]) return rows[0];
    await conn.execute(
      'INSERT INTO inventory (part_id, warehouse_id, quantity, minimum_quantity) VALUES (?, ?, 0, 0)',
      [partId, warehouseId]
    );
    const [created] = await conn.execute(
      'SELECT * FROM inventory WHERE part_id = ? AND warehouse_id = ? FOR UPDATE',
      [partId, warehouseId]
    );
    return created[0];
  }

  async function changeQuantity({ product_id, warehouse_id, quantity, type, user_id, request_id, notes, warehouse_to_id }) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, 'Quantidade inválida');
    }
    const product = await productRepository.findById(product_id);
    if (!product) throw new AppError(404, 'Peça inexistente');
    const warehouse = await warehouseRepository.findById(warehouse_id);
    if (!warehouse) throw new AppError(404, 'Almoxarifado inexistente');

    return withTransaction(async (conn) => {
      if (type === 'TRANSFER') {
        if (!warehouse_to_id) throw new AppError(400, 'warehouse_to_id é obrigatório na transferência');
        const dest = await warehouseRepository.findById(warehouse_to_id);
        if (!dest) throw new AppError(404, 'Almoxarifado de destino inexistente');
        if (Number(warehouse.id) === Number(dest.id)) throw new AppError(400, 'Origem e destino devem ser diferentes');
        const origin = await lockInventory(conn, product.id, warehouse.id);
        if (Number(origin.quantity) < quantity) {
          throw new AppError(409, 'Quantidade insuficiente no almoxarifado de origem');
        }
        const destination = await lockInventory(conn, product.id, dest.id);
        await conn.execute('UPDATE inventory SET quantity = quantity - ? WHERE part_id = ? AND warehouse_id = ?', [quantity, product.id, warehouse.id]);
        await conn.execute('UPDATE inventory SET quantity = quantity + ? WHERE part_id = ? AND warehouse_id = ?', [quantity, product.id, dest.id]);
        await insertMovement(conn, { partId: product.id, warehouseId: warehouse.id, kind: 'transferencia_saida', quantity, userId: user_id, requestId: request_id, notes });
        await insertMovement(conn, { partId: product.id, warehouseId: dest.id, kind: 'transferencia_entrada', quantity, userId: user_id, requestId: request_id, notes });
        return {
          origin_quantity: Number(origin.quantity) - quantity,
          destination_quantity: Number(destination.quantity) + quantity
        };
      }

      if (!(type in KIND)) throw new AppError(400, 'Tipo de movimentação inválido');
      const stock = await lockInventory(conn, product.id, warehouse.id);
      const current = Number(stock.quantity);
      let next = current;
      if (['IN', 'RETURN', 'RELEASE'].includes(type)) next = current + quantity;
      else if (['OUT', 'RESERVE'].includes(type)) {
        if (current < quantity) throw new AppError(409, 'Quantidade insuficiente');
        next = current - quantity;
      } else if (type === 'ADJUST') {
        next = quantity;
      }
      await conn.execute('UPDATE inventory SET quantity = ? WHERE part_id = ? AND warehouse_id = ?', [next, product.id, warehouse.id]);
      const delta = next - current;
      const kind = type === 'ADJUST' ? (delta >= 0 ? MOVEMENT_TYPE.ADJUST_IN : MOVEMENT_TYPE.ADJUST_OUT) : KIND[type];
      await insertMovement(conn, {
        partId: product.id,
        warehouseId: warehouse.id,
        kind,
        quantity: Math.abs(delta) || quantity,
        userId: user_id,
        requestId: request_id,
        notes
      });
      return { quantity: next };
    });
  }

  async function listStock(filters) {
    return stockRepository.list(filters);
  }

  async function listMovements(filters) {
    return stockRepository.listMovements(filters);
  }

  return { locateProduct, changeQuantity, listStock, listMovements };
}

module.exports = { createStockService };
