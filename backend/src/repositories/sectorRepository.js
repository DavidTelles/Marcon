const AppError = require('../utils/AppError');
const { query } = require('../config/db');

// No schema unificado, setor é um atributo textual do usuário (users.sector).
// A listagem deriva os setores cadastrados; a escrita acontece no cadastro do usuário.
async function list() {
  const rows = await query(
    `SELECT u.sector AS name, b.name AS block_name, COUNT(*) AS members
     FROM users u LEFT JOIN blocks b ON b.id = u.block_id
     WHERE u.sector <> ''
     GROUP BY u.sector, b.name
     ORDER BY u.sector`
  );
  return rows.map((r, i) => ({ id: i + 1, code: r.name, name: r.name, block_name: r.block_name, members: r.members }));
}

async function findById() {
  return null;
}

async function create() {
  throw new AppError(400, 'No banco unificado o setor é definido no cadastro do usuário (campo sector).');
}

async function update() {
  throw new AppError(400, 'No banco unificado o setor é definido no cadastro do usuário (campo sector).');
}

module.exports = { list, findById, create, update };
