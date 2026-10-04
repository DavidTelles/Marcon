const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../schemas');
const requests = require('../controllers/requestController');
const { ROLES, PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.post('/api/requests', authenticate, authorize(PERMISSIONS.REQUESTS_CREATE, ROLES.EMPLOYEE), validate(schemas.requestBody), requests.create);
router.get('/api/requests', authenticate, requests.list);
router.get('/api/requests/:id', authenticate, requests.get);
router.patch('/api/requests/:id', authenticate, requests.edit);
router.delete('/api/requests/:id', authenticate, requests.remove);
router.post('/api/requests/:id/analyze', authenticate, authorize(PERMISSIONS.REQUESTS_ANALYZE, ROLES.SECTOR_REPRESENTATIVE), requests.analyze);
router.post('/api/requests/:id/approve', authenticate, authorize(PERMISSIONS.REQUESTS_APPROVE, ROLES.WAREHOUSE_KEEPER), requests.approve);
router.post('/api/requests/:id/reject', authenticate, authorize(PERMISSIONS.REQUESTS_APPROVE, PERMISSIONS.REQUESTS_ANALYZE), requests.reject);
router.post('/api/requests/:id/separate', authenticate, authorize(PERMISSIONS.REQUESTS_SEPARATE, ROLES.WAREHOUSE_KEEPER), requests.separate);
router.post('/api/requests/:id/pickup/prepare', authenticate, authorize(PERMISSIONS.REQUESTS_DELIVER, ROLES.WAREHOUSE_KEEPER), validate(schemas.preparePickupBody), requests.preparePickup);
router.post('/api/requests/:id/pickup/confirm', authenticate, authorize(PERMISSIONS.REQUESTS_DELIVER, ROLES.WAREHOUSE_KEEPER), validate(schemas.confirmPickupBody), requests.confirmPickup);
router.post('/api/requests/:id/deliver', authenticate, authorize(PERMISSIONS.REQUESTS_DELIVER, ROLES.WAREHOUSE_KEEPER), requests.deliver);
router.post('/api/requests/:id/receive', authenticate, authorize(PERMISSIONS.REQUESTS_RECEIVE), requests.receive);
router.post('/api/requests/:id/cancel', authenticate, requests.cancel);
router.post('/api/requests/:id/return', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), requests.returnItems);

router.post('/employee/request', authenticate, authorize(PERMISSIONS.REQUESTS_CREATE), validate(schemas.requestBody), requests.create);
router.get('/employee/history', authenticate, requests.history);
router.get('/employee/request/:id', authenticate, requests.get);

router.get('/department-head/requests', authenticate, authorize(ROLES.SECTOR_REPRESENTATIVE, ROLES.ADMIN), requests.list);
router.get('/department-head/history', authenticate, authorize(ROLES.SECTOR_REPRESENTATIVE, ROLES.ADMIN), requests.history);

router.get('/warehouse/requests', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), requests.open);
router.get('/warehouse/history', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), requests.history);
router.get('/admin/all-requests', authenticate, authorize(ROLES.ADMIN), requests.list);
router.get('/admin/history', authenticate, authorize(ROLES.ADMIN), requests.history);

module.exports = router;
