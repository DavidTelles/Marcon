const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const userService = require('../services/userService');
const userRepository = require('../repositories/userRepository');
const { hashPassword } = require('../utils/password');
const AppError = require('../utils/AppError');

const list = asyncHandler(async (req, res) => {
  success(res, 200, await userService.listUsers(req.query));
});

const get = asyncHandler(async (req, res) => {
  success(res, 200, await userService.getUser(req.params.id));
});

const update = asyncHandler(async (req, res) => {
  success(res, 200, await userService.updateUser(req.params.id, req.body));
});

const permissions = asyncHandler(async (req, res) => {
  success(res, 200, await userService.setPermissions(req.params.id, req.body));
});

const create = asyncHandler(async (req, res) => {
  success(res, 201, await userService.createByAdmin(req.body), 'Register sucefull');
});

const changePassword = asyncHandler(async (req, res) => {
  if (!req.body.password) throw new AppError(400, 'password é obrigatório');
  await userRepository.update(req.user.dbId, { password_hash: await hashPassword(req.body.password) });
  success(res, 200, { message: 'Senha atualizada' });
});

module.exports = { list, get, update, permissions, create, changePassword };
