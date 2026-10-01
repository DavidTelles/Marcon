const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const requestService = require('../services/requestService');
const { REQUEST_STATUS } = require('../config/constants');

const create = asyncHandler(async (req, res) => {
  success(res, 201, await requestService.createRequest(req.user, req.body));
});
const list = asyncHandler(async (req, res) => success(res, 200, await requestService.list(req.user, req.query)));
const get = asyncHandler(async (req, res) => success(res, 200, await requestService.getById(req.user, req.params.id)));
const edit = asyncHandler(async (req, res) => success(res, 200, await requestService.edit(req.user, req.params.id, req.body)));
const remove = asyncHandler(async (req, res) => success(res, 200, await requestService.remove(req.user, req.params.id)));
const analyze = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.ANALYZING, req.body?.notes));
});
const approve = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.APPROVED, req.body?.notes));
});
const reject = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.REJECTED, req.body?.notes));
});
const separate = asyncHandler(async (req, res) => {
  // Na versão integrada a separação (reserva de saldo) acontece na aprovação.
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.SEPARATING, req.body?.notes));
});
const deliver = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.DELIVERED, req.body?.notes, {
    qr_code: req.body?.qr_code,
    confirmed_quantity: req.body?.confirmed_quantity
  }));
});
const receive = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.RECEIVED, req.body?.notes));
});
const cancel = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.transition(req.user, req.params.id, REQUEST_STATUS.CANCELLED, req.body?.notes));
});
const returnItems = asyncHandler(async (req, res) => {
  success(res, 200, await requestService.returnItems(req.user, req.params.id, req.body?.items || []));
});

module.exports = {
  create,
  list,
  get,
  edit,
  remove,
  analyze,
  approve,
  reject,
  separate,
  deliver,
  receive,
  cancel,
  returnItems
};
