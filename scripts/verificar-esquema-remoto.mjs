/**
 * ¿Hasta dónde llegó el esquema de la base remota?
 *
 * Hace falta antes de usar el CLI por primera vez. `supabase migration
 * list` muestra la columna `remote` vacía en todas: no significa que la
 * base esté vacía, sino que las migraciones se aplicaron a mano por el
 * editor SQL y nadie las anotó en el historial. Si se corre `db push` con
 * ese historial en blanco, el CLI intenta reaplicar las 54 desde cero
 * sobre una base que ya las tiene.
 *
 * Este chequeo pregunta por objetos concretos de las últimas migraciones
 * usando el catálogo que publica PostgREST. Sólo lee.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY;

if (!url || !clave) {
  console.error('Faltan las variables. Usá: node --env-file=.env <script>');
  process.exit(1);
}

/** Objeto que introdujo cada migración reciente, para ir a buscarlo. */
const HITOS = [
  { migracion: '(control) tabla de siempre', tabla: 'empleados' },
  { migracion: '47 jornadas por sesión', rpc: 'jornadas_de_empresa' },
  { migracion: '47 jornadas por sesión', rpc: 'fichajes_del_periodo' },
  { migracion: '49 fichaje facial validado', rpc: 'fichar_con_rostro' },
  { migracion: '53 documento de firma atómico', rpc: 'crear_documento_firma' },
  { migracion: 'cumpleaños del equipo', rpc: 'cumples_de_empresa' },
  { migracion: 'vacaciones del sector', rpc: 'vacaciones_aprobadas_mi_sector' },
];

const main = async () => {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  });
  if (!res.ok) throw new Error(`El catálogo respondió ${res.status}`);
  const { paths } = await res.json();
  const rutas = new Set(Object.keys(paths ?? {}));

  console.log('\nObjetos de las últimas migraciones en la base remota:\n');
  let faltantes = 0;
  for (const hito of HITOS) {
    const ruta = hito.rpc ? `/rpc/${hito.rpc}` : `/${hito.tabla}`;
    const esta = rutas.has(ruta);
    if (!esta) faltantes += 1;
    console.log(`  ${esta ? '✓' : '✗'} ${hito.migracion}  (${ruta})`);
  }

  console.log(
    faltantes === 0
      ? '\nEl esquema remoto ya tiene lo de las migraciones locales: el\n' +
          'historial hay que marcarlo como aplicado, no reaplicarlo.\n'
      : `\nFaltan ${faltantes} objetos. NO marques el historial como aplicado\n` +
          'sin revisar cuáles migraciones realmente corrieron.\n'
  );
};

main().catch((err) => {
  console.error(`\nNo se pudo verificar: ${err.message}\n`);
  process.exit(1);
});
