const Module = require("node:module");

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id, ...args) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args]);
};
