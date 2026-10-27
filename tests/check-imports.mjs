// Comprueba que cada nombre importado exista de verdad en el módulo de origen.
//
// Hace falta porque los archivos de lib/*.js usan sintaxis de módulo dentro de un paquete
// que no lo es, así que Node no los puede importar y las pruebas no los alcanzan. Un
// nombre mal escrito en un import no se vería hasta el despliegue.
import fs from "node:fs";
import path from "node:path";

const ARCHIVOS = [
  "lib/intervals-pull.js",
  "lib/intervals-read.mjs",
  "lib/intervals-push.js",
  "lib/muro-servidor.js",
  "app/api/muro/route.js",
  "app/api/intervals/route.js",
  "app/api/cron/route.js",
  "app/api/data/route.js",
  "lib/pagos-servidor.js",
  "app/api/pagos/route.js",
  "components/pagos.jsx",
  "app/page.jsx",
];

const EXTERNOS = /^(next|react|lucide-react|node:)/;
const IMPORT = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;

function exportsDe(archivo) {
  const s = fs.readFileSync(archivo, "utf8");
  const nombres = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) nombres.add(m[1]);
  for (const m of s.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) nombres.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const trozo of m[1].split(",")) {
      const t = trozo.trim().split(/\s+as\s+/).pop().trim();
      if (t) nombres.add(t);
    }
  }
  return nombres;
}

function resolver(desde, destino) {
  const base = path.resolve(path.dirname(desde), destino);
  for (const cand of [base, base + ".js", base + ".mjs", base + ".jsx"]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

let revisados = 0;
const problemas = [];

for (const archivo of ARCHIVOS) {
  if (!fs.existsSync(archivo)) { problemas.push(`${archivo}: no existe`); continue; }
  const s = fs.readFileSync(archivo, "utf8");
  for (const m of s.matchAll(IMPORT)) {
    const [, lista, origen] = m;
    if (EXTERNOS.test(origen)) continue;
    const resuelto = resolver(archivo, origen);
    if (!resuelto) { problemas.push(`${archivo} → ${origen}: no se encuentra el archivo`); continue; }
    const disponibles = exportsDe(resuelto);
    for (const trozo of lista.split(",")) {
      const nombre = trozo.trim().split(/\s+as\s+/)[0].trim();
      if (!nombre) continue;
      revisados++;
      if (!disponibles.has(nombre)) {
        problemas.push(`${archivo} importa "${nombre}" de ${origen}, que no lo exporta`);
      }
    }
  }
}

console.log(`${revisados} nombres importados comprobados.`);
if (problemas.length) {
  console.log("\nProblemas:");
  for (const p of problemas) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("Todos los enlaces entre módulos cuadran.");
