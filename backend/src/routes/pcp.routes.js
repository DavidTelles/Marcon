const express = require('express');
const { authenticate } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { pcpOperation } = require('../workspace/pcp');
const router = express.Router();
const handle = asyncHandler(async (req, res) => {
  const path = req.path.replace(/^\/(?:api\/pcp\/)?/, '').split('/').filter(Boolean);
  const data = await pcpOperation(req.user, req.method, path, req.body, new URLSearchParams(req.query));
  success(res, req.method === 'POST' ? 201 : 200, data);
});
router.all('/api/pcp/*', authenticate, handle);
for (const prefix of ['recebimentos', 'requisicoes', 'pedidos-compra', 'estoque', 'consumiveis']) {
  router.all(`/${prefix}`, authenticate, handle);
  router.all(`/${prefix}/*`, authenticate, handle);
}
module.exports = router;
