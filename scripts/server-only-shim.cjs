// Shim Next.js's virtual "server-only" import so registry modules
// can be loaded from a node script for diagnostics + tests.
const Module = require("node:module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "server-only") {
    return require.resolve("./empty-shim.cjs", { paths: [__dirname] });
  }
  return orig.call(this, request, parent, ...rest);
};
