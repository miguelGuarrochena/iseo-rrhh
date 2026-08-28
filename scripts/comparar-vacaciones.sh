#!/usr/bin/env bash
#
# Compara el cálculo legal de vacaciones SQL ↔ TypeScript.
#
# Mismo montaje que `comparar-jornadas.sh`: compila `vacaciones.ts` a
# CommonJS resolviendo el alias `@/`, que tsc deja intacto en el `require`
# emitido, y corre las dos implementaciones sobre los mismos casos.
#
#   bash scripts/comparar-vacaciones.sh
#
# Requiere un Postgres con las migraciones aplicadas. Por defecto apunta al
# de `supabase start`; se puede pisar con PG_URL.
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
  "files": ["$RAIZ/src/lib/vacaciones.ts"]
}
JSON

npx tsc -p "$SALIDA/tsconfig.json"

node -e '
  const fs = require("fs");
  const f = process.argv[1];
  fs.writeFileSync(f, fs.readFileSync(f, "utf8")
    .replace(/require\("@\/lib\//g, "require(\"./")
    .replace(/require\("@\/types\//g, "require(\"../types/"));
' "$SALIDA/js/lib/vacaciones.js"

PG_URL="$PG_URL" TS_VACACIONES="$SALIDA/js/lib/vacaciones.js" \
  node "$RAIZ/scripts/comparar-vacaciones-sql-ts.mjs"
