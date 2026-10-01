import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { DashboardChartData } from "../components/workspace/operations/dashboard-charts";

test.beforeAll(() => {
  const directory = resolve(".validation/dashboard-render");
  mkdirSync(directory, { recursive: true });
  for (const name of ["dashboard-charts", "insight-chart", "stock-composition"]) {
    const source = readFileSync(
      `components/workspace/operations/${name}.tsx`,
      "utf8",
    );
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2017,
      },
    });
    writeFileSync(resolve(directory, `${name}.js`), result.outputText);
  }
});

function render(report: DashboardChartData) {
  // Render real React elements in Node; Playwright transforms imported JSX for its component protocol.
  return execFileSync(
    process.execPath,
    [
      "-e",
      `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { DashboardCharts } = require('./.validation/dashboard-render/dashboard-charts.js');
    process.stdout.write(renderToStaticMarkup(React.createElement(DashboardCharts, { report: JSON.parse(process.argv[1]) })));
  `,
      JSON.stringify(report),
    ],
    { encoding: "utf8" },
  );
}

const report: DashboardChartData = {
  view: "geral",
  filters: { from: "2026-09-20", to: "2026-09-23" },
  methodology: { period: "20/09/2026 a 23/09/2026" },
  generatedAt: "2026-09-23T15:00:00Z",
  scope: "Todos os blocos autorizados",
  metrics: [],
  daily: [
    { date: "2026-09-20", kind: "entrada", unit: "un", quantity: 40 },
    { date: "2026-09-23", kind: "saida", unit: "un", quantity: 10 },
    { date: "2026-09-23", kind: "saida", unit: "kg", quantity: 900 },
  ],
  top: [
    { code: "PECA-1", item: "Peça em unidades", unit: "un", quantity: 10 },
    { code: "PECA-2", item: "Material em quilos", unit: "kg", quantity: 900 },
  ],
};

test("relatório: gráficos preservam unidades e exibem datas legíveis", async ({
  page,
}) => {
  await page.setContent(render(report));
  const flow = page.getByRole("region", {
    name: "Fluxo de materiais",
    exact: true,
  });
  await expect(flow).toContainText("Total: 50 un.");
  await expect(flow).not.toContainText("900");
  await expect(page.locator(".dashboard-bars")).toContainText(
    "Peça em unidades",
  );
  await expect(page.locator(".dashboard-bars")).not.toContainText(
    "Material em quilos",
  );
  await expect(
    page.getByText("Materiais retirados a cada dia · atualizado às 12:00"),
  ).toBeVisible();
  await page.getByText("Ver valores diários em tabela").click();
  const table = page.getByRole("region", { name: "Dados do gráfico de linha" });
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table).toContainText("23/09/2026");
  await expect(page.locator("select option")).toHaveCount(2);
  await page.setContent(
    render({ ...report, daily: [...report.daily].reverse() }),
  );
  await expect(
    page.getByRole("region", { name: "Fluxo de materiais", exact: true }),
  ).toContainText("Total: 900 kg.");
  await expect(page.locator(".dashboard-bars")).not.toContainText(
    "Peça em unidades",
  );
});

test("relatório: entradas sem retiradas não criam evolução fictícia", async ({
  page,
}) => {
  const entriesOnly = {
    ...report,
    daily: report.daily.filter((row) => row.kind === "entrada"),
    top: [],
  };
  await page.setContent(render(entriesOnly));
  await expect(
    page.getByText("Nenhuma retirada em un no período selecionado."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Fluxo de materiais", exact: true }),
  ).toContainText("Total: 40 un.");
  await expect(page.locator("svg")).toHaveCount(0);
});
