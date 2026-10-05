const { proportionalCoverage, suggestTransfers } = require('../../src/workspace/forecast');
const { accessibleWarehousesForBlock } = require('../../src/workspace/distribution-location');
const { deliveryTargets, graphProblems } = require('../../src/workspace/routing');
const { variation } = require('../../src/workspace/parts-consumption');

const graph = {
  width: 100, height: 100, metersPerPixel: 1, scaleCalibrated: true, reviewed: true, walls: [],
  nodes: [
    { id: 'stock2', kind: 'warehouse', warehouseId: 2, label: 'Almoxarifado 2', x: .1, y: .1 },
    { id: 'stock5', kind: 'local_stock', warehouseId: 5, label: 'Almoxarifado 5', x: .8, y: .1 },
    { id: 'sectorA', kind: 'sector', blockId: 1, sectorId: 11, sector: 'Usinagem', label: 'Usinagem A', x: .9, y: .1 },
    { id: 'sectorB', kind: 'sector', blockId: 1, sectorId: 12, sector: 'Montagem', label: 'Montagem A', x: .2, y: .1 },
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
  expect(deliveryTargets(graph, 1, 11).map(node => node.id)).toEqual(['sectorA']);
  expect(accessibleWarehousesForBlock(graph, 1, [2, 5], new Map(), 11)[0].id).toBe(5);
  expect(accessibleWarehousesForBlock(graph, 1, [2, 5], new Map(), 12)[0].id).toBe(2);
  expect(deliveryTargets(graph, 1, 99)).toEqual([]);
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
test('entregas sem período anterior positivo não recebem percentual arbitrário', () => {
  expect(variation(100, 0)).toEqual({ difference: 100, change: null });
  expect(variation(0, 0)).toEqual({ difference: 0, change: null });
  expect(variation(80, 100)).toEqual({ difference: -20, change: -20 });
});
