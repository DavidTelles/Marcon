const AppError = require('../utils/AppError');
const { query } = require('../config/db');
async function list() {
 return query('SELECT s.*,b.name AS block_name,br.code AS branch_code,COUNT(u.id) AS members FROM sectors s JOIN blocks b ON b.id=s.block_id JOIN branches br ON br.id=s.branch_id LEFT JOIN users u ON u.sector_id=s.id GROUP BY s.id,b.name,br.code ORDER BY s.code');
}
async function findById(id) { return (await query('SELECT * FROM sectors WHERE id=?',[id]))[0] || null; }
async function create() { throw new AppError(422,'Configure setores pelo cadastro integrado da planta com IDs oficiais.'); }
async function update() { throw new AppError(422,'Revise a hierarquia pelo cadastro integrado da planta.'); }
module.exports = {list,findById,create,update};
