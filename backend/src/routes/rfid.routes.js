const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const schemas = require('../schemas');
const rfidController = require('../controllers/rfidController');
const { ROLES } = require('../config/constants');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true });

router.post('/api/rfid', limiter, validate(schemas.rfidBody), rfidController.ingest);
router.get('/api/rfid', authenticate, authorize(ROLES.ADMIN, ROLES.WAREHOUSE_KEEPER), rfidController.list);

module.exports = router;
