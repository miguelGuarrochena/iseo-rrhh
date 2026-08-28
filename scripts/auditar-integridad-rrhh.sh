#!/usr/bin/env bash
#
# Auditoría de integridad de datos de RRHH. SOLO LECTURA.
#
# Compila `vacaciones.ts` para que la sección de saldos use el cálculo real
# del producto y no una reimplementación.
#
#   bash scripts/auditar-integridad-rrhh.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SALIDA="$(mktemp -d)"
trap 'rm -rf "$SALIDA"' EXIT

cat > "$SALIDA/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "module": "commonjs", "target": "es2020", "outDir": "$SALIDA/js",
    "skipLibCheck": true, "esModuleInterop": true,
    "baseUrl": "$RAIZ", "paths": { "@/*": ["src/*"] }
  },
  "files": ["$RAIZ/src/lib/vacaciones.ts"]
}
JSON

npx tsc -p "$SALIDA/tsconfig.json"
node -e '
  const fs = require("fs"); const f = process.argv[1];
  fs.writeFileSync(f, fs.readFileSync(f, "utf8")
    .replace(/require\("@\/lib\//g, "require(\"./")
    .replace(/require\("@\/types\//g, "require(\"../types/"));
' "$SALIDA/js/lib/vacaciones.js"

cd "$RAIZ"
TS_VACACIONES="$SALIDA/js/lib/vacaciones.js" \
  node "$RAIZ/scripts/auditar-integridad-rrhh.mjs"
