const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../schemas');
const stock = require('../controllers/stockController');
const { ROLES, PERMISSIONS } = require('../config/constants');

const router = express.Router();
const manage = [authenticate, authorize(ROLES.ADMIN, ROLES.WAREHOUSE_KEEPER, PERMISSIONS.STOCK_MANAGE)];

router.get('/api/stock', authenticate, stock.list);
router.get('/api/stock/movements', authenticate, authorize(ROLES.ADMIN, ROLES.WAREHOUSE_KEEPER), stock.movements);
router.get('/api/stock/location/:id', authenticate, stock.locate);
router.post('/api/stock/in', ...manage, validate(schemas.movementBody), stock.inbound);
router.post('/api/stock/out', ...manage, validate(schemas.movementBody), stock.outbound);
router.post('/api/stock/transfer', ...manage, validate(schemas.movementBody), stock.transfer);

module.exports = router;
