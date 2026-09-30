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
var permissions_exports = {};
__export(permissions_exports, {
  ActionError: () => ActionError,
  can: () => can,
  demand: () => demand,
  integer: () => integer,
  permissions: () => permissions,
  reason: () => reason,
  text: () => text
});
module.exports = __toCommonJS(permissions_exports);
class ActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const permissions = {
  admin: ["approve", "stock", "people", "map", "planning", "history"],
  lider: ["approve", "history"],
  almoxarifado: ["stock", "planning", "history"],
  funcionario: ["request", "history"]
};
const can = (role, permission) => permissions[role].includes(permission);
function demand(user, permission) {
  if (!can(user.role, permission))
    throw new ActionError("Perfil sem permiss\xE3o para esta a\xE7\xE3o.", 403);
}
function integer(value, min = 1) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > 1e9)
    throw new ActionError("Quantidade inv\xE1lida.");
  return value;
}
function text(value, max = 1e3) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function reason(value) {
  const result = text(value);
  if (result.length < 3)
    throw new ActionError(
      "Informe uma justificativa com pelo menos 3 caracteres."
    );
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ActionError,
  can,
  demand,
  integer,
  permissions,
  reason,
  text
});
