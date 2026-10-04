jest.mock('../../src/workspace/workspace-actions', () => {
  const actual = jest.requireActual('../../src/workspace/permissions');
  return {
    executeWorkspaceAction: jest.fn(),
    ActionError: actual.ActionError
  };
});
jest.mock('../../src/repositories/requestRepository');
jest.mock('../../src/repositories/productRepository');

const requestService = require('../../src/services/requestService');
const { executeWorkspaceAction } = require('../../src/workspace/workspace-actions');
const requestRepository = require('../../src/repositories/requestRepository');
const productRepository = require('../../src/repositories/productRepository');
const { REQUEST_STATUS } = require('../../src/config/constants');

const employee = { id: '1001', dbId: 1, employeeNo: '1001', role: 'funcionario', block: 'Bloco A', permissions: [] };
const keeper = { id: '1003', dbId: 3, employeeNo: '1003', role: 'almoxarifado', permissions: [] };

const request = {
  id: 10,
  requester_id: 1,
  requester_code: '1001',
  block_name: 'Bloco A',
  product_id: 5,
  sku: 'ROL-1',
  quantity: 2,
  status: 'Pendente',
  items: [{ product_id: 5, sku: 'ROL-1', quantity: 2 }]
};

beforeEach(() => {
  jest.clearAllMocks();
  requestRepository.findById.mockImplementation(async () => ({ ...request }));
  requestRepository.list.mockResolvedValue([{ ...request }]);
  productRepository.findById.mockResolvedValue({ id: 5, code: 'ROL-1', name: 'Rolamento' });
  executeWorkspaceAction.mockResolvedValue({ ids: [10] });
});

describe('Requisições via camada de workspace', () => {
  test('histórico é geral e permite somente entregas, sem liberar alterações fora do escopo', async () => {
    await requestService.history(employee, { requester_id: 99, status: 'Pendente', statuses: ['Pendente'] });
    expect(requestRepository.list).toHaveBeenCalledWith({ requester_id: undefined, status: 'Entregue', statuses: undefined });
    requestRepository.findById.mockResolvedValue({ ...request, status: 'Entregue', requester_code: '9999', block_name: 'Bloco C' });
    await expect(requestService.getById(employee, 10)).resolves.toMatchObject({ status: 'Entregue' });
  });
  test('criar converte product_id em código da peça e delega', async () => {
    await requestService.createRequest(employee, { product_id: 5, quantity: 2, urgency: 'Moderado' });
    expect(executeWorkspaceAction).toHaveBeenCalledWith(employee, {
      type: 'createRequests',
      requestKey: undefined,
      entries: [{ code: 'ROL-1', quantity: 2, requestedUnit: 'piece', priority: 'Moderado', justification: undefined }]
    });
  });

  test('funcionário só enxerga as próprias requisições', async () => {
    await requestService.list(employee, {});
    expect(requestRepository.list).toHaveBeenCalledWith({ requester_id: 1 });
    requestRepository.findById.mockResolvedValue({ ...request, requester_code: '9999' });
    await expect(requestService.getById(employee, 10)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('analisar delega transição para Em análise', async () => {
    await requestService.transition(keeper, 10, REQUEST_STATUS.ANALYZING);
    expect(executeWorkspaceAction).toHaveBeenCalledWith(keeper, {
      type: 'changeRequestStatus', id: 10, status: 'Em análise'
    });
  });

  test('entrega encerra a etapa posterior à retirada conferida', async () => {
    await requestService.transition(keeper, 10, REQUEST_STATUS.DELIVERED, undefined, { qr_code: 'ROL-1', confirmed_quantity: 2 });
    expect(executeWorkspaceAction).toHaveBeenCalledWith(keeper, {
      type: 'changeRequestStatus', id: 10, status: 'Entregue', requestKey: undefined
    });
  });

  test('recebimento vira confirmReceipt', async () => {
    await requestService.transition(employee, 10, REQUEST_STATUS.RECEIVED);
    expect(executeWorkspaceAction).toHaveBeenCalledWith(employee, { type: 'confirmReceipt', id: 10 });
  });

  test('cancelamento do próprio pendente vira deleteRequest', async () => {
    await requestService.transition(employee, 10, REQUEST_STATUS.CANCELLED);
    expect(executeWorkspaceAction).toHaveBeenCalledWith(employee, { type: 'deleteRequest', id: 10 });
  });
});
