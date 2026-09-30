"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var workspace_actions_exports = {};
__export(workspace_actions_exports, {
  ActionError: () => import_permissions2.ActionError,
  executeWorkspaceAction: () => executeWorkspaceAction
});
module.exports = __toCommonJS(workspace_actions_exports);
var import_db = require("./db");
var import_password = require("./password");
var import_permissions = require("./permissions");
var import_permissions2 = require("./permissions");
var import_inventory_actions = require("./inventory-actions");
function requireRole(user, roles) {
  if (!roles.includes(user.role))
    throw new import_permissions.ActionError("Perfil sem permiss\xE3o para esta a\xE7\xE3o.", 403);
}
function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function one(connection, sql, params) {
  const [rows] = await connection.execute(
    sql,
    params
  );
  return rows[0];
}
async function actorId(connection, user) {
  const actor = await one(
    connection,
    "SELECT id FROM users WHERE employee_no = ? AND active = TRUE",
    [user.id]
  );
  if (!actor) throw new import_permissions.ActionError("Sess\xE3o inv\xE1lida.", 401);
  return Number(actor.id);
}
async function audit(connection, actor, entity, id, action, details) {
  await connection.execute(
    "INSERT INTO audit_log (actor_id, entity_type, entity_id, action, details) VALUES (?, ?, ?, ?, ?)",
    [actor, entity, id, action, JSON.stringify(details)]
  );
}
const roleCodes = {
  Administrador: "admin",
  "L\xEDder de bloco": "lider",
  Almoxarife: "almoxarifado",
  Funcion\u00E1rio: "funcionario"
};
async function executeWorkspaceAction(user, input, connection) {
  function run(work) {
    return connection ? work(connection) : (0, import_db.transaction)(work);
  }
  if (!input || typeof input !== "object" || !("type" in input))
    throw new import_permissions.ActionError("A\xE7\xE3o inv\xE1lida.");
  if (import_inventory_actions.inventoryActions.has(String(input.type)))
    return (0, import_inventory_actions.executeInventoryAction)(
      user,
      input,
      connection
    );
  const action = input;
  switch (action.type) {
    case "saveUser": {
      requireRole(user, ["admin"]);
      const data = action.user;
      if (!data || typeof data !== "object")
        throw new import_permissions.ActionError("Dados do usu\xE1rio inv\xE1lidos.");
      const employeeNo = text(data.id, 30);
      const name = text(data.name, 120);
      const email = text(data.email, 190).toLowerCase();
      const sector = text(data.sector, 80);
      const role = Object.hasOwn(roleCodes, String(data.role)) ? roleCodes[String(data.role)] : void 0;
      const blockName = text(data.block, 80);
      const active = data.active === false ? 0 : 1;
      if (!/^[A-Za-z0-9_-]{1,30}$/.test(employeeNo) || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !sector || !role)
        throw new import_permissions.ActionError(
          "Confira matr\xEDcula, nome, e-mail, setor e fun\xE7\xE3o."
        );
      if (["funcionario", "lider"].includes(role) && !blockName)
        throw new import_permissions.ActionError("Defina o bloco de atua\xE7\xE3o.");
      const password = typeof action.password === "string" ? action.password : "";
      if (!action.editingId && password.length < 12)
        throw new import_permissions.ActionError(
          "A senha inicial deve ter pelo menos 12 caracteres."
        );
      if (password && password.length < 12)
        throw new import_permissions.ActionError(
          "A nova senha deve ter pelo menos 12 caracteres."
        );
      if ((action.editingId === user.id || employeeNo === user.id) && (!active || role !== "admin"))
        throw new import_permissions.ActionError(
          "N\xE3o altere o pr\xF3prio perfil ou status de administrador."
        );
      return run(async (connection2) => {
        const actor = await actorId(connection2, user);
        const duplicate = await one(
          connection2,
          "SELECT employee_no,email FROM users WHERE (employee_no=? OR email=?) AND employee_no<>? LIMIT 1 FOR UPDATE",
          [employeeNo, email, action.editingId ?? ""]
        );
        if (duplicate?.employee_no === employeeNo)
          throw new import_permissions.ActionError("Esta matr\xEDcula j\xE1 est\xE1 cadastrada.", 409);
        if (String(duplicate?.email ?? "").toLowerCase() === email)
          throw new import_permissions.ActionError("Este e-mail j\xE1 est\xE1 cadastrado.", 409);
        const block = blockName ? await one(connection2, "SELECT id FROM blocks WHERE name = ?", [
          blockName
        ]) : null;
        if (blockName && !block) throw new import_permissions.ActionError("Bloco inv\xE1lido.");
        const blockId = ["funcionario", "lider"].includes(role) ? block?.id ?? null : null;
        if (action.editingId) {
          const existing = await one(
            connection2,
            "SELECT id FROM users WHERE employee_no = ? FOR UPDATE",
            [action.editingId]
          );
          if (!existing) throw new import_permissions.ActionError("Usu\xE1rio n\xE3o encontrado.", 404);
          if (password) {
            await connection2.execute(
              "UPDATE users SET employee_no = ?, name = ?, email = ?, sector = ?, role = ?, block_id = ?, active = ?, password_hash = ? WHERE id = ?",
              [
                employeeNo,
                name,
                email,
                sector,
                role,
                blockId,
                active,
                (0, import_password.hashPassword)(password),
                existing.id
              ]
            );
          } else {
            await connection2.execute(
              "UPDATE users SET employee_no = ?, name = ?, email = ?, sector = ?, role = ?, block_id = ?, active = ? WHERE id = ?",
              [
                employeeNo,
                name,
                email,
                sector,
                role,
                blockId,
                active,
                existing.id
              ]
            );
          }
          await audit(
            connection2,
            actor,
            "user",
            Number(existing.id),
            "update",
            { employeeNo, role, blockName }
          );
          return { id: Number(existing.id) };
        }
        const [result] = await connection2.execute(
          "INSERT INTO users (employee_no, name, email, password_hash, sector, role, block_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            employeeNo,
            name,
            email,
            (0, import_password.hashPassword)(password),
            sector,
            role,
            blockId,
            active
          ]
        );
        await audit(connection2, actor, "user", result.insertId, "create", {
          employeeNo,
          role,
          blockName
        });
        return { id: result.insertId };
      });
    }
    case "toggleUser": {
      requireRole(user, ["admin"]);
      if (typeof action.active !== "boolean")
        throw new import_permissions.ActionError("Status do usu\xE1rio inv\xE1lido.");
      const employeeNo = text(action.id, 30);
      if (employeeNo === user.id && !action.active)
        throw new import_permissions.ActionError("N\xE3o \xE9 poss\xEDvel desativar a pr\xF3pria conta.");
      return run(async (connection2) => {
        const actor = await actorId(connection2, user);
        const target = await one(
          connection2,
          "SELECT id FROM users WHERE employee_no = ? FOR UPDATE",
          [employeeNo]
        );
        if (!target) throw new import_permissions.ActionError("Usu\xE1rio n\xE3o encontrado.", 404);
        await connection2.execute("UPDATE users SET active = ? WHERE id = ?", [
          action.active ? 1 : 0,
          target.id
        ]);
        await audit(
          connection2,
          actor,
          "user",
          Number(target.id),
          action.active ? "activate" : "deactivate",
          {}
        );
        return { id: Number(target.id) };
      });
    }
    case "updatePrice": {
      requireRole(user, ["admin", "almoxarifado"]);
      const price = Number(action.price);
      if (!Number.isFinite(price) || price < 0 || price > 9999999999)
        throw new import_permissions.ActionError("Pre\xE7o inv\xE1lido.");
      return run(async (connection2) => {
        const actor = await actorId(connection2, user);
        const part = await one(
          connection2,
          "SELECT id FROM parts WHERE code = ? AND active = TRUE",
          [text(action.code, 64)]
        );
        if (!part) throw new import_permissions.ActionError("Pe\xE7a n\xE3o encontrada.", 404);
        await connection2.execute(
          "UPDATE parts SET reference_unit_price = ? WHERE id = ?",
          [price, part.id]
        );
        await audit(connection2, actor, "part", Number(part.id), "price", {
          price
        });
        return { ok: true };
      });
    }
    default:
      throw new import_permissions.ActionError("A\xE7\xE3o n\xE3o reconhecida.");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ActionError,
  executeWorkspaceAction
});
