const { workspaceSnapshot } = require('../workspace/workspace-db');
const { executeWorkspaceAction, ActionError } = require('../workspace/workspace-actions');
const { demand, integer } = require('../workspace/permissions');
const { getPool } = require('../config/db');

// As rotas de workspace conversam com o frontend usando o contrato cru
// ({ ... } em sucesso, { error } em falha) — sem o envelope { ok, data }.
function sendError(res, error) {
  if (error instanceof ActionError || error.isOperational) {
    return res.status(error.status || error.statusCode || 400).json({ error: error.message });
  }
  const code = error && error.code;
  if (code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Código, QR, matrícula ou e-mail já cadastrado.' });
  }
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) {
    return res.status(409).json({ error: 'Outra operação alterou este saldo. Atualize e tente novamente.' });
  }
  console.error('[workspace] action failed', code || error.message);
  return res.status(503).json({ error: 'Operação não concluída. Verifique o banco e as migrações.' });
}

const snapshot = async (req, res) => {
  try {
    const catalogOnly = ['1', 'true'].includes(String(req.query.catalogOnly || ''));
    const data = await workspaceSnapshot(req.user, catalogOnly);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
};

const validDate = (v) =>
  !v ||
  (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v);

const transfers = async (req, res) => {
  try {
    demand(req.user, 'stock');
    const page = integer(Number(req.query.page ?? 1));
    if (page > 10000) throw new ActionError('Página inválida.');
    const mode = req.query.mode || 'all';
    const code = String(req.query.code || '');
    const warehouse = String(req.query.warehouse || '');
    if (!['all', 'analysis', 'history'].includes(mode) || code.length > 64 || warehouse.length > 80) {
      throw new ActionError('Filtro de transferências inválido.');
    }
    const block = String(req.query.block || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (block.length > 80 || !validDate(from) || !validDate(to) || (from && to && from > to)) {
      throw new ActionError('Período/bloco inválido.');
    }
    const clauses = ['1=1'];
    const params = [];
    if (block) {
      clauses.push('EXISTS(SELECT 1 FROM blocks b WHERE b.id=d.block_id AND b.name=?)');
      params.push(block);
    }
    if (mode === 'history' && from) {
      clauses.push('t.created_at>=?');
      params.push(from);
    }
    if (mode === 'history' && to) {
      clauses.push('t.created_at<DATE_ADD(?,INTERVAL 1 DAY)');
      params.push(to);
    }
    if (mode === 'analysis') clauses.push("t.status IN ('Solicitada','Em trânsito')");
    if (mode === 'history') clauses.push("t.status IN ('Recebida','Cancelada')");
    if (code) {
      clauses.push('p.code=?');
      params.push(code);
    }
    if (warehouse) {
      clauses.push('(s.name=? OR d.name=?)');
      params.push(warehouse, warehouse);
    }
    const [rows] = await getPool().query(
      `SELECT t.id,t.status,t.quantity,t.reason,t.created_at,t.shipped_at,t.received_at,p.code,s.name AS source,d.name AS destination,u.name AS requester,su.name AS shipper,ru.name AS receiver FROM stock_transfers t JOIN parts p ON p.id=t.part_id JOIN warehouses s ON s.id=t.source_warehouse_id JOIN warehouses d ON d.id=t.destination_warehouse_id JOIN users u ON u.id=t.performed_by LEFT JOIN users su ON su.id=t.shipped_by LEFT JOIN users ru ON ru.id=t.received_by WHERE ${clauses.join(' AND ')} ORDER BY t.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
      params
    );
    res.set('Cache-Control', 'no-store');
    res.json({ transfers: rows });
  } catch (error) {
    sendError(res, error);
  }
};

const actions = async (req, res) => {
  try {
    const result = await executeWorkspaceAction(req.user, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(result ?? { ok: true });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = { snapshot, transfers, actions };
