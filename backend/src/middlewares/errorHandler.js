const env = require('../config/env');
const AppError = require('../utils/AppError');
const { ActionError } = require('../workspace/permissions');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err instanceof ActionError ? err.status : err.statusCode || 500;
  const isOperational = err instanceof AppError || err instanceof ActionError || err.isOperational;
  const payload = {
    ok: false,
    error: isOperational ? err.message : 'Internal Server Error',
    details: isOperational ? err.details : undefined
  };

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ ok: false, error: 'Registro duplicado' });
  }

  if (env.nodeEnv !== 'production' && !isOperational) {
    payload.debug = err.message;
  }

  res.status(err.statusCode || status).json(payload);
}

function notFound(req, res) {
  res.status(404).json({ ok: false, error: 'Rota não encontrada' });
}

module.exports = { errorHandler, notFound };
