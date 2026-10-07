import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import QRCode from "qrcode";
import sharp from "sharp";
import zxing from "@zxing/library";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const originalUrl = process.env.DATABASE_URL;
assert.match(originalUrl || "", /^postgres(?:ql)?:\/\//);
const backend = createRequire(resolve("backend/package.json"));
const env = backend("./src/config/env");
const jwt = backend("jsonwebtoken");
const supertest = backend("supertest");
const schema = `marcon_pcp_test_${randomUUID().replaceAll("-", "")}`;
assert.match(schema, /^marcon_pcp_test_[a-f0-9]{32}$/);
neonConfig.webSocketConstructor = ws;
const admin = new Pool({ connectionString: originalUrl, max: 1 });
const scopedUrl = new URL(originalUrl);
scopedUrl.hostname = scopedUrl.hostname.replace("-pooler.", ".");
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const scoped = new Pool({ connectionString: scopedUrl.toString(), max: 2 });
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log(`PASS: ${name}`);
};
let created = false;
let domain;
let apiServer, webProcess, browser;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  assert.equal(
    (await scoped.query("SELECT current_schema() AS name")).rows[0].name,
    schema,
  );
  for (const file of (await readdir("db/neon"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await scoped.query(
      (await readFile(`db/neon/${file}`, "utf8")).replaceAll(
        '"public".',
        `"${schema}".`,
      ),
    );
  }
  process.env.DATABASE_URL = scopedUrl.toString();
  env.databaseUrl = process.env.DATABASE_URL;
  domain = await import("../lib/neon-db.mjs");
  assert.equal(
    (await domain.getPool().execute("SELECT current_schema() AS name"))[0][0]
      .name,
    schema,
  );
  const add = async (table, fields, values) =>
    Number(
      (
        await scoped.query(
          `INSERT INTO ${table}(${fields}) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
          values,
        )
      ).rows[0].id,
    );
  const block = await add("blocks", "code,name", [
    "PCP-TEST",
    "Bloco teste PCP",
  ]);
  const otherBlock = await add("blocks", "code,name", [
    "OTHER-TEST",
    "Outro bloco teste",
  ]);
  const user = await add(
    "users",
    "employee_no,name,email,password_hash,role,sector,block_id",
    [
      "PCP-ADMIN",
      "Teste PCP",
      "pcp@example.test",
      "isolated-test-hash",
      "admin",
      "PCP",
      block,
    ],
  );
  const employee = await add(
    "users",
    "employee_no,name,email,password_hash,role,sector,block_id",
    [
      "PCP-EMP",
      "Produção teste",
      "pcp-emp@example.test",
      "isolated-test-hash",
      "funcionario",
      "Produção",
      block,
    ],
  );
  const other = await add(
    "users",
    "employee_no,name,email,password_hash,role,sector,block_id",
    [
      "PCP-OTHER",
      "Outra produção",
      "pcp-other@example.test",
      "isolated-test-hash",
      "funcionario",
      "Produção",
      otherBlock,
    ],
  );
  const source = await add("warehouses", "code,name,block_id,pcp_kind", [
    "PCP-ALM",
    "Almox teste PCP",
    block,
    "almoxarifado",
  ]);
  const production = await add("warehouses", "code,name,pcp_kind", [
    "PCP-PROD",
    "Produção teste PCP",
    "producao",
  ]);
  const part = Number(
    (await scoped.query("SELECT id FROM parts WHERE code='1794'")).rows[0].id,
  );
  const otherPart = Number(
    (await scoped.query("SELECT id FROM parts WHERE code='1796'")).rows[0].id,
  );
  const consumable = await add(
    "parts",
    "code,qr_code,name,location,material_kind",
    ["CONS-TEST", "CONS-TEST", "Consumível teste", "P1", "consumivel"],
  );
  const app = backend("./src/app")();
  const client = supertest(app);
  const embedded = process.argv.includes("--embedded")
    ? backend("./embedded.js").embeddedRequest
    : null;
  const token = (id) =>
    jwt.sign({}, env.jwt.secret, { subject: String(id), expiresIn: "1h" });
  async function api(method, path, body, expected = 200, actor = user) {
    const payload = body
      ? { ...body, requestKey: body.requestKey || randomUUID() }
      : undefined;
    let response;
    if (embedded)
      response = await embedded(path, {
        method: method.toUpperCase(),
        body: payload,
        token: token(actor),
      });
    else {
      let request = client[method](path).set(
        "Authorization",
        `Bearer ${token(actor)}`,
      );
      if (payload) request = request.send(payload);
      response = await request;
    }
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${JSON.stringify(response.body)}`,
    );
    return response.body.data;
  }
  const op = (
    method,
    path,
    body,
    expected = method === "post" ? 201 : 200,
    actor,
  ) => api(method, `/api/pcp/${path}`, body, expected, actor);
  const amount = async (warehouse) =>
    Number(
      (
        await scoped.query(
          "SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory WHERE part_id=$1 AND warehouse_id=$2",
          [part, warehouse],
        )
      ).rows[0].quantity,
    );
  const labels = (
    await scoped.query(
      "SELECT code,qr_code,name FROM parts WHERE code IN ('129','120','127','173','7988','17940','1794','1796','1795','5746')",
    )
  ).rows;
  assert.equal(labels.length, 10);
  assert.equal(await amount(source), 0);
  for (const label of labels) {
    const png = await QRCode.toBuffer(label.qr_code, {
      margin: 4,
      width: 320,
      errorCorrectionLevel: "M",
      maskPattern: 1,
    });
    for (const angle of [0, 90, 180, 270]) {
      const { data, info } = await sharp(png)
        .rotate(angle)
        .resize(240, 240)
        .removeAlpha()
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const luminance = new zxing.RGBLuminanceSource(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
      );
      const value = new zxing.MultiFormatReader()
        .decode(
          new zxing.BinaryBitmap(new zxing.HybridBinarizer(luminance)),
          new Map([[zxing.DecodeHintType.TRY_HARDER, true]]),
        )
        .getText();
      assert.equal(value, label.qr_code);
      const resolved = await api("post", "/api/products/resolve-code", {
        code: value,
      });
      assert.equal(resolved.material.code, label.code);
      assert.equal(resolved.material.name, label.name);
    }
  }
  pass(
    "10 etiquetas: 40 leituras de QR em quatro orientações resolvem código e produto exatos, sem saldo inventado",
  );
  await api(
    "post",
    "/api/products/resolve-code",
    { code: "nao-cadastrado" },
    404,
  );
  await op("patch", `produtos/${part}/qr`, {
    qrCode: "QR-PNEU-8-EXATO",
    confirmado: true,
  });
  assert.equal(
    (
      await api("post", "/api/products/resolve-code", {
        code: "QR-PNEU-8-EXATO",
      })
    ).material.code,
    "1794",
  );
  await op(
    "patch",
    `produtos/${otherPart}/qr`,
    { qrCode: "QR-PNEU-8-EXATO", confirmado: true },
    409,
  );
  await op(
    "patch",
    `produtos/${part}/qr`,
    { qrCode: "1796", confirmado: true },
    409,
  );
  await op(
    "patch",
    `produtos/${part}/qr`,
    { qrCode: "NEW", confirmado: false },
    422,
  );
  pass(
    "Vínculo QR exato, confirmação explícita, códigos desconhecidos e colisões entre produtos bloqueadas",
  );
  const photo = await sharp(randomBytes(1024 * 1024 * 3), {
    raw: { width: 1024, height: 1024, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  assert.ok(photo.length < 1_000_000);
  const encoded = `data:image/jpeg;base64,${photo.toString("base64")}`;
  assert.ok(
    encoded.length > 1_048_576,
    "Fixture exceeds the previous 1 MB JSON limit",
  );
  const savePhoto = {
    type: "savePart",
    warehouse: "Almox teste PCP",
    preserveQuantity: true,
    localQuantity: 0,
    part: {
      id: otherPart,
      code: "1796",
      qrCode: "1796",
      name: "Pneu maciço 10 polegadas",
      location: "P1",
      packSize: 1,
      minimum: 1,
      leadDays: 7,
      estimatedCost: 0,
      image: encoded,
      imageSource: "Foto da empresa",
      imageUsage: "Uso autorizado pela empresa",
      imageConfirmed: true,
    },
  };
  const photoResponse = await client
    .post("/api/workspace/actions")
    .set("Authorization", `Bearer ${token(user)}`)
    .send({ ...savePhoto, requestKey: randomUUID() });
  assert.equal(photoResponse.status, 200, JSON.stringify(photoResponse.body));
  assert.equal(
    (await scoped.query("SELECT image_url FROM parts WHERE id=$1", [otherPart]))
      .rows[0].image_url,
    encoded,
  );
  const invalidPhoto = await client
    .post("/api/workspace/actions")
    .set("Authorization", `Bearer ${token(user)}`)
    .send({
      ...savePhoto,
      requestKey: randomUUID(),
      part: { ...savePhoto.part, image: "blob:temporary-local-image" },
    });
  assert.equal(invalidPhoto.status, 422);
  pass(
    "Foto real acima do antigo limite JSON é persistida; URLs temporárias são rejeitadas sem substituir a foto",
  );
  const r = await op("post", "recebimentos", {
    itemId: part,
    notaFiscal: "NF-TEST",
    lote: "L-TEST",
    quantidadeNota: 20,
    pesoNota: 8.25,
  });
  await op(
    "post",
    "estoque/transferencias",
    {
      recebimentoId: r.id,
      destinoId: source,
      qrCode: "1794",
      quantidadeConferida: 20,
    },
    409,
  );
  const mismatch = await op("patch", `recebimentos/${r.id}/conferencia`, {
    quantidadeConferida: 19,
    pesoConferido: 8.25,
  });
  assert.equal(mismatch.status, "Pendente");
  await op(
    "patch",
    `recebimentos/${r.id}/validacao-qualidade`,
    { resultado: "aprovado", motivo: "Teste" },
    409,
  );
  await op(
    "post",
    `recebimentos/${r.id}/lancamento-totus`,
    { modo: "manual", referencia: "TOT-TEST" },
    409,
  );
  assert.equal(await amount(source), 0);
  await op("patch", `recebimentos/${r.id}/conferencia`, {
    quantidadeConferida: 20,
    pesoConferido: 8.2,
  });
  assert.equal((await op("get", `recebimentos/${r.id}`)).status, "Pendente");
  await op("patch", `recebimentos/${r.id}/conferencia`, {
    quantidadeConferida: 20,
    pesoConferido: 8.25,
  });
  await op(
    "patch",
    `recebimentos/${r.id}/validacao-qualidade`,
    { resultado: "aprovado", motivo: "Teste" },
    409,
  );
  await op(
    "post",
    `recebimentos/${r.id}/lancamento-totus`,
    { modo: "integracao", referencia: "TOT-TEST" },
    501,
  );
  await op("post", `recebimentos/${r.id}/lancamento-totus`, {
    modo: "manual",
    referencia: "TOT-TEST",
  });
  await op("patch", `recebimentos/${r.id}/validacao-qualidade`, {
    resultado: "aprovado",
    motivo: "Inspeção física aprovada",
  });
  await op(
    "post",
    "estoque/transferencias",
    {
      recebimentoId: r.id,
      destinoId: source,
      qrCode: "1796",
      quantidadeConferida: 20,
    },
    422,
  );
  const transfer = {
    recebimentoId: r.id,
    destinoId: source,
    qrCode: "QR-PNEU-8-EXATO",
    quantidadeConferida: 20,
    requestKey: randomUUID(),
  };
  await Promise.all([
    op("post", "estoque/transferencias", transfer),
    op("post", "estoque/transferencias", transfer),
  ]);
  assert.equal(await amount(source), 20);
  await op(
    "post",
    "estoque/transferencias",
    { ...transfer, requestKey: randomUUID() },
    409,
  );
  assert.equal(
    (await op("get", `recebimentos/${r.id}/status-qualidade`)).saldoLiberado,
    true,
  );
  pass(
    "Quantidade/peso divergentes bloqueiam saldo; Totus manual e aprovação liberam exatamente uma entrada, inclusive em envio concorrente",
  );
  const rejected = await op("post", "recebimentos", {
    itemId: part,
    notaFiscal: "NF-BAD",
    lote: "L-BAD",
    quantidadeNota: 2,
  });
  await op("patch", `recebimentos/${rejected.id}/conferencia`, {
    quantidadeConferida: 2,
  });
  await op("post", `recebimentos/${rejected.id}/lancamento-totus`, {
    modo: "manual",
    referencia: "TOT-BAD",
  });
  await op("patch", `recebimentos/${rejected.id}/validacao-qualidade`, {
    resultado: "reprovado",
    motivo: "Defeito confirmado",
  });
  await op(
    "post",
    "estoque/transferencias",
    {
      recebimentoId: rejected.id,
      destinoId: source,
      qrCode: "1794",
      quantidadeConferida: 2,
    },
    409,
  );
  pass("Lote reprovado continua bloqueado");
  const request = await op(
    "post",
    "requisicoes",
    {
      itemId: part,
      origemId: source,
      destinoId: production,
      quantidade: 5,
      centroCusto: "CC-TEST",
      ordemProducao: "OP-TEST",
    },
    201,
    employee,
  );
  await op("get", `requisicoes/${request.id}`, null, 403, other);
  await op("post", "recebimentos", { itemId: part }, 403, employee);
  await op("get", "recebimentos", null, 403, employee);
  await op(
    "post",
    "requisicoes",
    {
      itemId: part,
      origemId: source,
      destinoId: production,
      quantidade: 1,
      centroCusto: "CC",
    },
    403,
    other,
  );
  let v = await op("get", `requisicoes/${request.id}/validacao`);
  assert.equal(v.pedidoCompraSuficiente, false);
  await op("patch", `requisicoes/${request.id}/liberar`, {}, 409);
  await op(
    "post",
    "pedidos-compra",
    { requisicaoId: request.id, quantidade: 4, referencia: "PC-TEST" },
    422,
  );
  await op("post", "pedidos-compra", {
    requisicaoId: request.id,
    quantidade: 5,
    referencia: "PC-TEST",
  });
  await op(
    "patch",
    `requisicoes/${request.id}/confirmar-retirada`,
    { qrCode: "1796", quantidadeConferida: 5 },
    422,
  );
  await op("patch", `requisicoes/${request.id}/confirmar-retirada`, {
    qrCode: "1794",
    quantidadeConferida: 4,
  });
  await op("patch", `requisicoes/${request.id}/liberar`, {}, 409);
  await op("patch", `requisicoes/${request.id}/confirmar-retirada`, {
    qrCode: "1794",
    quantidadeConferida: 5,
  });
  v = await op("get", `requisicoes/${request.id}/validacao`);
  assert.equal(v.podeLiberar, true);
  await op("patch", `requisicoes/${request.id}/liberar`, {});
  assert.equal(
    (await op("get", `estoque/${part}/saldo?armazem=almoxarifado`)).disponivel,
    15,
  );
  assert.equal(await amount(source), 20);
  assert.equal(await amount(production), 0);
  await op(
    "post",
    "estoque/transferencias",
    {
      requisicaoId: request.id,
      etapa: "receber",
      qrCode: "1794",
      quantidadeConferida: 5,
    },
    409,
  );
  await op(
    "post",
    "estoque/transferencias",
    {
      requisicaoId: request.id,
      etapa: "expedir",
      qrCode: "1794",
      quantidadeConferida: 4,
    },
    422,
  );
  await op("post", "estoque/transferencias", {
    requisicaoId: request.id,
    etapa: "expedir",
    qrCode: "1794",
    quantidadeConferida: 5,
  });
  assert.equal(await amount(source), 15);
  assert.equal(await amount(production), 0);
  await op("post", "estoque/transferencias", {
    requisicaoId: request.id,
    etapa: "receber",
    qrCode: "1794",
    quantidadeConferida: 5,
  });
  assert.equal(await amount(production), 5);
  assert.equal(
    (await op("get", `requisicoes/${request.id}`)).status,
    "Transferida",
  );
  pass(
    "Produção: escopo, pedido, quantidade retirada, reserva, expedição e recebimento físico respeitam o fluxo sem duplicar saldo",
  );
  await scoped.query(
    "INSERT INTO inventory(part_id,warehouse_id,quantity) VALUES($1,$2,10)",
    [consumable, source],
  );
  const cr = await op(
    "post",
    "consumiveis/requisicoes",
    {
      itemId: consumable,
      origemId: source,
      quantidade: 3,
      centroCusto: "CC-TEST",
    },
    201,
    employee,
  );
  await op(
    "post",
    "requisicoes",
    {
      itemId: consumable,
      origemId: source,
      destinoId: production,
      quantidade: 3,
      centroCusto: "CC",
    },
    422,
  );
  await op(
    "post",
    "estoque/transferencias",
    {
      requisicaoId: cr.id,
      etapa: "expedir",
      qrCode: "CONS-TEST",
      quantidadeConferida: 3,
    },
    409,
  );
  const consume = {
    qrCode: "CONS-TEST",
    quantidadeConferida: 3,
    requestKey: randomUUID(),
  };
  await Promise.all([
    op("patch", `consumiveis/requisicoes/${cr.id}/baixa`, consume),
    op("patch", `consumiveis/requisicoes/${cr.id}/baixa`, consume),
  ]);
  assert.equal(
    Number(
      (
        await scoped.query(
          "SELECT quantity FROM inventory WHERE part_id=$1 AND warehouse_id=$2",
          [consumable, source],
        )
      ).rows[0].quantity,
    ),
    7,
  );
  assert.equal(
    Number(
      (
        await scoped.query(
          "SELECT COUNT(*) AS n FROM stock_transfers WHERE part_id=$1",
          [consumable],
        )
      ).rows[0].n,
    ),
    0,
  );
  assert.equal((await op("get", "consumiveis/categorias")).length, 1);
  pass(
    "Consumível: baixa direta e idempotente, sem transferência entre armazéns",
  );
  const receiptId = r.id;
  assert.equal(
    (await api("get", `/recebimentos/${receiptId}`)).status,
    "Transferido",
  );
  assert.equal(
    (await op("get", `estoque/${part}/historico-transferencias`)).transferencias
      .length,
    1,
  );
  pass(
    "Aliases das rotas da empresa e histórico usam os mesmos registros persistidos",
  );
  if (process.argv.includes("--ui")) {
    await mkdir(".validation/pcp", { recursive: true });
    const { chromium, expect } = await import("@playwright/test");
    apiServer = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => apiServer.once("listening", resolve));
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const webPort = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const base = `http://127.0.0.1:${webPort}`;
    webProcess = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", String(webPort)],
      {
        env: {
          ...process.env,
          BACKEND_URL: process.argv.includes("--embedded")
            ? "embedded"
            : `http://127.0.0.1:${apiServer.address().port}`,
          PORT: String(webPort),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let logs = "";
    webProcess.stdout.on("data", (chunk) => {
      logs = (logs + chunk).slice(-5000);
    });
    webProcess.stderr.on("data", (chunk) => {
      logs = (logs + chunk).slice(-5000);
    });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (webProcess.exitCode !== null) throw new Error(`Next falhou: ${logs}`);
      try {
        if ((await fetch(`${base}/parts/rol-6205-zz.webp`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Starting server. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Production Next server started");
    const manifest = JSON.parse(
      await readFile("public/parts/manifest.json", "utf8"),
    );
    for (const photo of manifest) {
      const response = await fetch(base + photo.path);
      assert.equal(response.status, 200);
      assert.ok((await response.arrayBuffer()).byteLength > 1000);
    }
    pass(
      "12 fotografias public/parts servidas com HTTP 200 pelo build de produção",
    );
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const sign = (value) =>
      createHmac("sha256", process.env.SESSION_SECRET)
        .update(value)
        .digest("hex");
    const payload = `PCP-ADMIN:${Date.now() + 3600000}:${sign("isolated-test-hash").slice(0, 24)}`;
    await context.addCookies([
      {
        name: "marcon_session",
        value: `${payload}:${sign(payload)}`,
        url: base,
        httpOnly: true,
      },
      {
        name: "marcon_api_token",
        value: token(user),
        url: base,
        httpOnly: true,
      },
    ]);
    const frontendPhoto = await context.request.post(`${base}/api/workspace`, {
      headers: { origin: base },
      data: { ...savePhoto, requestKey: randomUUID() },
    });
    assert.equal(frontendPhoto.status(), 200, await frontendPhoto.text());
    assert.equal(
      (
        await scoped.query("SELECT image_url FROM parts WHERE id=$1", [
          otherPart,
        ])
      ).rows[0].image_url,
      encoded,
    );
    pass(
      "Upload real acima de 1 MB em JSON persiste pela rota Next e pelo backend configurado",
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/admin/pcp`);
    await expect(page).toHaveURL(`${base}/admin/dashboard`);
    await expect(page.getByText(/PCP/i)).toHaveCount(0);
    await page
      .getByRole("button", { name: "Pesquisar peça por QR ou ID", exact: true })
      .click();
    const result = page
      .getByRole("region", { name: "Peça encontrada" })
      .getByRole("heading");
    const label = await context.request.get(`${base}/api/items/${part}/label`);
    assert.equal(label.status(), 200);
    const { data: qrData, info: qrInfo } = await sharp(await label.body())
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const reader = new zxing.MultiFormatReader();
    reader.setHints(new Map([[zxing.DecodeHintType.TRY_HARDER, true]]));
    assert.equal(
      reader
        .decodeWithState(
          new zxing.BinaryBitmap(
            new zxing.HybridBinarizer(
              new zxing.RGBLuminanceSource(
                new Uint8ClampedArray(qrData),
                qrInfo.width,
                qrInfo.height,
              ),
            ),
          ),
        )
        .getText(),
      "QR-PNEU-8-EXATO",
    );
    const png = await QRCode.toBuffer("1796", {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
      maskPattern: 1,
    });
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "etiqueta-1796.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(result).toContainText("1796", { timeout: 30000 });
    const cameraPng = await QRCode.toBuffer("QR-PNEU-8-EXATO", {
      width: 360,
      margin: 4,
      errorCorrectionLevel: "M",
      maskPattern: 1,
    });
    await page.evaluate((data) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const image = new Image();
          image.src = "data:image/png;base64," + data;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 960;
          canvas.height = 720;
          const draw = () => {
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, 960, 720);
            ctx.drawImage(image, 300, 180, 360, 360);
          };
          draw();
          const stream = canvas.captureStream(6);
          const timer = setInterval(draw, 150);
          window.pcpTestCamera = { stream, timer };
          return stream;
        },
      });
    }, cameraPng.toString("base64"));
    await page
      .getByRole("button", { name: "Escanear QR / barras", exact: true })
      .first()
      .click();
    await expect(result).toContainText("1794", { timeout: 30000 });
    await page.waitForFunction(() =>
      window.pcpTestCamera?.stream
        .getTracks()
        .every((t) => t.readyState === "ended"),
    );
    await page.evaluate(() => clearInterval(window.pcpTestCamera.timer));
    await page.screenshot({
      path: ".validation/pcp/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".validation/pcp/mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      "No horizontal overflow on mobile",
    );
    assert.deepEqual(errors, []);
    pass(
      "Navegador real: PCP redirecionado, pesquisa por imagem e câmera simulada, encerramento dos tracks, etiqueta SVG e tela móvel",
    );
  }
  await mkdir(".validation/pcp", { recursive: true });
  await writeFile(
    ".validation/pcp/evidence.json",
    JSON.stringify(
      { checks, isolatedSchema: schema, originalDataChanged: false },
      null,
      2,
    ),
  );
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      console.log(
        "UI scanners:",
        await page.locator(".code-scanner").allTextContents(),
      );
      await page
        .screenshot({ path: ".validation/pcp/failure.png", fullPage: true })
        .catch(() => {});
    }
  }
  throw error;
} finally {
  await browser?.close();
  if (webProcess) {
    webProcess.kill();
    if (webProcess.exitCode === null)
      await new Promise((resolve) => webProcess.once("exit", resolve));
  }
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  await domain?.closeDatabase();
  await scoped.end();
  if (created) {
    assert.match(schema, /^marcon_pcp_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await admin.end();
  process.env.DATABASE_URL = originalUrl;
}
