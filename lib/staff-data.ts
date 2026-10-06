export type StaffRole =
  "Administrador" | "Líder de bloco" | "Almoxarife" | "Funcionário";

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  sector: string;
  role: StaffRole;
  block?: string;
  branchId?: number;
  sectorId?: number;
  workplaceId?: number;
  active: boolean;
};

export const initialStaff: StaffUser[] = [
  {
    id: "1001",
    name: "Ana Souza",
    email: "ana.souza@marcon.example",
    sector: "Usinagem",
    role: "Funcionário",
    block: "Bloco A",
    active: true,
  },
  {
    id: "1002",
    name: "Carlos Lima",
    email: "carlos.lima@marcon.example",
    sector: "Montagem",
    role: "Líder de bloco",
    block: "Bloco B",
    active: true,
  },
  {
    id: "1003",
    name: "Marina Costa",
    email: "marina.costa@marcon.example",
    sector: "Almoxarifado",
    role: "Almoxarife",
    active: true,
  },
  {
    id: "1004",
    name: "João Pereira",
    email: "joao.pereira@marcon.example",
    sector: "Manutenção",
    role: "Funcionário",
    block: "Bloco C",
    active: false,
  },
];
