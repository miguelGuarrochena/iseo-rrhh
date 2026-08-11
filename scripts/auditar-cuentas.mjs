/**
 * Radiografía de las cuentas contra la base real. Sólo lee.
 *
 * Contesta las tres preguntas que en la app no se ven todas juntas:
 *
 *   1. ¿Hay algún colaborador con más de una cuenta vinculada? Es lo que
 *      bloquea la migración del legajo único, y mientras exista esas dos
 *      personas comparten recibos, ficha y ausencias.
 *   2. ¿Qué cuentas quedaron a medias? Existen en `auth.users` pero no en
 *      `public.usuarios`: entran y ven "tu cuenta no tiene perfil".
 *   3. ¿Quién tiene cuenta pero no está vinculado a su legajo? Es el caso
 *      que se veía como "le llegó el mail pero no figura de alta".
 *
 * Uso:
 *   node --env-file=.env scripts/auditar-cuentas.mjs
 *   node --env-file=.env scripts/auditar-cuentas.mjs --reparar
 *
 * Sin `--reparar` no escribe nada. Con `--reparar` completa el alta de las
 * cuentas a medias, que es lo mismo que hace el botón de Permisos: sirve
 * para las que quedaron rotas antes de que ese botón existiera.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY;

if (!url || !clave) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.\n' +
      'Corré: node --env-file=.env scripts/auditar-cuentas.mjs'
  );
  process.exit(1);
}

const REPARAR = process.argv.includes('--reparar');

const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}` };

const pedir = async (ruta) => {
  const res = await fetch(`${url}${ruta}`, { headers: cabeceras });
  if (!res.ok) {
    throw new Error(`${ruta} respondió ${res.status}: ${await res.text()}`);
  }
  return res.json();
};

const crearPerfil = async (fila) => {
  const res = await fetch(`${url}/rest/v1/usuarios`, {
    method: 'POST',
    headers: {
      ...cabeceras,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fila),
  });
  return res.ok ? null : `${res.status} ${await res.text()}`;
};

// La API de auth pagina de a 50 si no se le pide otra cosa.
const traerAuthUsers = async () => {
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const { users } = await pedir(
      `/auth/v1/admin/users?page=${pagina}&per_page=200`
    );
    todos.push(...users);
    if (users.length < 200) return todos;
  }
};

const titulo = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

const main = async () => {
  const [authUsers, perfiles, empleados, empresas] = await Promise.all([
    traerAuthUsers(),
    pedir('/rest/v1/usuarios?select=id,email,rol,empresa_id,empleado_id'),
    pedir('/rest/v1/empleados?select=id,nombre,apellido,email,empresa_id'),
    pedir('/rest/v1/empresas?select=id,nombre'),
  ]);

  const nombreEmpresa = (id) =>
    empresas.find((e) => e.id === id)?.nombre ?? '(sin empresa)';
  const nombreEmpleado = (id) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : `(legajo inexistente ${id})`;
  };

  console.log(
    `\nBase: ${url.replace(/https:\/\/([^.]+).*/, '$1')}\n` +
      `${authUsers.length} cuentas en auth · ${perfiles.length} perfiles · ` +
      `${empleados.length} colaboradores · ${empresas.length} empresas`
  );

  titulo('1. Colaboradores con más de una cuenta');
  const porEmpleado = new Map();
  for (const p of perfiles) {
    if (!p.empleado_id) continue;
    porEmpleado.set(p.empleado_id, [
      ...(porEmpleado.get(p.empleado_id) ?? []),
      p,
    ]);
  }
  const duplicados = [...porEmpleado].filter(([, ps]) => ps.length > 1);
  if (duplicados.length === 0) {
    console.log('Ninguno. La migración del legajo único se puede aplicar.');
  } else {
    console.log(
      'HAY QUE RESOLVERLOS ANTES DE LA MIGRACIÓN. Desvinculá la cuenta que\n' +
        'sobre desde Permisos → Gestionar en cada caso:'
    );
    for (const [empleadoId, ps] of duplicados) {
      console.log(`\n  ${nombreEmpleado(empleadoId)} (${empleadoId})`);
      for (const p of ps) console.log(`    · ${p.email} — rol ${p.rol}`);
    }
  }

  titulo('2. Cuentas sin perfil (entran y no ven nada)');
  const sinPerfil = authUsers.filter(
    (u) => !perfiles.some((p) => p.id === u.id)
  );
  if (sinPerfil.length === 0) {
    console.log('Ninguna.');
  } else {
    for (const u of sinPerfil) {
      const entro = u.last_sign_in_at ? 'ya entró' : 'nunca entró';
      const meta = u.user_metadata ?? {};
      console.log(
        `  · ${u.email} — ${entro}, invitada ${(u.invited_at ?? '').slice(0, 10)}`
      );
      console.log(
        `      rol: ${meta.rol ?? '—'} · empresa: ${
          meta.empresa_id ? nombreEmpresa(meta.empresa_id) : '— FALTA'
        } · legajo: ${
          meta.empleado_id ? nombreEmpleado(meta.empleado_id) : '— FALTA'
        }`
      );
    }
    if (!REPARAR) {
      console.log(
        '\n  Se arreglan desde Permisos → "Cuentas que quedaron a medias" →\n' +
          '  "Completar el alta". Para hacerlo desde acá: agregá --reparar.'
      );
    } else {
      console.log('\n  Completando el alta de cada una:');
      const legajosTomados = new Set(
        perfiles.map((p) => p.empleado_id).filter(Boolean)
      );
      for (const u of sinPerfil) {
        const meta = u.user_metadata ?? {};
        const rol = meta.rol ?? '';
        const empresaId = meta.empresa_id ?? '';
        const empleadoId = meta.empleado_id || null;

        if (!['admin_rrhh', 'supervisor', 'empleado'].includes(rol)) {
          console.log(`    ✗ ${u.email}: la invitación no dice el rol.`);
          continue;
        }
        if (!empresas.some((e) => e.id === empresaId)) {
          console.log(
            `    ✗ ${u.email}: la empresa de la invitación no existe.`
          );
          continue;
        }
        if (empleadoId && legajosTomados.has(empleadoId)) {
          console.log(
            `    ✗ ${u.email}: ${nombreEmpleado(empleadoId)} ya tiene otra cuenta.`
          );
          continue;
        }

        const error = await crearPerfil({
          id: u.id,
          email: u.email,
          rol,
          empresa_id: empresaId,
          empleado_id: empleadoId,
          nombre_completo: meta.nombre_completo || u.email,
        });
        if (error) {
          console.log(`    ✗ ${u.email}: ${error}`);
        } else {
          if (empleadoId) legajosTomados.add(empleadoId);
          console.log(
            `    ✓ ${u.email} → ${rol} en ${nombreEmpresa(empresaId)}` +
              (empleadoId ? `, vinculado a ${nombreEmpleado(empleadoId)}` : '')
          );
        }
      }
    }
  }

  titulo('3. Cuentas sin legajo vinculado');
  const sinLegajo = perfiles.filter(
    (p) => !p.empleado_id && p.rol !== 'superadmin'
  );
  if (sinLegajo.length === 0) {
    console.log('Ninguna (los superadmin no llevan legajo).');
  } else {
    for (const p of sinLegajo) {
      const posible = empleados.find(
        (e) =>
          e.email && e.email.toLowerCase() === (p.email ?? '').toLowerCase()
      );
      console.log(
        `  · ${p.email} — ${p.rol} en ${nombreEmpresa(p.empresa_id)}` +
          (posible
            ? `  → coincide por mail con ${posible.nombre} ${posible.apellido}`
            : '  → ningún colaborador tiene ese mail')
      );
    }
  }

  titulo('4. Colaboradores sin cuenta');
  const conCuenta = new Set(perfiles.map((p) => p.empleado_id).filter(Boolean));
  const porEmpresa = new Map();
  for (const e of empleados) {
    if (conCuenta.has(e.id)) continue;
    porEmpresa.set(e.empresa_id, (porEmpresa.get(e.empresa_id) ?? 0) + 1);
  }
  if (porEmpresa.size === 0) {
    console.log('Todos tienen cuenta.');
  } else {
    for (const [empresaId, cuantos] of porEmpresa) {
      console.log(`  · ${nombreEmpresa(empresaId)}: ${cuantos} sin cuenta`);
    }
  }
  console.log('');
};

main().catch((err) => {
  console.error(`\nNo se pudo auditar: ${err.message}\n`);
  process.exit(1);
});
