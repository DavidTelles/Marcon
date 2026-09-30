export function boxBreakdown(quantity: number, packSize: number) {
  const size = Math.max(1, packSize);
  return {
    boxes: Math.floor(quantity / size),
    looseUnits: quantity % size,
  };
}

export function boxLabel(quantity: number, packSize: number) {
  const { boxes, looseUnits } = boxBreakdown(quantity, packSize);
  return `${boxes} ${boxes === 1 ? "caixa" : "caixas"} de ${packSize} + ${looseUnits} ${looseUnits === 1 ? "peça avulsa" : "peças avulsas"}`;
}
