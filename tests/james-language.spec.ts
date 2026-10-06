import { expect, test } from "@playwright/test";
import { explicitCartPlan, quantityWords } from "../lib/james-commands";
import {
  catalogMatches,
  narrowCandidates,
  rankCatalogCandidates,
  candidateQuestion,
} from "../lib/james-catalog";
import { choiceIndex, speechText, wakeCommand } from "../lib/james-voice";

const parts = [
  { code: "PAR-M6-20", name: "Parafuso Allen M6 × 20" },
  { code: "PAR-M6-30", name: "Parafuso Allen M6 × 30" },
  { code: "PAR-M8-30", name: "Parafuso sextavado M8 × 30" },
];

test("Brazilian Portuguese quantity, units and multiple items are preserved", () => {
  expect(explicitCartPlan("Quero 100 unidades de parafuso")).toEqual([
    { action: "add", query: "parafuso", quantity: 100, unit: "unit" },
  ]);
  expect(
    explicitCartPlan(
      "Coloque três caixas de PAR-M6-20 e 5 unidades de PAR-M8-30",
    ),
  ).toEqual([
    { action: "add", query: "par-m6-20", quantity: 3, unit: "package" },
    { action: "add", query: "par-m8-30", quantity: 5, unit: "unit" },
  ]);
  expect(quantityWords("na verdade cinquenta unidades")).toBe(
    "na verdade 50 unidades",
  );
  expect(
    explicitCartPlan("Preciso de cem parafusos para prender a tampa"),
  ).toEqual([
    {
      action: "add",
      query: "parafusos",
      purpose: "prender a tampa",
      quantity: 100,
      unit: "unit",
    },
  ]);
});

test("Marco e Marcos ativam a escuta, preservando o comando e limites do nome", () => {
  for (const name of ["Marco", "Marcos", "MARCO", "MARCOS", "Márcos"]) {
    expect(wakeCommand(name)).toBe("");
    expect(wakeCommand(`${name}, abra estoque`)).toBe("abra estoque");
    expect(wakeCommand(`${name} — procure Parafuso M6`)).toBe(
      "procure Parafuso M6",
    );
  }
  expect(wakeCommand("Oi, Marcos!")).toBe("Oi");
  expect(wakeCommand("conversa ao fundo, Marco.")).toBe("");
  for (const value of [
    "marcou",
    "demarco",
    "marcos123",
    "marcos_extra",
    "ámarco",
    "James",
  ]) {
    expect(wakeCommand(value)).toBeNull();
  }
});

test("finalidade e apelidos cadastrados ordenam candidatos sem inventar identidade", () => {
  const rich = [
    {
      ...parts[0],
      purpose: "prender tampa de inspeção",
      approvedAliases: ["parafuso da tampa"],
    },
    { ...parts[1], purpose: "montar suporte lateral" },
    parts[2],
  ];
  const ranked = rankCatalogCandidates(rich, {
    query: "parafuso",
    purpose: "prender a tampa",
  });
  expect(ranked[0].part.code).toBe("PAR-M6-20");
  expect(ranked).toHaveLength(3);
  expect(candidateQuestion(parts)).toContain("M6");
  expect(
    rankCatalogCandidates(rich, { query: "parafuso", dimensions: "M10" }),
  ).toEqual([]);
});

test("catalog identity is exact and an ambiguous spoken dimension stays ambiguous", () => {
  expect(catalogMatches(parts, "PAR-M6-20").map((p) => p.code)).toEqual([
    "PAR-M6-20",
  ]);
  expect(catalogMatches(parts, "parafuso")).toHaveLength(3);
  expect(catalogMatches(parts, "parafuso 30").map((p) => p.code)).toEqual([
    "PAR-M6-30",
    "PAR-M8-30",
  ]);
  expect(narrowCandidates(parts, "Allen de seis").map((p) => p.code)).toEqual([
    "PAR-M6-20",
    "PAR-M6-30",
  ]);
  expect(narrowCandidates(parts, "Allen M6 30").map((p) => p.code)).toEqual([
    "PAR-M6-30",
  ]);
  expect(choiceIndex("o segundo")).toBe(1);
  expect(wakeCommand("Marco, quero parafusos")).toBe("quero parafusos");
  expect(wakeCommand("James, quero parafusos")).toBeNull();
  expect(wakeCommand("Jhames, quero parafusos")).toBeNull();
  expect(speechText("Parafuso M8 × 30, código PAR-M8-30, 3 un")).toBe(
    "Parafuso M oito por trinta milímetros, código PAR-M8-30, 3 unidades",
  );
});
