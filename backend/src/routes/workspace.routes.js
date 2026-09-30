const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middlewares/auth');
const workspace = require('../controllers/workspaceController');

const router = express.Router();
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true });

router.get('/api/workspace/snapshot', authenticate, workspace.snapshot);
router.get('/api/workspace/transfers', authenticate, workspace.transfers);
router.post('/api/workspace/actions', actionLimiter, authenticate, workspace.actions);

module.exports = router;
