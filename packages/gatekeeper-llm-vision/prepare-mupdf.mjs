import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, "node_modules", "mupdf", "dist", "mupdf-wasm.wasm");
const target = join(root, "src", "generated", "mupdf-wasm.wasm");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
