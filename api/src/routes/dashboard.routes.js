const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const dashboard = require('../controllers/dashboardController');
const { ROLES, PERMISSIONS } = require('../config/constants');

const router = express.Router();
const admin = [authenticate, authorize(ROLES.ADMIN, PERMISSIONS.DASHBOARDS_ADMIN)];

router.get('/admin/dashboard', ...admin, dashboard.general);
router.get('/admin/dashboard/warehouse', ...admin, dashboard.warehouse);
router.get('/admin/dashboard/stock', ...admin, dashboard.stock);
router.get('/admin/dashboard/block', ...admin, dashboard.block);
router.get('/admin/dashboard/sector/:id', ...admin, dashboard.sector);
router.get('/admin/history/export', authenticate, authorize(ROLES.ADMIN, PERMISSIONS.REPORTS_EXPORT), dashboard.exportHistory);
router.get('/department-head/dashboard', authenticate, authorize(ROLES.SECTOR_REPRESENTATIVE, ROLES.ADMIN), dashboard.block);
router.get('/warehouse/dashboard', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), dashboard.warehouse);
router.get('/api/dashboard/low-stock', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), dashboard.lowStock);

module.exports = router;
