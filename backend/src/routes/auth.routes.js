const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const schemas = require('../schemas');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const { ROLES, PERMISSIONS } = require('../config/constants');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, skipSuccessfulRequests: true });

router.post('/register', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), validate(schemas.registerBody), authController.register);
router.post('/login', loginLimiter, validate(schemas.loginBody), authController.login);
router.post('/login/rfid', loginLimiter, validate(schemas.rfidLoginBody), authController.loginRfid);
router.post('/forgot/password', authController.forgotPassword);
router.post('/forgot/password/reset', authController.resetPassword);
router.post('/forgot/email', authController.forgotEmail);
router.get('/me', authenticate, authController.me);

router.get('/api/users', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), userController.list);
router.get('/api/users/:id', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), userController.get);
router.patch('/api/users/:id', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), userController.update);
router.patch(
  '/api/users/:id/permissions',
  authenticate,
  authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE),
  userController.permissions
);
router.post('/admin/create', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), userController.create);

module.exports = router;
