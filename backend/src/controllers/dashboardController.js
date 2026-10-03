const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const dashboardService = require('../services/dashboardService');
const reportService = require('../services/reportService');

const general = asyncHandler(async (req, res) => success(res, 200, await dashboardService.general()));
const warehouse = asyncHandler(async (req, res) => success(res, 200, await dashboardService.byWarehouse()));
const stock = asyncHandler(async (req, res) => success(res, 200, await dashboardService.stockComparative()));
const block = asyncHandler(async (req, res) => success(res, 200, await dashboardService.byBlock(req.user.role === 'lider' ? (req.user.blockId ?? -1) : null)));
const sector = asyncHandler(async (req, res) => success(res, 200, await dashboardService.bySector(req.params.id)));
const lowStock = asyncHandler(async (req, res) => success(res, 200, await dashboardService.lowStock()));
const exportHistory = asyncHandler(async (req, res) => {
  const pdf = await reportService.buildHistoryPdf();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="historico-marcon.pdf"');
  res.send(pdf);
});

module.exports = { general, warehouse, stock, block, sector, lowStock, exportHistory };
