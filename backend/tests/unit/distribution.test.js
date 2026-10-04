const { proportionalCoverage, suggestTransfers } = require('../../src/workspace/forecast');
const { accessibleWarehousesForBlock } = require('../../src/workspace/distribution-location');
const { deliveryTargets, graphProblems } = require('../../src/workspace/routing');
const { consumptionSummary } = require('../../src/workspace/parts-consumption');

const graph = {
  width: 100, height: 100, metersPerPixel: 1, scaleCalibrated: true, reviewed: true, walls: [],
  nodes: [
    { id: 'stock2', kind: 'warehouse', warehouseId: 2, label: 'Almoxarifado 2', x: .1, y: .1 },
    { id: 'stock5', kind: 'local_stock', warehouseId: 5, label: 'Almoxarifado 5', x: .8, y: .1 },
    { id: 'sectorA', kind: 'sector', blockId: 1, sector: 'Usinagem', label: 'Usinagem A', x: .9, y: .1 },
    { id: 'sectorB', kind: 'sector', blockId: 1, sector: 'Montagem', label: 'Montagem A', x: .2, y: .1 },
  ],
  edges: [
    { from: 'stock2', to: 'stock5', blocked: false },
    { from: 'stock5', to: 'sectorA', blocked: false },
    { from: 'stock2', to: 'sectorB', blocked: false },
  ],
};
const targets = () => [
  { code: 'PAR', unit: 'un', warehouse: 'A', available: 0, physical: 0, target: 144, minimum: 18, incoming: 0, capacity: null },
  { code: 'PAR', unit: 'un', warehouse: 'B', available: 100, physical: 100, target: 48, minimum: 6, incoming: 0, capacity: null },
];
test('local_stock é um almoxarifado roteável e cada setor usa seu destino', () => {
  expect(graphProblems(graph)).toEqual([]);
  expect(deliveryTargets(graph, 1, 'Usinagem').map(node => node.id)).toEqual(['sectorA']);
  expect(accessibleWarehousesForBlock(graph, 1, [2, 5], new Map(), 'Usinagem')[0].id).toBe(5);
  expect(accessibleWarehousesForBlock(graph, 1, [2, 5], new Map(), 'Montagem')[0].id).toBe(2);
  expect(deliveryTargets(graph, 1, 'Setor desconhecido')).toEqual([]);
});
test('saldo escasso é repartido proporcionalmente sem tirar a cobertura do segundo consumidor', () => {
  const balanced = proportionalCoverage(targets(), () => true);
  expect(balanced.map(stock => stock.target)).toEqual([75, 25]);
  expect(suggestTransfers(balanced, () => 1)).toMatchObject([{ from: 'B', to: 'A', quantity: 75 }]);
  expect(balanced[1].available - 75).toBeGreaterThanOrEqual(balanced[1].minimum);
});
test('redes desconectadas e falta abaixo dos mínimos não justificam esvaziar outro estoque', () => {
  expect(proportionalCoverage(targets(), () => false).map(stock => stock.target)).toEqual([144, 48]);
  const low = targets(); low[1].available = 20;
  expect(suggestTransfers(proportionalCoverage(low, () => true), () => 1)).toEqual([]);
});
test('a sugestão respeita a capacidade física e o saldo protegido', () => {
  const balanced = proportionalCoverage(targets(), () => true); balanced[0].capacity = 20;
  expect(suggestTransfers(balanced, () => 1)[0].quantity).toBe(20);
});
test('consumo por bloco e setor desconta devoluções e compara apenas o período selecionado', () => {
  const common = { code: 'PAR', name: 'Parafuso', unit: 'un', requester: '1001', person: 'Ana', deliveredAt: '2026-10-02', sector: 'Usinagem' };
  const rows = [
    { ...common, id: 1, block: 'A', quantity: 100, returned: 20 },
    { ...common, id: 2, block: 'C', quantity: 20, returned: 0 },
    { ...common, id: 3, block: 'A', quantity: 999, returned: 0, deliveredAt: '2026-09-01' },
  ];
  const report = consumptionSummary(rows, '2026-10-01', '2026-10-04');
  expect(report.blocks.map(block => [block.label, block.quantity, block.percentage])).toEqual([['A', 80, 80], ['C', 20, 20]]);
  expect(report.parts[0].quantity).toBe(100);
  expect(report.requests).toBe(2);
});
