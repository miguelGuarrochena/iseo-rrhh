'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { aOpciones } from '@/components/app/ui/Selector';
import { ficharAhora } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearHora, hoyISO } from '@/lib/fechas';
import { Empleado, Fichaje } from '@/types/rrhh';

interface FichajeManualModalProps {
  abierto: boolean;
  onCerrar: () => void;
  empleados: Empleado[];
  /** Nombre de quien carga el fichaje (para auditoría). */
  registradoPor: string;
  onFichado: (fichaje: Fichaje) => void;
}

const horaActual = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};

/**
 * Carga manual de fichaje: respaldo para cuando falla la tablet, no hay
 * internet en planta o el equipo no está disponible. Lo usa RRHH o el
 * supervisor y queda registrado quién lo cargó.
 */
export const FichajeManualModal = ({
  abierto,
  onCerrar,
  empleados,
  registradoPor,
  onFichado,
}: FichajeManualModalProps) => {
  const [empleadoId, setEmpleadoId] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [fecha, setFecha] = useState(hoyISO());
  const [hora, setHora] = useState(horaActual());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opcionesEmpleados = useMemo(
    () =>
      empleados
        .filter((e) => e.activo)
        .map((e) => ({ valor: e.id, etiqueta: `${e.nombre} ${e.apellido}` })),
    [empleados]
  );

  const cerrar = () => {
    setEmpleadoId('');
    setTipo('ingreso');
    setFecha(hoyISO());
    setHora(horaActual());
    setError(null);
    onCerrar();
  };

  const guardar = async () => {
    if (!empleadoId) {
      setError('Elegí un colaborador.');
      return;
    }
    if (!fecha) {
      setError('La fecha es obligatoria.');
      return;
    }
    if (!hora) {
      setError('La hora es obligatoria.');
      return;
    }
    const cuando = new Date(`${fecha}T${hora}:00`);
    if (Number.isNaN(cuando.getTime())) {
      setError('La fecha u hora no son válidas.');
      return;
    }
    if (cuando > new Date()) {
      setError('No se puede cargar un fichaje futuro.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const fichaje = await ficharAhora(empleadoId, {
        metodo: 'manual',
        tipo,
        timestamp: cuando.toISOString(),
        registradoPor,
      });
      const esHoy = fecha === hoyISO();
      avisoExito(
        'Fichaje cargado a mano',
        `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}${
          esHoy ? '' : ` del ${fecha}`
        } a las ${formatearHora(fichaje.timestamp)}.`
      );
      onFichado(fichaje);
      cerrar();
    } catch (err) {
      avisoError(
        'No pudimos cargar el fichaje',
        err instanceof Error ? err.message : undefined
      );
      setError(err instanceof Error ? err.message : 'No pudimos cargar.');
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title="Cargar fichaje a mano"
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
          Usá esta carga solo como respaldo (falla de la tablet, sin internet en
          planta, etc.). Queda registrado que lo cargaste vos.
        </p>

        <CampoSelect
          etiqueta="Colaborador"
          value={empleadoId}
          onChange={setEmpleadoId}
          opciones={opcionesEmpleados}
        />
        <CampoFecha
          etiqueta="Fecha"
          value={fecha}
          onChange={setFecha}
          max={hoyISO()}
          ayuda="Podés cargar un día pasado si ese día el sistema no estaba disponible."
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoSelect
            etiqueta="Tipo"
            value={tipo}
            onChange={(v) => setTipo(v as 'ingreso' | 'egreso')}
            opciones={aOpciones({ ingreso: 'Ingreso', egreso: 'Egreso' })}
          />
          <Campo
            etiqueta="Hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void guardar()}
            disabled={guardando}
          >
            {guardando ? 'Cargando…' : 'Cargar fichaje'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
