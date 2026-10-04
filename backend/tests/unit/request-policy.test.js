const { requestAnomaly, requestedUnits } = require('../../src/workspace/request-policy');
test('peça incomum depende do histórico do bloco e do setor', () => {
  expect(requestAnomaly(1, { block: { total: 8, quantities: [] }, sector: { total: 2, quantities: [] } })).toMatchObject({ unusual: true, reasons: [expect.stringContaining('Peça incomum no bloco')] });
});
test('quantidade usa mediana e dispersão do contexto, não um limite fixo de 10', () => {
  const pattern = { block: { total: 8, quantities: [40, 45, 50, 40, 45] }, sector: { total: 8, quantities: [40, 45, 50, 40, 45] } };
  expect(requestAnomaly(50, pattern).unusual).toBe(false);
  expect(requestAnomaly(100, pattern).unusual).toBe(true);
  expect(requestAnomaly(8, { block: { total: 8, quantities: [1, 2, 2, 2, 3] }, sector: { total: 0, quantities: [] } }).unusual).toBe(true);
});
test('sem histórico suficiente não inventa um padrão de consumo', () => {
  expect(requestAnomaly(50, { block: { total: 2, quantities: [] }, sector: { total: 0, quantities: [] } })).toEqual({ unusual: false, reasons: [], historySufficient: false });
});
test('caixas são convertidas no servidor e unidades inválidas são recusadas', () => {
  expect(requestedUnits(2, 'box', 5)).toBe(10);
  expect(requestedUnits(2, 'piece', 5)).toBe(2);
  expect(() => requestedUnits(2, 'invalid', 5)).toThrow();
  expect(() => requestedUnits(0, 'box', 5)).toThrow();
  expect(() => requestedUnits(1, 'box', 0)).toThrow();
});
