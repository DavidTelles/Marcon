const PDFDocument = require('pdfkit');
const { query } = require('../config/db');

async function buildHistoryPdf() {
  const bySector = await query(
    `SELECT u.sector AS sector,
            COALESCE(SUM(r.quantity), 0) AS requested,
            COALESCE(SUM(CASE WHEN r.received_at IS NOT NULL THEN r.quantity ELSE 0 END), 0) AS returned
     FROM users u
     LEFT JOIN requests r ON r.requester_id = u.id
     WHERE u.sector <> ''
     GROUP BY u.sector`
  );
  const arrivals = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS arrived FROM stock_movements WHERE kind = 'entrada'`
  );
  const top = await query(
    `SELECT p.name, SUM(r.quantity) AS requested
     FROM requests r JOIN parts p ON p.id = r.part_id
     GROUP BY p.id, p.name ORDER BY requested DESC LIMIT 10`
  );
  const low = await query(
    `SELECT p.name, w.name AS warehouse, i.quantity
     FROM inventory i JOIN parts p ON p.id = i.part_id
     JOIN warehouses w ON w.id = i.warehouse_id
     WHERE p.active = TRUE
     ORDER BY i.quantity ASC LIMIT 10`
  );

  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).text('Relatório MARCON — Histórico de almoxarifado');
    doc.moveDown();
    doc.fontSize(12).text('Peças requisitadas e recebidas por setor');
    bySector.forEach((row) => {
      doc.text(`${row.sector}: requisitadas ${row.requested} | recebidas ${row.returned}`);
    });
    doc.moveDown();
    doc.text(`Novas peças que chegaram no estoque: ${arrivals[0].arrived}`);
    doc.moveDown();
    doc.text('Peças mais requisitadas:');
    top.forEach((row) => doc.text(`- ${row.name}: ${row.requested}`));
    doc.moveDown();
    doc.text('Peças com menor quantidade:');
    low.forEach((row) => doc.text(`- ${row.name} (${row.warehouse}): ${row.quantity}`));
    doc.end();
  });
}

module.exports = { buildHistoryPdf };
