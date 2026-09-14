'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  IconCoin,
  IconPercentage,
  IconTarget,
  IconTrophy,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StatCard } from '@/components/app/dashboard/StatCard';
import { Panel } from '@/components/app/Panel';
import { Boton } from '@/components/app/ui/Boton';
import { Campo, CampoTextarea } from '@/components/app/ui/Campo';
import { CampoMes } from '@/components/app/ui/CampoMes';
import { RequireModulo } from '@/components/app/RequireModulo';
import { RequireEmpresa } from '@/components/app/RequireEmpresa';
import { BloqueError } from '@/components/app/EstadoCarga';
import { useCarga } from '@/lib/useCarga';
import { avisoError, avisoExito } from '@/lib/avisos';
import { formatearPesos } from '@/lib/formato';
import { formatearPeriodo, mesEmpresa } from '@/lib/fechas';
import { getObjetivoVenta, guardarObjetivoVenta } from '@/lib/services/rrhh';
import {
  bonoDevengado,
  objetivoAlcanzado,
  porcentajeCumplimiento,
} from '@/lib/objetivosVenta';
import { DatosObjetivoVenta, ObjetivoVentaMes } from '@/types/rrhh';

const ObjetivoVentaPage = () => {
  const { rolEfectivo } = useAuth();
  const puedeEditar =
    rolEfectivo === 'admin_rrhh' || rolEfectivo === 'superadmin';
  const [periodo, setPeriodo] = useState(mesEmpresa());
  const [objetivo, setObjetivo] = useState('0');
  const [alcanzado, setAlcanzado] = useState('0');
  const [bono, setBono] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const aplicar = (fila: ObjetivoVentaMes | null) => {
    setObjetivo(String(fila?.montoObjetivo ?? 0));
    setAlcanzado(String(fila?.montoAlcanzado ?? 0));
    setBono(fila?.bonoMonto != null ? String(fila.bonoMonto) : '');
    setNotas(fila?.notas ?? '');
  };

  const carga = useCarga(() => getObjetivoVenta(periodo), [periodo], {
    contexto: 'objetivos-ventas',
  });

  useEffect(() => {
    if (carga.fase !== 'ok') return;
    aplicar(carga.datos ?? null);
  }, [carga.fase, carga.datos, periodo]);

  const recargar = useCallback(() => carga.recargar(), [carga]);

  const montoObjetivo = Number(objetivo) || 0;
  const montoAlcanzado = Number(alcanzado) || 0;
  const bonoMonto = bono.trim() === '' ? undefined : Number(bono);
  const pct = porcentajeCumplimiento(montoObjetivo, montoAlcanzado);
  const ganado = bonoDevengado(montoObjetivo, montoAlcanzado, bonoMonto);
  const cumplido = objetivoAlcanzado(montoObjetivo, montoAlcanzado);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (montoObjetivo < 0 || montoAlcanzado < 0) {
      avisoError('Revisá los importes', 'No pueden ser negativos.');
      return;
    }
    const datos: DatosObjetivoVenta = {
      periodo,
      montoObjetivo,
      montoAlcanzado,
      bonoMonto:
        bonoMonto != null && Number.isFinite(bonoMonto) && bonoMonto > 0
          ? bonoMonto
          : undefined,
      notas: notas.trim() || undefined,
    };
    setGuardando(true);
    try {
      const guardado = await guardarObjetivoVenta(datos);
      aplicar(guardado);
      avisoExito(
        'Objetivo guardado',
        `Quedó registrado el mes ${formatearPeriodo(periodo)}.`
      );
      recargar();
    } catch (err) {
      avisoError(
        'No pudimos guardar el objetivo',
        err instanceof Error ? err.message : undefined
      );
    }
    setGuardando(false);
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Objetivos de ventas
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Un objetivo mensual para toda la empresa. El progreso se carga a mano.
          Si se alcanza, el bono queda informado acá: no se liquida en
          remuneraciones.
        </p>
      </div>

      <CampoMes etiqueta="Mes" value={periodo} onChange={setPeriodo} />

      {carga.fase === 'error' && carga.error && (
        <BloqueError error={carga.error} onReintentar={recargar} />
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Objetivo"
          valor={formatearPesos(montoObjetivo)}
          detalle={formatearPeriodo(periodo)}
          icono={IconTarget}
        />
        <StatCard
          etiqueta="Alcanzado"
          valor={formatearPesos(montoAlcanzado)}
          detalle="cargado a mano"
          icono={IconCoin}
        />
        <StatCard
          etiqueta="Cumplimiento"
          valor={`${pct}%`}
          detalle={cumplido ? 'Objetivo alcanzado' : 'Todavía no se alcanza'}
          icono={IconPercentage}
        />
        <StatCard
          etiqueta="Bono"
          valor={formatearPesos(ganado)}
          detalle={
            bonoMonto
              ? cumplido
                ? 'Devengado (a liquidar aparte)'
                : 'Pendiente de alcanzar el objetivo'
              : 'Sin bono asociado'
          }
          icono={IconTrophy}
        />
      </div>

      {puedeEditar ? (
        <Panel titulo="Cargar el mes">
          <form
            onSubmit={(e) => void guardar(e)}
            className="flex flex-col gap-3.5"
          >
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Campo
                etiqueta="Objetivo del mes *"
                type="number"
                min={0}
                step="0.01"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
              />
              <Campo
                etiqueta="Monto alcanzado *"
                type="number"
                min={0}
                step="0.01"
                value={alcanzado}
                onChange={(e) => setAlcanzado(e.target.value)}
              />
            </div>
            <Campo
              etiqueta="Bono si se alcanza (opcional)"
              type="number"
              min={0}
              step="0.01"
              value={bono}
              onChange={(e) => setBono(e.target.value)}
              ayuda="Informativo. No se copia a remuneraciones ni a recibos."
            />
            <CampoTextarea
              etiqueta="Notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
            />
            <Boton
              type="submit"
              disabled={guardando || carga.fase === 'cargando'}
            >
              {guardando ? 'Guardando…' : 'Guardar objetivo'}
            </Boton>
          </form>
        </Panel>
      ) : (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
          Sólo RRHH puede cargar o cambiar el objetivo. Acá ves el progreso del
          mes.
        </p>
      )}
    </div>
  );
};

const ObjetivoVentaPageProtegida = () => (
  <RequireEmpresa>
    <RequireModulo modulo="objetivos-ventas">
      <ObjetivoVentaPage />
    </RequireModulo>
  </RequireEmpresa>
);

export default ObjetivoVentaPageProtegida;
