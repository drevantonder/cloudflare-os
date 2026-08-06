import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(root, "node_modules", "mupdf", "dist");
const targetDirectory = join(root, "src", "generated");
mkdirSync(targetDirectory, { recursive: true });

const wasmSource = join(sourceDirectory, "mupdf-wasm.wasm");
const wasmTarget = join(targetDirectory, "mupdf-wasm.wasm");
if (!existsSync(wasmTarget) || !readFileSync(wasmSource).equals(readFileSync(wasmTarget))) {
  copyFileSync(wasmSource, wasmTarget);
}

writeIfChanged(
  join(targetDirectory, "lib.mupdf.js"),
  replaceRequired(
    readFileSync(join(sourceDirectory, "mupdf.js"), "utf8"),
    `var node_fs = null;\nif (typeof process !== "undefined" && process.versions && process.versions.node)\n\tnode_fs = await import("node:fs");`,
    "var node_fs = null;",
  ),
);

writeIfChanged(
  join(targetDirectory, "mupdf-wasm.js"),
  replaceRequired(
    replaceRequired(
      readFileSync(join(sourceDirectory, "mupdf-wasm.js"), "utf8"),
      `if(m){const{createRequire:_}=await import("module");var o=_(import.meta.url)}`,
      "if(m){}",
    ),
    `m="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node&&"renderer"!=process.type`,
    "m=!1",
  ),
);

function writeIfChanged(path, content) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content);
}

function replaceRequired(content, search, replacement) {
  if (!content.includes(search)) throw new Error("The installed MuPDF loader has changed.");
  return content.replace(search, replacement);
}
