const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');
const { ROLES, ROLE_CODES } = require('../config/constants');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) throw new AppError(401, 'Acesso sem autenticação');
    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new AppError(401, 'Token expirado');
      throw new AppError(401, 'Token inválido');
    }
    const user = await userRepository.findById(payload.sub);
    if (!user || !user.active) throw new AppError(401, 'Usuário inexistente ou inativo');
    const permissions = await userRepository.getPermissionsForUser(user.id);
    // `id` carrega a matrícula (employee_no) para compatibilidade com a camada
    // de workspace portada do frontend; `dbId` é o id numérico da tabela.
    req.user = {
      id: user.employee_no,
      dbId: Number(user.id),
      employeeNo: user.employee_no,
      name: user.name,
      email: user.email,
      role: user.role,
      roleCode: ROLE_CODES[user.role],
      sector: user.sector,
      block: user.block_name || undefined,
      blockId: user.block_id,
      permissions,
      permissionOverrides: await userRepository.getPermissionOverridesForUser(user.id)
    };
    next();
  } catch (error) {
    next(error);
  }
}

function authorize(...rolesOrPermissions) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Acesso sem autenticação'));
    const required = rolesOrPermissions.filter((item) => item.includes('.'));
    if (required.some((item) => req.user.permissionOverrides?.[item] === false))
      return next(new AppError(403, 'Permissão individual bloqueada para esta operação'));
    if (req.user.roleCode === ROLES.ADMIN) return next();
    const allowed = rolesOrPermissions.some(
      (item) => req.user.roleCode === item || req.user.role === item || req.user.permissions.includes(item)
    );
    if (!allowed) return next(new AppError(403, 'Papel sem autorização para esta operação'));
    next();
  };
}

module.exports = { authenticate, authorize };
