// Shim: a camada de workspace foi portada do frontend e espera `transaction`/`getPool`.
const { getPool, withTransaction } = require('../config/db');

module.exports = { getPool, transaction: withTransaction };
