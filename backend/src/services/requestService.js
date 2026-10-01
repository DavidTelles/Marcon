const AppError = require('../utils/AppError');
const requestRepository = require('../repositories/requestRepository');
const productRepository = require('../repositories/productRepository');
const { executeWorkspaceAction, ActionError } = require('../workspace/workspace-actions');
const { REQUEST_STATUS } = require('../config/constants');

// As regras de negócio (reservas, baixa de estoque, permissões por perfil) vivem
// na camada de workspace compartilhada com o frontend — a API REST delega a ela.
function wrap(error) {
  if (error instanceof ActionError) return new AppError(error.status || 400, error.message);
  return error;
}

function assertCanView(actor, request) {
  if (actor.role === 'admin' || actor.role === 'almoxarifado') return;
  if (actor.role === 'lider') {
    if (request.block_name !== actor.block) throw new AppError(403, 'Líder só visualiza requisições do próprio bloco');
    return;
  }
  if (request.requester_code !== actor.employeeNo) throw new AppError(403, 'Operação não permitida');
}

async function getById(actor, id) {
  const request = await requestRepository.findById(id);
  if (!request) throw new AppError(404, 'Requisição inexistente');
  assertCanView(actor, request);
  return request;
}

async function createRequest(actor, payload) {
  const rawItems = payload.items || [
    { product_id: payload.id_item || payload.product_id, quantity: payload.amount || payload.quantity }
  ];
  if (!rawItems.length || rawItems.some((i) => !i.product_id || !i.quantity || i.quantity <= 0)) {
    throw new AppError(400, 'Itens da requisição inválidos');
  }
  const urgency = payload.urgency || 'Leve';
  const entries = [];
  for (const item of rawItems) {
    const product = await productRepository.findById(item.product_id);
    if (!product) throw new AppError(404, 'Peça inexistente');
    entries.push({
      code: product.code,
      quantity: Number(item.quantity),
      priority: urgency,
      justification: payload.description || payload.justification || undefined
    });
  }
  try {
    const result = await executeWorkspaceAction(actor, { type: 'createRequests', entries });
    const created = [];
    for (const id of result.ids || []) created.push(await requestRepository.findById(id));
    return created.length === 1 ? created[0] : { batch: result.batch, requests: created };
  } catch (error) {
    throw wrap(error);
  }
}

async function list(actor, filters = {}) {
  if (actor.role === 'funcionario') filters.requester_id = actor.dbId;
  else if (actor.role === 'lider') filters.block = actor.block;
  return requestRepository.list(filters);
}

async function edit(actor, id, payload) {
  await getById(actor, id);
  try {
    if (payload.quantity || payload.amount) {
      await executeWorkspaceAction(actor, { type: 'editRequest', id: Number(id), quantity: Number(payload.quantity || payload.amount) });
    }
  } catch (error) {
    throw wrap(error);
  }
  return requestRepository.findById(id);
}

async function remove(actor, id) {
  await getById(actor, id);
  try {
    await executeWorkspaceAction(actor, { type: 'deleteRequest', id: Number(id) });
  } catch (error) {
    throw wrap(error);
  }
  return { deleted: true };
}

async function transition(actor, id, nextStatus, notes, extra = {}) {
  const request = await getById(actor, id);
  const current = request.status;
  try {
    if (nextStatus === REQUEST_STATUS.ANALYZING) {
      await executeWorkspaceAction(actor, { type: 'changeRequestStatus', id: Number(id), status: 'Em análise' });
    } else if (nextStatus === REQUEST_STATUS.APPROVED || nextStatus === REQUEST_STATUS.SEPARATING) {
      // Separação física acontece na aprovação (reserva automática de saldo).
      await executeWorkspaceAction(actor, { type: 'changeRequestStatus', id: Number(id), status: 'Aprovada' });
    } else if (nextStatus === REQUEST_STATUS.DELIVERED) {
      await executeWorkspaceAction(actor, {
        type: 'changeRequestStatus',
        id: Number(id),
        status: 'Entregue',
        qrCode: extra.qr_code || extra.qrCode,
        confirmedQuantity: Number(extra.confirmed_quantity || extra.confirmedQuantity || request.quantity)
      });
    } else if (nextStatus === REQUEST_STATUS.RECEIVED) {
      await executeWorkspaceAction(actor, { type: 'confirmReceipt', id: Number(id) });
    } else if (nextStatus === REQUEST_STATUS.REJECTED) {
      await executeWorkspaceAction(actor, {
        type: 'changeRequestStatus',
        id: Number(id),
        status: 'Cancelada',
        reason: notes || 'Requisição rejeitada'
      });
    } else if (nextStatus === REQUEST_STATUS.CANCELLED) {
      const owns = request.requester_code === actor.employeeNo;
      if (owns && ['Pendente', 'Em análise'].includes(current)) {
        await executeWorkspaceAction(actor, { type: 'deleteRequest', id: Number(id) });
      } else if (owns && current === 'Aprovada') {
        await executeWorkspaceAction(actor, {
          type: 'requestCancellation',
          id: Number(id),
          reason: notes || 'Cancelamento solicitado pelo requisitor'
        });
      } else {
        await executeWorkspaceAction(actor, {
          type: 'changeRequestStatus',
          id: Number(id),
          status: 'Cancelada',
          reason: notes || 'Cancelamento confirmado pelo responsável'
        });
      }
    } else {
      throw new AppError(400, `Status de destino não suportado: ${nextStatus}`);
    }
  } catch (error) {
    throw wrap(error);
  }
  return requestRepository.findById(id);
}

async function returnItems(actor, id, returns) {
  const request = await getById(actor, id);
  if (!['Entregue'].includes(request.status)) {
    throw new AppError(409, 'Devolução só é permitida após a entrega');
  }
  for (const ret of returns.length ? returns : [{ quantity: request.quantity }]) {
    try {
      await executeWorkspaceAction(actor, {
        type: 'registerReturn',
        code: request.sku,
        block: request.block_name,
        quantity: Number(ret.quantity || request.quantity),
        condition: ret.condition === 'Danificado' ? 'Danificado' : 'Apto',
        returnedBy: actor.name || actor.employeeNo,
        note: ret.note || `Devolução da requisição #${request.id}`
      });
    } catch (error) {
      throw wrap(error);
    }
  }
  return requestRepository.findById(id);
}

module.exports = { createRequest, list, getById, edit, remove, transition, returnItems };
