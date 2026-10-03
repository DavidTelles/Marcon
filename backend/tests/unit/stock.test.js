jest.mock('../../src/workspace/workspace-actions', () => ({
  executeWorkspaceAction: jest.fn(),
  ActionError: jest.requireActual('../../src/workspace/permissions').ActionError
}));
const { createStockService } = require('../../src/services/stockService');
const { executeWorkspaceAction, ActionError } = require('../../src/workspace/workspace-actions');
const actor = { id: '1003', role: 'almoxarifado' };
const stockRepository = { list: jest.fn(), listByProduct: jest.fn(), listMovements: jest.fn() };
const service = createStockService({ stockRepository,
  productRepository: { findById: async (id) => id === 1 ? { id: 1, code: 'P1', is_active: true } : null },
  warehouseRepository: { findById: async (id) => id === 1 ? { id: 1, name: 'Central', is_active: true } : id === 5 ? { id: 5, name: 'Estoque 5', is_active: true } : null }
});
const input = { actor, product_id: 1, warehouse_id: 1, quantity: 3, notes: 'Contagem conferida', requestKey: 'stock-test-operation-123' };
beforeEach(() => { jest.clearAllMocks(); executeWorkspaceAction.mockResolvedValue({ id: 10 }); });

describe('REST delega ao fluxo oficial (contrato; não prova persistência)', () => {
  test('entrada usa stockEntry com responsável e chave', async () => {
    await service.changeQuantity({ ...input, type: 'IN' });
    expect(executeWorkspaceAction).toHaveBeenCalledWith(actor, { type: 'stockEntry', code: 'P1', warehouse: 'Central', quantity: 3, reason: input.notes, requestKey: input.requestKey });
  });
  test('transferência apenas solicita; não cria movimentos paralelos', async () => {
    expect(await service.changeQuantity({ ...input, type: 'TRANSFER', warehouse_to_id: 5 })).toEqual({ id: 10, status: 'Solicitada' });
    expect(executeWorkspaceAction).toHaveBeenCalledWith(actor, { type: 'transfer', code: 'P1', from: 'Central', to: 'Estoque 5', quantity: 3, reason: input.notes, requestKey: input.requestKey });
  });
  test('saída exige documento aprovado e conferência de código', async () => {
    await expect(service.changeQuantity({ ...input, type: 'OUT' })).rejects.toMatchObject({ statusCode: 422 });
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
    await service.changeQuantity({ ...input, type: 'OUT', request_id: 7, qr_code: 'P1' });
    expect(executeWorkspaceAction).toHaveBeenCalledWith(actor, { type: 'changeRequestStatus', id: 7, status: 'Entregue', qrCode: 'P1', confirmedQuantity: 3, requestKey: input.requestKey });
  });
  test('erros de saldo e permissão são preservados', async () => {
    executeWorkspaceAction.mockRejectedValue(new ActionError('Saldo insuficiente', 409));
    await expect(service.changeQuantity({ ...input, type: 'IN' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.changeQuantity({ ...input, actor: undefined, type: 'IN' })).rejects.toMatchObject({ statusCode: 401 });
  });
  test('material inválido e quantidade fracionada são rejeitados antes da operação', async () => {
    await expect(service.changeQuantity({ ...input, product_id: 99, type: 'IN' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.changeQuantity({ ...input, quantity: 0.5, type: 'IN' })).rejects.toMatchObject({ statusCode: 400 });
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });
});
