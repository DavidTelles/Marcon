const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { authenticate, authorize } = require('./middlewares/auth');
const { ROLES } = require('./config/constants');
const { setupSwagger } = require('./docs/swagger');
const healthRouter = require('./routes/health');
const authRoutes = require('./routes/auth.routes');
const rfidRoutes = require('./routes/rfid.routes');
const catalogRoutes = require('./routes/catalog.routes');
const stockRoutes = require('./routes/stock.routes');
const requestRoutes = require('./routes/request.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const workspaceRoutes = require('./routes/workspace.routes');

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  setupSwagger(app);
  app.use('/health', healthRouter);
  app.use(authRoutes);
  app.use(rfidRoutes);
  app.use(catalogRoutes);
  app.use(stockRoutes);
  app.use(requestRoutes);
  app.use(dashboardRoutes);
  app.use(workspaceRoutes);

  app.get('/admin', authenticate, authorize(ROLES.ADMIN), (req, res) => {
    res.json({ ok: true, area: 'admin', user: req.user });
  });
  app.get('/department-head', authenticate, authorize(ROLES.SECTOR_REPRESENTATIVE, ROLES.ADMIN), (req, res) => {
    res.json({ ok: true, area: 'department-head', user: req.user });
  });
  app.get('/warehouse', authenticate, authorize(ROLES.WAREHOUSE_KEEPER, ROLES.ADMIN), (req, res) => {
    res.json({ ok: true, area: 'warehouse', user: req.user });
  });
  app.get('/employee', authenticate, (req, res) => {
    res.json({ ok: true, area: 'employee', user: req.user });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
