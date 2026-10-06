import type { Part } from "./demo-data";

export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  location: string;
  description: string;
  specification: string;
  featured?: boolean;
  image?: string;
};

export function catalogItemFromPart(part: Part): CatalogItem {
  return {
    id: part.code,
    name: part.name,
    category: part.category || "Peças",
    stock: part.available ?? part.quantity,
    unit: part.unit || "un",
    image: part.image,
    location:
      part.locations
        ?.map((location) =>
          [location.warehouse, location.aisle, location.shelf]
            .filter(Boolean)
            .join(" / "),
        )
        .join("; ") ||
      part.location ||
      "Localização a definir",
    description: part.description || part.name,
    specification: [
      part.dimensions,
      part.material,
      `QR/ID ${part.qrCode ?? part.code}`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export const catalogItems: CatalogItem[] = [
  {
    id: "EPI-001",
    name: "Capacete de segurança",
    category: "Proteção",
    stock: 42,
    unit: "unidades",
    location: "Almoxarifado A · P01",
    description:
      "Capacete de segurança para atividades operacionais, com ajuste de tamanho e proteção para uso diário.",
    specification: "Classe B · CA vigente",
    featured: true,
  },
  {
    id: "EPI-002",
    name: "Luva de proteção",
    category: "Proteção",
    stock: 86,
    unit: "pares",
    location: "Almoxarifado A · P03",
    description:
      "Luvas de proteção para manuseio de materiais e atividades de manutenção.",
    specification: "Tamanho M · antiderrapante",
  },
  {
    id: "FER-014",
    name: "Parafusadeira a bateria",
    category: "Ferramentas",
    stock: 8,
    unit: "unidades",
    location: "Almoxarifado B · F02",
    description: "Parafusadeira portátil para montagem e manutenção em campo.",
    specification: "18 V · acompanha carregador",
    featured: true,
  },
  {
    id: "FER-021",
    name: "Trena profissional 5 m",
    category: "Ferramentas",
    stock: 24,
    unit: "unidades",
    location: "Almoxarifado B · F05",
    description: "Trena compacta para medições em instalações e inspeções.",
    specification: "Fita de 5 m · trava manual",
  },
  {
    id: "ELE-008",
    name: "Cabo flexível 2,5 mm²",
    category: "Elétrica",
    stock: 120,
    unit: "metros",
    location: "Almoxarifado C · E01",
    description: "Cabo flexível para instalações elétricas de baixa tensão.",
    specification: "2,5 mm² · azul",
  },
  {
    id: "ELE-011",
    name: "Extensão elétrica 10 m",
    category: "Elétrica",
    stock: 0,
    unit: "unidades",
    location: "Almoxarifado C · E04",
    description:
      "Extensão elétrica para uso temporário em manutenção e operação.",
    specification: "10 m · tomadas padrão brasileiro",
  },
  {
    id: "ESC-003",
    name: "Bloco de anotações",
    category: "Escritório",
    stock: 16,
    unit: "unidades",
    location: "Almoxarifado D · S01",
    description: "Bloco para registros rápidos de atividades e inspeções.",
    specification: "100 folhas · pautado",
  },
  {
    id: "EPI-009",
    name: "Óculos de segurança",
    category: "Proteção",
    stock: 35,
    unit: "unidades",
    location: "Almoxarifado A · P04",
    description: "Óculos de proteção para prevenção de impactos e partículas.",
    specification: "Lente transparente · proteção lateral",
  },
];

export function findCatalogItem(id: string) {
  return catalogItems.find((item) => item.id === id.toUpperCase());
}
