const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { stockService } = require('../services/container');

const list = asyncHandler(async (req, res) => success(res, 200, await stockService.listStock(req.query)));
const movements = asyncHandler(async (req, res) => success(res, 200, await stockService.listMovements(req.query)));
const inbound = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'IN', actor: req.user }));
});
const outbound = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'OUT', actor: req.user }));
});
const transfer = asyncHandler(async (req, res) => {
  success(res, 201, await stockService.changeQuantity({ ...req.body, type: 'TRANSFER', actor: req.user }));
});
const locate = asyncHandler(async (req, res) => {
  success(res, 200, await stockService.locateProduct(req.params.id));
});

module.exports = { list, movements, inbound, outbound, transfer, locate };
