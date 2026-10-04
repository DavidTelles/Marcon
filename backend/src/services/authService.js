const crypto = require('crypto');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/token');
const userRepository = require('../repositories/userRepository');
const { query } = require('../config/db');
const { ROLES, ROLE_CODES } = require('../config/constants');

function sanitize(user) {
  return userRepository.publicUser(user);
}

function issueToken(user) {
  return signToken({
    sub: Number(user.id),
    eno: user.employee_no,
    role: user.role
  });
}

async function resolveRoleCode(payloadRole, actor) {
  let roleEnum = 'funcionario';
  if (payloadRole) {
    const asEnum = ROLE_CODES[String(payloadRole)] ? String(payloadRole)
      : (Object.entries(ROLE_CODES).find(([, v]) => v === String(payloadRole)) || [])[0];
    if (!asEnum) throw new AppError(400, 'Papel inválido');
    roleEnum = asEnum;
  }
  if (actor && actor.roleCode !== ROLES.ADMIN) roleEnum = 'funcionario';
  return roleEnum;
}

async function register(payload, actor) {
  if (!actor || actor.roleCode !== ROLES.ADMIN || actor.permissionOverrides?.['users.manage'] === false)
    throw new AppError(403, 'Cadastro de usuários exige administrador autorizado');
  const employeeCode = String(payload.id || payload.employee_code || payload.employee_no || '').trim();
  const email = (payload.email || `${employeeCode.toLowerCase()}@marcon.local`).trim().toLowerCase();
  const name = payload.name || payload.employee_code || employeeCode;
  const password = payload.password;
  if (!employeeCode || typeof password !== 'string' || password.length < 12) {
    throw new AppError(400, 'id e password são obrigatórios');
  }
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(employeeCode)) throw new AppError(400, 'Matrícula inválida');

  const existing = await userRepository.findByEmployeeCode(employeeCode);
  if (existing) throw new AppError(409, 'Usuário já cadastrado');
  const existingEmail = await userRepository.findByEmail(email);
  if (existingEmail) throw new AppError(409, 'E-mail já cadastrado');

  const roleEnum = await resolveRoleCode(payload.role, actor);

  let blockId = payload.block_id || null;
  if (!blockId && payload.block) {
    const blocks = await query('SELECT id FROM blocks WHERE name = ? OR code = ?', [payload.block, payload.block]);
    blockId = blocks[0] ? blocks[0].id : null;
  }
  if (['funcionario', 'lider'].includes(roleEnum) && !blockId) {
    throw new AppError(400, 'Defina o bloco de atuação para este papel');
  }
  if (['admin', 'almoxarifado'].includes(roleEnum)) blockId = null;

  const user = await userRepository.create({
    employee_code: employeeCode,
    name,
    email,
    password_hash: await hashPassword(password),
    role_enum: roleEnum,
    sector: payload.sector || 'Geral',
    block_id: blockId,
    rfid_tag: payload.rfid_id ? String(payload.rfid_id).toUpperCase() : null,
    is_active: 1,
    rfid_access_enabled: payload.rfid_access_enabled === false ? 0 : 1
  });

  const permissions = await userRepository.getPermissionsForUser(user.id);
  return { user: sanitize(user), permissions };
}

async function login({ login, password }) {
  const identifier = String(login || '').trim();
  let user = await userRepository.findByEmail(identifier.toLowerCase());
  if (!user) user = await userRepository.findByEmployeeCode(identifier);
  if (!user || !(await comparePassword(password, user.password_hash))) {
    throw new AppError(401, 'Credenciais inválidas');
  }
  if (!user.active) throw new AppError(403, 'Usuário inativo');
  const permissions = await userRepository.getPermissionsForUser(user.id);
  return { token: issueToken(user), user: sanitize(user), permissions };
}

const RFID_PATTERN = /^[0-9A-Fa-f]{8,20}$/;

async function loginRfid({ rfid_id }) {
  const tag = String(rfid_id || '').trim();
  if (!RFID_PATTERN.test(tag)) throw new AppError(400, 'rfid_id inválido');
  const user = await userRepository.findByRfid(tag.toUpperCase());
  if (!user) throw new AppError(401, 'Crachá não reconhecido');
  if (!user.active) throw new AppError(403, 'Usuário inativo');
  if (user.rfid_access_enabled === 0 || user.rfid_access_enabled === false) {
    throw new AppError(403, 'Acesso por RFID desabilitado para este usuário');
  }
  const permissions = await userRepository.getPermissionsForUser(user.id);
  return { token: issueToken(user), user: sanitize(user), permissions };
}

async function forgotPassword({ email, employee_code }) {
  const user = email
    ? await userRepository.findByEmail(String(email).toLowerCase())
    : await userRepository.findByEmployeeCode(employee_code);
  if (!user) {
    return { message: 'Se o cadastro existir, um token de redefinição será gerado' };
  }
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, tokenHash, expires]
  );
  return {
    message: 'Token de redefinição gerado',
    // Tokens must never be delivered to an unauthenticated HTTP caller.
    delivery: 'Sem provedor de envio configurado; solicite recuperação ao administrador'
  };
}

async function resetPassword({ token, password }) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new AppError(400, 'Nova senha deve ter 12–1024 caracteres');
  const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const rows = await query(
    'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
    [tokenHash]
  );
  if (!rows[0]) throw new AppError(400, 'Token inválido ou expirado');
  await userRepository.update(rows[0].user_id, { password_hash: await hashPassword(password) });
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id]);
  return { message: 'Senha atualizada' };
}

async function forgotEmail({ employee_code, id }) {
  const user = await userRepository.findByEmployeeCode(employee_code || id);
  if (!user) throw new AppError(404, 'Usuário inexistente');
  const [local, domain] = user.email.split('@');
  const hint = `${local.slice(0, 2)}***@${domain}`;
  return { email_hint: hint };
}

module.exports = { register, login, loginRfid, forgotPassword, resetPassword, forgotEmail, sanitize };
