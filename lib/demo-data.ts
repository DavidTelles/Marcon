export type Request = {
  unit?: string;
  requestedUnit?: "piece" | "box";
  requestedAmount?: number;
  packSizeAtRequest?: number;
  anomaly?: import("./request-policy").RequestAnomaly;
  pickedAt?: string;
  fulfilledBy?: string;
  requestedQuantity?: number;
  approvedQuantity?: number;
  deliveredQuantity?: number;
  createdAt?: string;
  requesterId?: string;
  sector?: string;
  batchId?: string;
  reserved?: number;
  receivedAt?: string;
  deliveredAt?: string;
  cancellationReason?: string;
  allocations?: {
    warehouse: string;
    quantity: number;
    location: string;
    nodeId?: string;
  }[];
  id: number;
  material: string;
  quantity: number;
  person: string;
  block: string;
  date: string;
  status:
    | "Pendente"
    | "Em análise"
    | "Aprovada"
    | "Entregue"
    | "Cancelada"
    | "Cancelamento solicitado"
    | "Em separação"
    | "Em entrega"
    | "Rejeitada";
  priority: "Leve" | "Moderado" | "Urgente";
  code?: string;
  justification?: string;
};
export const initialRequests: Request[] = [
  {
    id: 1048,
    material: "Rolamento 6205 ZZ",
    code: "ROL-6205-ZZ",
    quantity: 24,
    person: "Ana Souza",
    block: "Bloco A",
    date: "23/09/2026",
    status: "Pendente",
    priority: "Urgente",
  },
  {
    id: 1047,
    material: "Parafuso sextavado M12",
    code: "PAR-M12-040",
    quantity: 8,
    person: "Carlos Lima",
    block: "Bloco B",
    date: "22/09/2026",
    status: "Em análise",
    priority: "Moderado",
  },
  {
    id: 1046,
    material: "Correia industrial A-42",
    code: "COR-A42",
    quantity: 15,
    person: "Marina Costa",
    block: "Bloco A",
    date: "21/09/2026",
    status: "Aprovada",
    priority: "Leve",
  },
  {
    id: 1045,
    material: "Retentor 35×52×7",
    code: "RET-35527",
    quantity: 12,
    person: "João Pereira",
    block: "Bloco C",
    date: "20/09/2026",
    status: "Entregue",
    priority: "Moderado",
  },
];
export type Part = {
  requestPattern?: import("./request-policy").RequestPattern;
  description?: string;
  purpose?: string;
  material?: string;
  dimensions?: string;
  approvedAliases?: string[];
  reserved?: number;
  available?: number;
  unit?: string;
  category?: string;
  criticality?: number;
  locations?: {
    warehouse: string;
    warehouseId: number;
    aisle: string;
    shelf: string;
    minimum: number;
    capacity: number | null;
    nodeId?: string;
    quantity: number;
    available: number;
    reserved: number;
  }[];
  id: number;
  name: string;
  code: string;
  qrCode?: string;
  materialKind?: "materia-prima" | "componente" | "embalagem" | "consumivel";
  quantity: number;
  packSize: number;
  minimum: number;
  consumed30: number;
  previous30: number;
  leadDays: number;
  estimatedCost: number;
  location: string;
  warehouse: string;
  image?: string;
};
export const initialStock: Part[] = [
  {
    name: "Rolamento 6205 ZZ",
    quantity: 42,
    minimum: 50,
    id: 1,
    code: "ROL-6205-ZZ",
    packSize: 10,
    consumed30: 68,
    previous30: 51,
    leadDays: 12,
    estimatedCost: 38.9,
    location: "A-03",
    warehouse: "Central",
  },
  {
    name: "Parafuso sextavado M12",
    quantity: 36,
    minimum: 20,
    id: 2,
    code: "PAR-M12-040",
    packSize: 100,
    consumed30: 42,
    previous30: 35,
    leadDays: 7,
    estimatedCost: 2.4,
    location: "B-11",
    warehouse: "Central",
  },
  {
    name: "Correia industrial A-42",
    quantity: 18,
    minimum: 25,
    id: 3,
    code: "COR-A42",
    packSize: 5,
    consumed30: 27,
    previous30: 18,
    leadDays: 15,
    estimatedCost: 79.5,
    location: "C-04",
    warehouse: "Bloco A",
  },
  {
    name: "Retentor 35×52×7",
    quantity: 27,
    minimum: 20,
    id: 4,
    code: "RET-35527",
    packSize: 25,
    consumed30: 19,
    previous30: 25,
    leadDays: 10,
    estimatedCost: 24.8,
    location: "A-09",
    warehouse: "Bloco B",
  },
];

export type Movement = {
  kind?: string;
  reason?: string;
  actor?: string;
  id: number;
  partCode: string;
  type: "entrada" | "saida";
  quantity: number;
  date: string;
  warehouse: string;
  block?: string;
  requester?: string;
  transferId?: number;
};
export const initialMovements: Movement[] = [
  {
    id: 1,
    partCode: "ROL-6205-ZZ",
    type: "entrada",
    quantity: 50,
    date: "2026-09-19",
    warehouse: "Central",
  },
  {
    id: 2,
    partCode: "ROL-6205-ZZ",
    type: "saida",
    quantity: 24,
    date: "2026-09-23",
    warehouse: "Central",
    block: "Bloco A",
    requester: "Ana Souza",
  },
  {
    id: 3,
    partCode: "PAR-M12-040",
    type: "entrada",
    quantity: 80,
    date: "2026-09-18",
    warehouse: "Central",
  },
  {
    id: 4,
    partCode: "PAR-M12-040",
    type: "saida",
    quantity: 32,
    date: "2026-09-22",
    warehouse: "Central",
    block: "Bloco B",
    requester: "Carlos Lima",
  },
  {
    id: 5,
    partCode: "COR-A42",
    type: "entrada",
    quantity: 30,
    date: "2026-09-20",
    warehouse: "Bloco A",
  },
  {
    id: 6,
    partCode: "COR-A42",
    type: "saida",
    quantity: 15,
    date: "2026-09-21",
    warehouse: "Bloco A",
    block: "Bloco A",
    requester: "Marina Costa",
  },
  {
    id: 7,
    partCode: "RET-35527",
    type: "entrada",
    quantity: 40,
    date: "2026-09-17",
    warehouse: "Bloco B",
  },
  {
    id: 8,
    partCode: "RET-35527",
    type: "saida",
    quantity: 12,
    date: "2026-09-20",
    warehouse: "Bloco B",
    block: "Bloco C",
    requester: "João Pereira",
  },
];

export type ReturnRecord = {
  inspectedAt?: string;
  inspectionStatus?: string;
  requestId?: number;
  warehouse?: string;
  id: number;
  partCode: string;
  packSize: number;
  quantity: number;
  boxes: number;
  looseUnits: number;
  fromBlock: string;
  returnedBy: string;
  date: string;
  condition: "Apto" | "Danificado";
  note: string;
};
