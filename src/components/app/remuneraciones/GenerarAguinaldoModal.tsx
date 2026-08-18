'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconGift } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { cargarRemuneracion } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import {
  analizarSalario,
  MODALIDADES_CON_AGUINALDO,
  periodoDeSemestre,
  yaTieneSacDelSemestre,
} from '@/lib/remuneraciones';
import { formatearPesos } from '@/lib/formato';
import { Empleado, Remuneracion } from '@/types/rrhh';

interface GenerarAguinaldoModalProps {
  abierto: boolean;
  empleados: Empleado[];
  remuneraciones: Remuneracion[];
  onCerrar: () => void;
  onGenerado: () => void;
}

interface FilaAguinaldo {
  empleado: Empleado;
  seleccionado: boolean;
  monto: string;
  elegiblePorModalidad: boolean;
  yaGenerado: boolean;
  /** Mensaje a mostrar en la fila cuando el monto no sirve. */
  error?: string;
}

const semestreActual = (): 1 | 2 => (new Date().getMonth() < 6 ? 1 : 2);

/** Último día (inclusive) del semestre, para calcular la mejor base contra sueldos ya cargados. */
const finDeSemestre = (anio: number, sem: 1 | 2): Date =>
  sem === 1 ? new Date(anio, 5, 30) : new Date(anio, 11, 31);

/**
 * Genera el aguinaldo (SAC) del semestre elegido. Cada empresa decide a
 * quién le corresponde: se preselecciona según la modalidad de
 * contratación (quienes están en relación de dependencia), pero el admin
 * puede tildar o destildar a cada colaborador y ajustar el monto antes de
 * confirmar. El monto sugerido ya viene prorrateado si alguien ingresó a
 * mitad de semestre.
 */
export const GenerarAguinaldoModal = ({
  abierto,
  empleados,
  remuneraciones,
  onCerrar,
  onGenerado,
}: GenerarAguinaldoModalProps) => {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [sem, setSem] = useState<1 | 2>(semestreActual());
  const [filas, setFilas] = useState<FilaAguinaldo[]>([]);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const hasta = finDeSemestre(anio, sem);
    setFilas(
      empleados
        .filter((e) => e.activo)
        .map((e) => {
          const remsEmpleado = remuneraciones.filter(
            (r) => r.empleadoId === e.id
          );
          const analisis = analizarSalario(remsEmpleado, hasta, e.fechaIngreso);
          const elegiblePorModalidad = (
            MODALIDADES_CON_AGUINALDO as readonly string[]
          ).includes(e.modalidadContratacion);
          const yaGenerado = yaTieneSacDelSemestre(
            remuneraciones,
            e.id,
            anio,
            sem
          );
          return {
            empleado: e,
            seleccionado:
              elegiblePorModalidad &&
              !yaGenerado &&
              analisis.aguinaldoEstimado > 0,
            monto: String(analisis.aguinaldoEstimado || ''),
            elegiblePorModalidad,
            yaGenerado,
          };
        })
        .sort((a, b) => a.empleado.apellido.localeCompare(b.empleado.apellido))
    );
  }, [abierto, anio, sem, empleados, remuneraciones]);

  const total = useMemo(
    () =>
      filas
        .filter((f) => f.seleccionado)
        .reduce((acc, f) => acc + (Number(f.monto) || 0), 0),
    [filas]
  );
  const seleccionados = filas.filter((f) => f.seleccionado).length;

  const toggle = (i: number) =>
    setFilas((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, seleccionado: !f.seleccionado } : f
      )
    );

  const setMonto = (i: number, monto: string) =>
    setFilas((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, monto, error: undefined } : f))
    );

  const generar = async () => {
    const aGenerar = filas.filter((f) => f.seleccionado);
    if (aGenerar.length === 0) return;

    // Un SAC en cero no es un aguinaldo, es un registro que después nadie
    // entiende. Se marca la fila en vez de dejar pasar el número.
    const invalidos = aGenerar.filter((f) => !(Number(f.monto) > 0));
    if (invalidos.length > 0) {
      setFilas((prev) =>
        prev.map((f) =>
          f.seleccionado && !(Number(f.monto) > 0)
            ? { ...f, error: 'Poné un monto mayor a cero o destildalo.' }
            : { ...f, error: undefined }
        )
      );
      return;
    }
    setFilas((prev) => prev.map((f) => ({ ...f, error: undefined })));
    setGenerando(true);
    try {
      await Promise.all(
        aGenerar.map((f) =>
          cargarRemuneracion({
            empleadoId: f.empleado.id,
            periodo: periodoDeSemestre(anio, sem),
            tipo: 'sac',
            montoBruto: Number(f.monto) || 0,
            convenio: f.empleado.convenio,
          })
        )
      );
      avisoExito(
        'Aguinaldo generado',
        `Se cargó el SAC de ${aGenerar.length} colaborador${aGenerar.length === 1 ? '' : 'es'}.`
      );
      onGenerado();
      onCerrar();
    } catch (err) {
      avisoError(
        'No pudimos generar el aguinaldo',
        err instanceof Error ? err.message : undefined
      );
    }
    setGenerando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Generar aguinaldo (SAC)"
      radius="lg"
      centered
      size="lg"
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          El monto sugerido es el 50% del mejor sueldo bruto del semestre,
          prorrateado si ingresó a mitad de camino. Elegí quién de{' '}
          <strong>esta empresa</strong> cobra este semestre y ajustá el monto si
          hace falta antes de confirmar.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <CampoSelect
            etiqueta="Semestre"
            value={String(sem)}
            onChange={(v) => setSem(Number(v) === 1 ? 1 : 2)}
            opciones={[
              { valor: '1', etiqueta: '1º semestre (ene–jun)' },
              { valor: '2', etiqueta: '2º semestre (jul–dic)' },
            ]}
          />
          <Campo
            etiqueta="Año"
            type="number"
            value={String(anio)}
            onChange={(e) => setAnio(Number(e.target.value) || anio)}
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
          {filas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">
              No hay colaboradores activos.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {filas.map((f, i) => (
                <label
                  key={f.empleado.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper"
                >
                  <input
                    type="checkbox"
                    checked={f.seleccionado}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {f.empleado.apellido}, {f.empleado.nombre}
                    </p>
                    {f.error ? (
                      <p className="truncate text-xs font-medium text-red-600">
                        {f.error}
                      </p>
                    ) : (
                      <p className="truncate text-xs text-ink-soft">
                        {!f.elegiblePorModalidad &&
                          'No suele corresponderle aguinaldo (revisá su modalidad) · '}
                        {f.yaGenerado &&
                          'Ya tiene SAC generado este semestre · '}
                        {f.empleado.puesto}
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    value={f.monto}
                    onChange={(e) => setMonto(i, e.target.value)}
                    disabled={!f.seleccionado}
                    aria-invalid={Boolean(f.error)}
                    aria-label={`Monto del aguinaldo de ${f.empleado.nombre} ${f.empleado.apellido}`}
                    className={`w-32 shrink-0 rounded-lg border bg-surface px-2.5 py-1.5 text-right text-sm text-ink outline-none disabled:opacity-50 ${
                      f.error
                        ? 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
                        : 'border-line-strong focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(74,122,245,0.18)]'
                    }`}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl bg-brand-50/60 px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            {seleccionados}{' '}
            {seleccionados === 1 ? 'colaborador' : 'colaboradores'}{' '}
            seleccionados
          </span>
          <span className="text-base font-extrabold text-ink">
            {formatearPesos(total)}
          </span>
        </div>

        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void generar()}
            disabled={generando || seleccionados === 0}
          >
            <IconGift size={16} />
            {generando ? 'Generando…' : `Generar para ${seleccionados}`}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
