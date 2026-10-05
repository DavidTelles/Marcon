const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../schemas');
const catalog = require('../controllers/catalogController');
const { ROLES, PERMISSIONS } = require('../config/constants');

const router = express.Router();
const admin = [authenticate, authorize(ROLES.ADMIN, PERMISSIONS.SECTORS_MANAGE)];
const warehouseAdmin = [authenticate, authorize(ROLES.ADMIN, PERMISSIONS.WAREHOUSES_MANAGE)];
const productWrite = [authenticate, authorize(ROLES.ADMIN, ROLES.WAREHOUSE_KEEPER, PERMISSIONS.PRODUCTS_MANAGE)];

router.get('/api/blocks', authenticate, catalog.listBlocks);
router.post('/api/blocks', ...admin, catalog.createBlock);
router.patch('/api/blocks/:id', ...admin, catalog.updateBlock);

router.get('/api/sectors', authenticate, catalog.listSectors);
router.post('/api/sectors', ...admin, catalog.createSector);
router.patch('/api/sectors/:id', ...admin, catalog.updateSector);

router.get('/api/warehouses', authenticate, catalog.listWarehouses);
router.post('/api/warehouses', ...warehouseAdmin, catalog.createWarehouse);
router.patch('/api/warehouses/:id', ...warehouseAdmin, catalog.updateWarehouse);

router.get('/api/products', authenticate, catalog.listProducts);
router.post('/api/products/resolve-code', authenticate, catalog.resolveCode);
router.get('/api/products/:id', authenticate, catalog.getProduct);
router.get('/api/products/:id/location', authenticate, catalog.locateProduct);
router.post('/api/products', ...productWrite, validate(schemas.addItemBody), catalog.createProduct);
router.patch('/api/products/:id', ...productWrite, catalog.updateProduct);

router.get('/admin/dashboard/parts/:id', authenticate, authorize(ROLES.ADMIN), catalog.getProduct);
router.get('/warehouse/stock/:id', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), catalog.locateProduct);

module.exports = router;
