'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect, CampoTextarea } from '@/components/app/ui/Campo';
import {
  CampoAutogestionable,
  CAMPOS,
  CAMPOS_DEL_FORMULARIO,
  errorDePropuesta,
  mostrarValor,
  valorActualDe,
} from '@/lib/autoservicioLegajo';
import { solicitarCambioDeLegajo } from '@/lib/services/rrhh';
import { Empleado } from '@/types/rrhh';

interface Props {
  abierto: boolean;
  empleado: Empleado;
  /** Los campos que ya tienen un pedido esperando respuesta. */
  yaPendientes: string[];
  onCerrar: () => void;
  onListo: () => void;
}

/**
 * "Pedir un cambio" desde el propio legajo.
 *
 * No edita nada: arma una propuesta. El texto de la pantalla lo dice sin
 * rodeos, porque la diferencia importa —si la persona se va creyendo que
 * ya cambió su CBU, el problema aparece el día de pago.
 */
export const PedirCambioModal = ({
  abierto,
  empleado,
  yaPendientes,
  onCerrar,
  onListo,
}: Props) => {
  const [campo, setCampo] = useState<CampoAutogestionable>('domicilio');
  const [valor, setValor] = useState('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const definicion = CAMPOS[campo];
  const actual = valorActualDe(empleado, campo);

  useEffect(() => {
    if (!abierto) return;
    setCampo('domicilio');
    setValor('');
    setComentario('');
    setError(undefined);
  }, [abierto]);

  // Al cambiar de campo, el valor tipeado para el anterior ya no aplica.
  useEffect(() => {
    setValor('');
    setError(undefined);
  }, [campo]);

  const opcionesDeCampo = useMemo(
    () =>
      CAMPOS_DEL_FORMULARIO.map((c) => ({
        valor: c,
        etiqueta: yaPendientes.includes(c)
          ? `${CAMPOS[c].etiqueta} · ya pediste un cambio`
          : CAMPOS[c].etiqueta,
      })),
    [yaPendientes]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problema = errorDePropuesta({ campo, valor, valorActual: actual });
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    try {
      await solicitarCambioDeLegajo({
        campo,
        valor: valor.trim(),
        comentario: comentario.trim() || undefined,
      });
      onListo();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el pedido.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Pedir un cambio en mi legajo"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <p className="rounded-xl bg-paper px-3.5 py-2.5 text-sm leading-relaxed text-ink-soft">
          El dato no cambia ahora. Se lo mandamos a RRHH y, cuando lo aprueben,
          se actualiza en tu legajo.
        </p>

        <CampoSelect
          etiqueta="Qué querés corregir"
          value={campo}
          onChange={(v) => setCampo(v as CampoAutogestionable)}
          opciones={opcionesDeCampo}
        />

        <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Ahora figura
          </p>
          <p className="mt-0.5 text-sm text-ink">
            {mostrarValor(campo, actual)}
          </p>
        </div>

        {definicion.tipo === 'opcion' ? (
          <CampoSelect
            etiqueta="Valor nuevo"
            value={valor}
            onChange={setValor}
            opciones={(definicion.opciones ?? []).map((o) => ({
              valor: o.valor,
              etiqueta: o.etiqueta,
            }))}
            error={error}
          />
        ) : (
          <Campo
            etiqueta="Valor nuevo"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            error={error}
            inputMode={campo === 'cbu' ? 'numeric' : undefined}
            type={definicion.tipo === 'email' ? 'email' : 'text'}
            ayuda={
              campo === 'cbu'
                ? '22 números, sin espacios ni guiones.'
                : undefined
            }
          />
        )}

        {yaPendientes.includes(campo) && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            Ya tenías un pedido pendiente para este dato. Éste lo reemplaza.
          </p>
        )}

        <CampoTextarea
          etiqueta="Aclaración para RRHH (opcional)"
          rows={2}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej.: me mudé en marzo, ya llevé el certificado de domicilio."
        />

        <div className="mt-1 flex justify-end gap-2">
          <Boton variante="secundario" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar pedido'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
};
