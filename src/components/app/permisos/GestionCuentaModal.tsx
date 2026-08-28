'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconMailForward,
  IconTrash,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { CampoSelect } from '@/components/app/ui/Campo';
import { useConfirmacion } from '@/components/app/ui/useConfirmacion';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  quitarAcceso,
  reenviarInvitacion,
  vincularUsuarioAEmpleado,
} from '@/lib/services/rrhh';
import { CuentaDeAcceso, Empleado, Usuario } from '@/types/rrhh';
import { formatearFechaDeInstante } from '@/lib/fechas';

interface Props {
  /** `null` = cerrado. */
  usuario: Usuario | null;
  /** Estado en Auth. Falta si no se pudo consultar. */
  cuenta?: CuentaDeAcceso;
  empleados: Empleado[];
  /** Legajos que ya tiene otra cuenta: no se pueden ofrecer. */
  empleadosConCuenta: Set<string>;
  onCerrar: () => void;
  /** Algo cambió: la pantalla tiene que volver a pedir los datos. */
  onCambio: () => void;
}

/**
 * `invitadaEn` y `ultimoAcceso` son INSTANTES, no días civiles: leerlos
 * sin zona los mostraba con el reloj del dispositivo, así que un acceso
 * de las 21:30 de Buenos Aires figuraba al día siguiente desde una
 * máquina en UTC.
 */
const fecha = (iso?: string) => (iso ? formatearFechaDeInstante(iso) : '');

/**
 * Todo lo que se puede hacer con una cuenta, en un solo lugar.
 *
 * Antes cada una de estas tres cosas —unirla a un legajo, rehacer la
 * invitación, sacarle el acceso— o no existía en la app o terminaba en
 * "entrá a Supabase". Van juntas porque son la misma pregunta del admin:
 * "esta persona, ¿está adentro y como quién?".
 */
export const GestionCuentaModal = ({
  usuario,
  cuenta,
  empleados,
  empleadosConCuenta,
  onCerrar,
  onCambio,
}: Props) => {
  const { confirmar, dialogo } = useConfirmacion();
  const [empleadoId, setEmpleadoId] = useState('');
  const [error, setError] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  // El modal se monta una sola vez: el vínculo elegido se sincroniza al
  // abrirlo con otra cuenta, si no arrastraría el de la anterior.
  const [ultimoId, setUltimoId] = useState<string>();

  if (usuario && usuario.id !== ultimoId) {
    setUltimoId(usuario.id);
    setEmpleadoId(usuario.empleadoId ?? '');
    setError(undefined);
  }

  const pendiente = cuenta?.estado === 'pendiente';

  /**
   * Los legajos que ya tienen otra cuenta quedan afuera: dos cuentas sobre
   * el mismo legajo ven —y firman— el mismo recibo de sueldo. El vínculo
   * actual se ofrece siempre, aunque la persona esté dada de baja, para
   * que el desplegable no aparezca vacío en una cuenta ya vinculada.
   */
  const opciones = () => {
    if (!usuario) return [];
    const libres = empleados.filter(
      (e) => !empleadosConCuenta.has(e.id) || e.id === usuario.empleadoId
    );
    const conocido = libres.some((e) => e.id === usuario.empleadoId);
    return [
      { valor: '', etiqueta: 'Sin vincular' },
      ...(usuario.empleadoId && !conocido
        ? [{ valor: usuario.empleadoId, etiqueta: 'Colaborador dado de baja' }]
        : []),
      ...libres.map((e) => ({
        valor: e.id,
        etiqueta: `${e.apellido}, ${e.nombre} — ${e.puesto}`,
      })),
    ];
  };

  const guardarVinculo = async (e: FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    setOcupado(true);
    try {
      await vincularUsuarioAEmpleado(usuario.id, empleadoId || null);
      avisoExito(
        empleadoId ? 'Cuenta vinculada' : 'Cuenta desvinculada',
        empleadoId
          ? 'El legajo ya figura con cuenta: esa persona ve sus recibos y su ficha.'
          : 'La cuenta sigue pudiendo entrar, pero ya no está unida a ningún legajo.'
      );
      onCambio();
      onCerrar();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No pudimos guardar el vínculo.'
      );
    }
    setOcupado(false);
  };

  const reenviar = async () => {
    if (!usuario) return;
    const ok = await confirmar({
      titulo: 'Rehacer la invitación',
      detalle: `Le va a llegar un mail nuevo a ${usuario.email} para crear su contraseña. El link anterior deja de servir.`,
      confirmar: 'Reenviar',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await reenviarInvitacion(usuario.email);
      avisoExito(
        'Invitación reenviada',
        `${usuario.email} va a recibir el mail en los próximos minutos.`
      );
      onCambio();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos reenviar la invitación',
        err instanceof Error ? err.message : undefined
      );
    }
    setOcupado(false);
  };

  const quitar = async () => {
    if (!usuario) return;
    const ok = await confirmar({
      titulo: '¿Quitarle el acceso?',
      detalle: (
        <>
          <span className="font-semibold text-ink">
            {usuario.nombreCompleto}
          </span>{' '}
          no va a poder entrar más y su email queda libre para otra alta. El
          legajo, los recibos y todo lo cargado se conservan.
        </>
      ),
      confirmar: 'Quitar acceso',
      peligrosa: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await quitarAcceso(usuario.email);
      avisoExito('Acceso quitado', `${usuario.email} ya no entra a la app.`);
      onCambio();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos quitar el acceso',
        err instanceof Error ? err.message : undefined
      );
    }
    setOcupado(false);
  };

  return (
    <>
      <Modal
        opened={usuario !== null}
        onClose={onCerrar}
        title="Cuenta"
        radius="lg"
        centered
        styles={{ title: { fontWeight: 800 } }}
      >
        {usuario && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold text-ink">
                {usuario.nombreCompleto}
              </p>
              <p className="text-xs text-ink-soft">{usuario.email}</p>
            </div>

            {cuenta && (
              <div
                className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs ${
                  pendiente
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-paper text-ink-soft'
                }`}
              >
                {pendiente ? (
                  <IconClock size={16} className="mt-px shrink-0" />
                ) : (
                  <IconCircleCheck size={16} className="mt-px shrink-0" />
                )}
                <span>
                  {pendiente ? (
                    <>
                      <span className="font-bold">Invitación pendiente.</span>{' '}
                      Se envió el {fecha(cuenta.invitadaEn)} y todavía no creó
                      su contraseña. El link vence a las 24 h: si ya pasó, hay
                      que reenviarla.
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-ink">Cuenta activa.</span>{' '}
                      Último ingreso: {fecha(cuenta.ultimoAcceso)}.
                    </>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={guardarVinculo} className="flex flex-col gap-3.5">
              <CampoSelect
                etiqueta="Colaborador vinculado"
                value={empleadoId}
                onChange={setEmpleadoId}
                ayuda="Sin vínculo el legajo figura “sin cuenta”: esa persona entra a la app pero no ve sus recibos ni su ficha."
                opciones={opciones()}
                error={error}
              />
              <Boton
                type="submit"
                disabled={ocupado || empleadoId === (usuario.empleadoId ?? '')}
              >
                Guardar vínculo
              </Boton>
            </form>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {pendiente && (
                <Boton
                  variante="secundario"
                  onClick={reenviar}
                  disabled={ocupado}
                >
                  <IconMailForward size={16} />
                  Reenviar invitación
                </Boton>
              )}
              <Boton variante="rechazar" onClick={quitar} disabled={ocupado}>
                <IconTrash size={16} />
                Quitar acceso
              </Boton>
              <p className="flex items-start gap-2 text-xs text-ink-soft">
                <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
                Quitar el acceso libera el email. El legajo y todo lo cargado se
                conservan.
              </p>
            </div>
          </div>
        )}
      </Modal>
      {dialogo}
    </>
  );
};
