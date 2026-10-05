const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, req.user);
  success(res, 201, result, 'Register sucefull');
});

const login = asyncHandler(async (req, res) => {
  const loginValue = req.body.login || req.body.email || req.body.id;
  const result = await authService.login({ login: String(loginValue), password: req.body.password });
  success(res, 200, result);
});


const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  success(res, 200, result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  success(res, 200, result);
});

const forgotEmail = asyncHandler(async (req, res) => {
  const result = await authService.forgotEmail(req.body);
  success(res, 200, result);
});

const me = asyncHandler(async (req, res) => {
  const userRepository = require('../repositories/userRepository');
  const user = await userRepository.findById(req.user.dbId);
  success(res, 200, { user: authService.sanitize(user), permissions: req.user.permissions });
});

const loginFace = asyncHandler(async (req, res) => success(res, 200, await authService.loginFace(req.body)));
module.exports = { register, login, loginFace, forgotPassword, resetPassword, forgotEmail, me };
