// Internal transport for Next's Node.js functions. No port, HTTP server or
// public route is created. Reuse the API's controllers, JWT checks and validators.
const auth = require("./src/controllers/authController");
const workspace = require("./src/controllers/workspaceController");
const catalog = require("./src/controllers/catalogController");
const { authenticate } = require("./src/middlewares/auth");
const { validate } = require("./src/middlewares/validate");
const { loginBody } = require("./src/schemas");
const { errorHandler } = require("./src/middlewares/errorHandler");
const { ActionError } = require("./src/workspace/permissions");
const AppError = require("./src/utils/AppError");
const { partsConsumption } = require("./src/workspace/parts-consumption");
const { pcpOperation } = require("./src/workspace/pcp");
const { success } = require("./src/utils/response");
const {
  industrialLinks,
  configureIndustrialLink,
} = require("./src/workspace/industrial-links");

function domainHandler(work) {
  return async (req, res) => {
    try {
      res.json(await work(req));
    } catch (error) {
      if (error instanceof ActionError)
        throw new AppError(error.status, error.message);
      throw error;
    }
  };
}

const routes = new Map([
  [
    "GET /health",
    [
      (_req, res) =>
        res.json({ service: "marcon-backend", transport: "embedded" }),
    ],
  ],
  ["POST /login", [validate(loginBody), auth.login]],
  ["POST /login/face", [auth.loginFace]],
  ["GET /api/workspace/snapshot", [authenticate, workspace.snapshot]],
  ["GET /api/workspace/transfers", [authenticate, workspace.transfers]],
  ["POST /api/workspace/actions", [authenticate, workspace.actions]],
  ["POST /api/products/resolve-code", [authenticate, catalog.resolveCode]],
  [
    "GET /api/parts/consumption",
    [
      authenticate,
      domainHandler((req) =>
        partsConsumption(req.user, new URLSearchParams(req.query)),
      ),
    ],
  ],
  [
    "GET /api/industrial-links",
    [authenticate, domainHandler((req) => industrialLinks(req.user))],
  ],
  [
    "POST /api/industrial-links",
    [
      authenticate,
      domainHandler((req) => configureIndustrialLink(req.user, req.body)),
    ],
  ],
]);

/**
 * @param {string} path
 * @param {{method?: string, body?: unknown, token?: string}} options
 */
async function embeddedRequest(path, { method = "GET", body, token } = {}) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  )
    return { status: 400, body: { error: "Rota inválida." } };
  const url = new URL(path, "http://marcon.internal");
  let handlers = routes.get(`${method} ${url.pathname}`);
  let params = {};
  if (!handlers && method === "GET") {
    const product = url.pathname.match(/^\/api\/products\/(\d+)$/);
    if (product) {
      params = { id: product[1] };
      handlers = [authenticate, catalog.getProduct];
    }
  }
  if (
    !handlers &&
    ["GET", "POST", "PATCH"].includes(method) &&
    (url.pathname.startsWith("/api/pcp/") ||
      /^\/(?:recebimentos|requisicoes|pedidos-compra|estoque|consumiveis)(?:\/|$)/.test(
        url.pathname,
      ))
  ) {
    handlers = [
      authenticate,
      async (req, res) => {
        try {
          const path = url.pathname
            .replace(/^\/(?:api\/pcp\/)?/, "")
            .split("/")
            .filter(Boolean);
          const data = await pcpOperation(
            req.user,
            method,
            path,
            req.body,
            url.searchParams,
          );
          success(res, method === "POST" ? 201 : 200, data);
        } catch (error) {
          if (error instanceof ActionError)
            throw new AppError(error.status, error.message);
          throw error;
        }
      },
    ];
  }
  if (!handlers)
    return { status: 404, body: { error: "Rota não encontrada." } };
  // Match the HTTP JSON boundary; prevent controllers from changing caller data.
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (serialized && Buffer.byteLength(serialized) > 2 * 1024 * 1024)
    return { status: 413, body: { error: "Dados excedem o limite de 2 MB." } };
  const req = {
    body: serialized === undefined ? undefined : JSON.parse(serialized),
    query: Object.fromEntries(url.searchParams),
    params,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const result = { status: 200, body: null };
  const res = {
    headersSent: false,
    status(code) {
      result.status = code;
      return this;
    },
    set() {
      return this;
    },
    json(data) {
      result.body = data;
      this.headersSent = true;
      return this;
    },
  };
  async function run(index) {
    if (res.headersSent || index === handlers.length) return;
    let continuation;
    const next = (error) => {
      continuation = error ? Promise.reject(error) : run(index + 1);
      // Middleware can call next before its own async promise settles.
      continuation.catch(() => {});
    };
    await handlers[index](req, res, next);
    if (continuation) await continuation;
  }
  try {
    await run(0);
  } catch (error) {
    errorHandler(error, req, res, (error) => {
      throw error;
    });
  }
  return result;
}

module.exports = { embeddedRequest };
