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
    if (!Number.isSafeInteger(Number(actor.blockId)) || Number(actor.blockId) < 1)
      throw new AppError(403, 'Configure o vínculo do líder com um bloco antes de consultar requisições');
    if (Number(request.block_id) !== Number(actor.blockId)) throw new AppError(403, 'Líder só visualiza requisições do bloco autorizado');
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
  const urgency = { LEVE: 'Leve', MODERADO: 'Moderado', URGENTE: 'Urgente' }[payload.urgency] || payload.urgency || 'Leve';
  const entries = [];
  for (const item of rawItems) {
    const product = await productRepository.findById(item.product_id);
    if (!product) throw new AppError(404, 'Peça inexistente');
    entries.push({
      code: product.code,
      quantity: Number(item.quantity),
      requestedUnit: item.requestedUnit || payload.requestedUnit || 'piece',
      priority: urgency,
      justification: payload.description || payload.justification || undefined
    });
  }
  try {
    const result = await executeWorkspaceAction(actor, { type: 'createRequests', entries, requestKey: payload.requestKey });
    const created = [];
    for (const id of result.ids || []) created.push(await requestRepository.findById(id));
    return created.length === 1 ? created[0] : { batch: result.batch, requests: created };
  } catch (error) {
    throw wrap(error);
  }
}

async function list(actor, filters = {}) {
  const scoped = { ...filters };
  if (actor.role === 'funcionario') scoped.requester_id = actor.dbId;
  else if (actor.role === 'lider') {
    if (!Number.isSafeInteger(Number(actor.blockId)) || Number(actor.blockId) < 1)
      throw new AppError(403, 'Configure o vínculo do líder com um bloco antes de consultar requisições');
    if (scoped.block && scoped.block !== actor.block) throw new AppError(403, 'Bloco fora do seu escopo');
    delete scoped.block;
    scoped.block_id = Number(actor.blockId);
  }
  return requestRepository.list(scoped);
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
  const request = await getById(actor, id);
  if (actor.role === 'almoxarifado' && request.requester_code !== actor.employeeNo)
    throw new AppError(403, 'Almoxarife não pode excluir requisições de terceiros');
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
    } else if (nextStatus === REQUEST_STATUS.SEPARATING) {
      await executeWorkspaceAction(actor, { type: 'claimRequest', id: Number(id) });
    } else if (nextStatus === REQUEST_STATUS.APPROVED) {
      // A aprovação reserva saldo; a retirada conferida realiza a baixa.
      await executeWorkspaceAction(actor, { type: 'changeRequestStatus', id: Number(id), status: 'Aprovada' });
    } else if (nextStatus === REQUEST_STATUS.DELIVERED) {
      await executeWorkspaceAction(actor, {
        type: 'changeRequestStatus',
        id: Number(id),
        status: 'Entregue',
        requestKey: extra.requestKey
      });
    } else if (nextStatus === REQUEST_STATUS.RECEIVED) {
      await executeWorkspaceAction(actor, { type: 'confirmReceipt', id: Number(id) });
    } else if (nextStatus === REQUEST_STATUS.REJECTED) {
      await executeWorkspaceAction(actor, {
        type: 'changeRequestStatus',
        id: Number(id),
        status: 'Rejeitada',
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
        requestId: Number(request.id),
        requestKey: ret.requestKey,
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

async function pickup(actor, id, payload, confirm = false) {
  await getById(actor, id);
  try {
    return await executeWorkspaceAction(actor, {
      type: confirm ? 'confirmPick' : 'preparePick', id: Number(id),
      qrCode: payload.qr_code, confirmedQuantity: Number(payload.confirmed_quantity),
      confirmation: payload.confirmation, requestKey: payload.requestKey
    });
  } catch (error) { throw wrap(error); }
}
async function history(actor, filters = {}) {
  return list(actor, { ...filters, status: 'Entregue', statuses: undefined });
}

module.exports = { createRequest, list, history, getById, edit, remove, transition, returnItems, pickup };
