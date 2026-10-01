const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { stockService } = require('../services/container');

const list = asyncHandler(async (req, res) => success(res, 200, await stockService.listStock(req.query)));
const movements = asyncHandler(async (req, res) => success(res, 200, await stockService.listMovements(req.query)));
const inbound = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'IN', user_id: req.user.dbId }));
});
const outbound = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'OUT', user_id: req.user.dbId }));
});
const transfer = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'TRANSFER', user_id: req.user.dbId }));
});
const locate = asyncHandler(async (req, res) => {
  success(res, 200, await stockService.locateProduct(req.params.id));
});

module.exports = { list, movements, inbound, outbound, transfer, locate };
