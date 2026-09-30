jest.mock('../../src/config/db', () => ({
  withTransaction: async (work) => work(global.__conn)
}));

const { createStockService } = require('../../src/services/stockService');
const AppError = require('../../src/utils/AppError');

function fakeConn(initial) {
  const inventory = new Map(Object.entries(initial));
  return {
    inventory,
    movements: [],
    async execute(sql, params) {
      if (sql.includes('FROM inventory') && sql.includes('FOR UPDATE')) {
        const key = `${params[0]}:${params[1]}`;
        return [inventory.has(key) ? [{ ...inventory.get(key) }] : []];
      }
      if (sql.startsWith('INSERT INTO inventory')) {
        inventory.set(`${params[0]}:${params[1]}`, {
          part_id: params[0],
          warehouse_id: params[1],
          quantity: 0,
          minimum_quantity: 0
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE inventory SET quantity = quantity -')) {
        const row = inventory.get(`${params[1]}:${params[2]}`);
        row.quantity -= params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE inventory SET quantity = quantity +')) {
        const row = inventory.get(`${params[1]}:${params[2]}`);
        row.quantity += params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE inventory SET quantity = ?')) {
        inventory.get(`${params[1]}:${params[2]}`).quantity = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO stock_movements')) {
        this.movements.push({ kind: params[2], quantity: params[3] });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`SQL não esperado no teste: ${sql}`);
    }
  };
}

function build(initial) {
  global.__conn = fakeConn(initial);
  const service = createStockService({
    stockRepository: { list: async () => [], listByProduct: async () => [], listMovements: async () => [] },
    productRepository: { findById: async (id) => (Number(id) === 1 ? { id: 1, code: 'P1', name: 'Peça 1' } : null) },
    warehouseRepository: {
      findById: async (id) => (id === 1 ? { id: 1, code: 'C' } : id === 2 ? { id: 2, code: 'A1' } : null)
    }
  });
  return { service, conn: global.__conn };
}

describe('Estoque (schema unificado inventory)', () => {
  test('entrada soma saldo e registra movimento', async () => {
    const { service, conn } = build({ '1:1': { part_id: 1, warehouse_id: 1, quantity: 5 } });
    const result = await service.changeQuantity({ product_id: 1, warehouse_id: 1, quantity: 3, type: 'IN', user_id: 9 });
    expect(result.quantity).toBe(8);
    expect(conn.movements[0].kind).toBe('entrada');
  });

  test('saída sem saldo falha com 409', async () => {
    const { service } = build({ '1:1': { part_id: 1, warehouse_id: 1, quantity: 2 } });
    await expect(
      service.changeQuantity({ product_id: 1, warehouse_id: 1, quantity: 5, type: 'OUT', user_id: 9 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('transferência move saldo entre almoxarifados', async () => {
    const { service, conn } = build({
      '1:1': { part_id: 1, warehouse_id: 1, quantity: 10 },
      '1:2': { part_id: 1, warehouse_id: 2, quantity: 1 }
    });
    const result = await service.changeQuantity({
      product_id: 1, warehouse_id: 1, warehouse_to_id: 2, quantity: 4, type: 'TRANSFER', user_id: 9
    });
    expect(result.origin_quantity).toBe(6);
    expect(result.destination_quantity).toBe(5);
    expect(conn.movements.map((m) => m.kind)).toEqual(['transferencia_saida', 'transferencia_entrada']);
  });

  test('peça inexistente falha com 404', async () => {
    const { service } = build({});
    await expect(
      service.changeQuantity({ product_id: 99, warehouse_id: 1, quantity: 1, type: 'IN', user_id: 9 })
    ).rejects.toBeInstanceOf(AppError);
  });
});
