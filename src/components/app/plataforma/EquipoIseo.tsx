'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconAlertTriangle,
  IconPlus,
  IconShieldLock,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { avisoExito } from '@/lib/avisos';
import {
  juntarErrores,
  validarEmail,
  validarRequerido,
} from '@/lib/validaciones';
import { getEquipoIseo } from '@/lib/services/rrhh';
import { fetchProtegido } from '@/lib/api/fetchProtegido';
import { Usuario } from '@/types/rrhh';

/**
 * El equipo de ISEO: quiénes ven todas las empresas y la facturación.
 *
 * No salen en Permisos porque Permisos es de una empresa y estos usuarios
 * no pertenecen a ninguna.
 */
export const EquipoIseo = () => {
  const { usuario } = useAuth();
  const [modal, setModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [entendido, setEntendido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const carga = useCarga(() => getEquipoIseo(), [], {
    contexto: 'plataforma/equipo',
    inicial: [] as Usuario[],
  });
  const equipo = carga.datos;

  const cerrar = () => {
    setModal(false);
    setNombre('');
    setEmail('');
    setEntendido(false);
    setErrores({});
  };

  const invitar = async (e: FormEvent) => {
    e.preventDefault();
    const nuevos = juntarErrores({
      nombre: validarRequerido(nombre, 'El nombre'),
      email: validarRequerido(email, 'El email') ?? validarEmail(email),
      entendido: entendido
        ? null
        : 'Confirmá que entendés el alcance de este acceso.',
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    try {
      const res = await fetchProtegido('/api/equipo-iseo', {
        method: 'POST',
        body: JSON.stringify({
          nombreCompleto: nombre.trim(),
          email: email.trim(),
        }),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        setErrores({ email: cuerpo?.error ?? 'No pudimos invitar.' });
        setEnviando(false);
        return;
      }
      avisoExito(
        'Invitación enviada',
        `${email.trim()} va a recibir el mail para crear su contraseña.`
      );
      cerrar();
      carga.recargar();
    } catch (err) {
      setErrores({
        email: err instanceof Error ? err.message : 'No pudimos invitar.',
      });
    }
    setEnviando(false);
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold tracking-tight text-ink">
            <IconShieldLock size={18} className="text-ink-soft" />
            Equipo de ISEO
          </h2>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">
            Quiénes tienen acceso a todas las empresas y a la facturación de la
            plataforma.
          </p>
        </div>
        <Boton variante="negro" tamano="sm" onClick={() => setModal(true)}>
          <IconPlus size={14} />
          Sumar al equipo
        </Boton>
      </div>

      {carga.fase === 'error' && carga.error ? (
        <div className="mt-4">
          <BloqueError error={carga.error} onReintentar={carga.recargar} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {carga.fase === 'cargando' && (
            <p className="text-sm text-ink-soft">Cargando el equipo…</p>
          )}
          {equipo.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {u.nombreCompleto}
                  {u.id === usuario?.id && (
                    <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-800">
                      Vos
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-soft">{u.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {equipo.length === 1 && carga.fase === 'ok' && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          Sos el único con acceso a la plataforma. Si perdés esta cuenta, nadie
          puede entrar a administrar las empresas. Conviene tener a alguien más.
        </p>
      )}

      <Modal
        opened={modal}
        onClose={cerrar}
        title="Sumar al equipo de ISEO"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        <form onSubmit={invitar} className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <IconAlertTriangle size={16} />
              Es el acceso más amplio de la plataforma
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90">
              Esta persona va a ver <strong>todas las empresas</strong>, sus
              colaboradores y sueldos, y la facturación de ISEO. También va a
              poder sumar a otros al equipo. No se puede limitar a una empresa:
              para eso está invitar un admin desde Permisos.
            </p>
          </div>

          <Campo
            etiqueta="Nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={errores.nombre}
          />
          <Campo
            etiqueta="Email *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errores.email}
            ayuda="Le llega un mail para que cree su propia contraseña. Vos no la definís."
          />

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={entendido}
              onChange={(e) => setEntendido(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="text-xs leading-relaxed text-ink">
              Entiendo que le doy acceso a los datos de todas las empresas y a
              la facturación, y que queda registrado que lo hice yo.
            </span>
          </label>
          {errores.entendido && (
            <span className="text-xs font-medium text-red-600">
              {errores.entendido}
            </span>
          )}

          <div className="flex gap-2">
            <Boton type="submit" disabled={enviando} className="flex-1">
              {enviando ? 'Enviando…' : 'Enviar invitación'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
          </div>
        </form>
      </Modal>
    </Panel>
  );
};
