#!/usr/bin/env bash
#
# Corre la comparación SQL ↔ TypeScript del agrupado de jornadas.
#
# `comparar-jornadas-sql-ts.mjs` necesita `fichadas.ts` ya compilado a
# CommonJS, y compilarlo a mano tiene dos trampas: hay que resolver el
# alias `@/` (si no, `require('@/lib/fechas')` explota en tiempo de
# ejecución) y hay que reescribirlo a una ruta relativa, porque tsc lo
# deja tal cual en el JS emitido.
#
# Eso hacía que el script existiera pero nadie lo corriera, que es
# exactamente lo que no queremos de una comparación cuya razón de ser es
# avisar cuando las dos implementaciones de "qué es una jornada" se
# separan. Con esto es un comando:
#
#   bash scripts/comparar-jornadas.sh
#
# Requiere un Postgres con las migraciones aplicadas. Por defecto apunta
# al de `supabase start`; se puede pisar con PG_URL.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SALIDA="$(mktemp -d)"
trap 'rm -rf "$SALIDA"' EXIT

PG_URL="${PG_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

cat > "$SALIDA/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "outDir": "$SALIDA/js",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "baseUrl": "$RAIZ",
    "paths": { "@/*": ["src/*"] }
  },
  "files": ["$RAIZ/src/lib/fichadas.ts"]
}
JSON

npx tsc -p "$SALIDA/tsconfig.json"

# tsc resuelve el alias para tipar, pero emite el `require` con el alias
# intacto. Node no sabe qué es `@/lib/fechas`.
node -e '
  const fs = require("fs");
  const f = process.argv[1];
  fs.writeFileSync(f, fs.readFileSync(f, "utf8")
    .replace(/require\("@\/lib\//g, "require(\"./")
    .replace(/require\("@\/types\//g, "require(\"../types/"));
' "$SALIDA/js/lib/fichadas.js"

PG_URL="$PG_URL" TS_FICHADAS="$SALIDA/js/lib/fichadas.js" \
  node "$RAIZ/scripts/comparar-jornadas-sql-ts.mjs"
