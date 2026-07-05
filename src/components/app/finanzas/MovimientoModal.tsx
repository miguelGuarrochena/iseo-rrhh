'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoSelect } from '@/components/app/ui/Campo';
import { CampoFecha } from '@/components/app/ui/CampoFecha';
import { crearMovimiento } from '@/lib/services/rrhh';
import { avisoError, avisoExito } from '@/lib/avisos';
import { hoyISO } from '@/lib/fechas';
import { Empresa, MovimientoFinanciero, TipoMovimiento } from '@/types/rrhh';

interface MovimientoModalProps {
  abierto: boolean;
  tipo: TipoMovimiento;
  empresas: Empresa[];
  onCerrar: () => void;
  onCreado: (m: MovimientoFinanciero) => void;
}

/** Alta manual de un ingreso o gasto de ISEO. */
export const MovimientoModal = ({
  abierto,
  tipo,
  empresas,
  onCerrar,
  onCreado,
}: MovimientoModalProps) => {
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);

  const opcionesEmpresa = useMemo(
    () => [
      { valor: '', etiqueta: 'Sin empresa' },
      ...empresas.map((e) => ({ valor: e.id, etiqueta: e.nombre })),
    ],
    [empresas]
  );

  const cerrar = () => {
    setConcepto('');
    setCategoria('');
    setEmpresaId('');
    setMonto('');
    setFecha(hoyISO());
    onCerrar();
  };

  const guardar = async () => {
    const montoNum = Number(monto);
    if (!concepto.trim() || !montoNum || montoNum <= 0) return;
    setGuardando(true);
    try {
      const m = await crearMovimiento({
        tipo,
        concepto: concepto.trim(),
        categoria: categoria.trim() || undefined,
        empresaId: tipo === 'ingreso' && empresaId ? empresaId : undefined,
        monto: montoNum,
        fecha,
      });
      avisoExito(tipo === 'ingreso' ? 'Ingreso cargado' : 'Gasto cargado');
      onCreado(m);
      cerrar();
    } catch (err) {
      avisoError(
        'No pudimos guardar',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title={tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
      radius="lg"
      centered
      styles={{ title: { fontWeight: 800 } }}
    >
      <div className="flex flex-col gap-4">
        <Campo
          etiqueta="Concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={
            tipo === 'ingreso'
              ? 'Abono mensual, implementación…'
              : 'Hosting, honorarios…'
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Monto"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
          />
          <CampoFecha
            etiqueta="Fecha"
            value={fecha}
            onChange={setFecha}
            max={hoyISO()}
          />
        </div>
        <Campo
          etiqueta="Categoría (opcional)"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder={
            tipo === 'ingreso' ? 'Abono, Servicios…' : 'Infraestructura…'
          }
        />
        {tipo === 'ingreso' && (
          <CampoSelect
            etiqueta="Empresa (opcional)"
            value={empresaId}
            onChange={setEmpresaId}
            opciones={opcionesEmpresa}
            ayuda="Vinculalo a una empresa para que cuente como su cobro del mes."
          />
        )}
        <div className="flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            onClick={() => void guardar()}
            disabled={guardando || !concepto.trim() || !monto}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
};
