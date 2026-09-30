const ROLES = {
  ADMIN: 'ADMIN',
  SECTOR_REPRESENTATIVE: 'SECTOR_REPRESENTATIVE',
  WAREHOUSE_KEEPER: 'WAREHOUSE_KEEPER',
  EMPLOYEE: 'EMPLOYEE'
};

// Papel gravado na tabela unificada `users` (ENUM) -> código de papel da API.
const ROLE_CODES = {
  admin: ROLES.ADMIN,
  lider: ROLES.SECTOR_REPRESENTATIVE,
  almoxarifado: ROLES.WAREHOUSE_KEEPER,
  funcionario: ROLES.EMPLOYEE
};
const ROLE_ENUMS = Object.fromEntries(Object.entries(ROLE_CODES).map(([k, v]) => [v, k]));

// Status da tabela unificada `requests`.
// RECEIVED/REJECTED/SEPARATING são alvos virtuais da API REST: recebimento é
// confirmado via received_at, rejeição vira 'Cancelada' e a separação física
// acontece na aprovação (reserva automática de saldo).
const REQUEST_STATUS = {
  PENDING: 'Pendente',
  ANALYZING: 'Em análise',
  APPROVED: 'Aprovada',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
  CANCELLATION_REQUESTED: 'Cancelamento solicitado',
  RECEIVED: '__RECEIVED__',
  REJECTED: '__REJECTED__',
  SEPARATING: '__SEPARATING__'
};

const URGENCY = {
  LEVE: 'Leve',
  MODERADO: 'Moderado',
  URGENTE: 'Urgente'
};

const MOVEMENT_TYPE = {
  IN: 'entrada',
  OUT: 'saida',
  TRANSFER_IN: 'transferencia_entrada',
  TRANSFER_OUT: 'transferencia_saida',
  RETURN: 'devolucao',
  ADJUST_IN: 'ajuste_entrada',
  ADJUST_OUT: 'ajuste_saida'
};

const RFID_REASONS = {
  ALLOWED: 'RFID válido + funcionário ativo',
  TAG_NOT_FOUND: 'RFID inexistente',
  USER_INACTIVE: 'RFID cadastrado + usuário inativo',
  NO_PERMISSION: 'RFID cadastrado + usuário sem permissão'
};

const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  SECTORS_MANAGE: 'sectors.manage',
  WAREHOUSES_MANAGE: 'warehouses.manage',
  PRODUCTS_MANAGE: 'products.manage',
  REQUESTS_VIEW_ALL: 'requests.view_all',
  REQUESTS_VIEW_SECTOR: 'requests.view_sector',
  REQUESTS_CREATE: 'requests.create',
  REQUESTS_ANALYZE: 'requests.analyze',
  REQUESTS_APPROVE: 'requests.approve',
  REQUESTS_SEPARATE: 'requests.separate',
  REQUESTS_DELIVER: 'requests.deliver',
  REQUESTS_RECEIVE: 'requests.receive',
  STOCK_MANAGE: 'stock.manage',
  RFID_ACCESS: 'rfid.access',
  DASHBOARDS_ADMIN: 'dashboards.admin',
  REPORTS_EXPORT: 'reports.export'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SECTOR_REPRESENTATIVE]: [
    PERMISSIONS.REQUESTS_VIEW_SECTOR,
    PERMISSIONS.REQUESTS_ANALYZE,
    PERMISSIONS.REQUESTS_CREATE,
    PERMISSIONS.REQUESTS_RECEIVE,
    PERMISSIONS.RFID_ACCESS
  ],
  [ROLES.WAREHOUSE_KEEPER]: [
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.REQUESTS_VIEW_ALL,
    PERMISSIONS.REQUESTS_APPROVE,
    PERMISSIONS.REQUESTS_SEPARATE,
    PERMISSIONS.REQUESTS_DELIVER,
    PERMISSIONS.STOCK_MANAGE,
    PERMISSIONS.RFID_ACCESS
  ],
  [ROLES.EMPLOYEE]: [
    PERMISSIONS.REQUESTS_CREATE,
    PERMISSIONS.REQUESTS_RECEIVE,
    PERMISSIONS.RFID_ACCESS
  ]
};

module.exports = {
  ROLES,
  ROLE_CODES,
  ROLE_ENUMS,
  REQUEST_STATUS,
  URGENCY,
  MOVEMENT_TYPE,
  RFID_REASONS,
  PERMISSIONS,
  ROLE_PERMISSIONS
};
