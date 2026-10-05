const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const { ROLE_CODES } = require('../config/constants');
const userRepository = require('../repositories/userRepository');
const { sanitize } = require('./authService');

function enumFromRole(role) {
  if (!role) return undefined;
  if (ROLE_CODES[role]) return role;
  const found = Object.entries(ROLE_CODES).find(([, v]) => v === role);
  if (!found) throw new AppError(400, 'Papel inválido');
  return found[0];
}

async function listUsers(filters) {
  const rows = await userRepository.list(filters);
  return rows.map(sanitize);
}

async function getUser(id) {
  const user = await userRepository.findById(id);
  if (!user) throw new AppError(404, 'Usuário inexistente');
  const permissions = await userRepository.getPermissionsForUser(id);
  return { user: sanitize(user), permissions };
}

async function updateUser(id, payload) {
  const user = await userRepository.findById(id);
  if (!user) throw new AppError(404, 'Usuário inexistente');
  const data = { ...payload };
  if (payload.password) {
    data.password_hash = await hashPassword(payload.password);
    delete data.password;
  }
  const roleEnum = enumFromRole(payload.role);
  if (roleEnum) data.role_enum = roleEnum;
  delete data.role;
  if (payload.block_id !== undefined) data.block_id = payload.block_id || null;
  const updated = await userRepository.update(id, data);
  return sanitize(updated);
}

async function setPermissions(id, { permission, allowed }) {
  const user = await userRepository.findById(id);
  if (!user) throw new AppError(404, 'Usuário inexistente');
  const { PERMISSIONS } = require('../config/constants');
  if (!Object.values(PERMISSIONS).includes(permission)) throw new AppError(400, 'Permissão inexistente');
  const permissions = await userRepository.setPermissionOverride(id, permission, allowed !== false);
  return { user: sanitize(user), permissions };
}

async function createByAdmin(payload) {
  const { register } = require('./authService');
  return register({ ...payload, role: payload.role || 'funcionario' }, { roleCode: 'ADMIN' });
}

module.exports = { listUsers, getUser, updateUser, setPermissions, createByAdmin };
