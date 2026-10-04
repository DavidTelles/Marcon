const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middlewares/auth');
const workspace = require('../controllers/workspaceController');
const { partsConsumption } = require('../workspace/parts-consumption');
const { ActionError } = require('../workspace/permissions');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true });
router.get('/api/parts/consumption', authenticate, asyncHandler(async (req, res) => {
  try { res.json(await partsConsumption(req.user, new URLSearchParams(req.query))); }
  catch (error) { if (error instanceof ActionError) throw new AppError(error.status, error.message); throw error; }
}));

router.get('/api/workspace/snapshot', authenticate, workspace.snapshot);
router.get('/api/workspace/transfers', authenticate, workspace.transfers);
router.post('/api/workspace/actions', actionLimiter, authenticate, workspace.actions);

module.exports = router;
