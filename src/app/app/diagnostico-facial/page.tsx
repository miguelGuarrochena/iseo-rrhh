'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconActivityHeartbeat,
  IconCertificate,
  IconClipboardCheck,
  IconDeviceMobile,
  IconPlayerPlay,
  IconRuler,
  IconTrash,
} from '@tabler/icons-react';
import { Boton } from '@/components/app/ui/Boton';
import { Campo } from '@/components/app/ui/Campo';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  cotaSuperiorFar,
  curva,
  distanciasContra,
  puntoDeCruce,
  resumir,
  separacion,
  umbralConservador,
} from '@/lib/facial/banco';
import { abrirCamara, cerrarCamara, MENSAJE_FALLA } from '@/lib/facial/camara';
import {
  clasificarDispositivo,
  ETIQUETA_NIVEL,
  sondearDispositivo,
  type RequisitosMedidos,
  type SondaDispositivo,
} from '@/lib/facial/diagnostico';
import {
  MotorFacial,
  type Diagnostico,
  type EstadoMotor,
} from '@/lib/facial/motor';
import { MODELO_EMBEDDING } from '@/lib/facial/embedding';
import {
  distancia,
  UMBRAL_IDENTIFICACION,
  UMBRAL_VERIFICACION,
  VERSION_PLANTILLA,
} from '@/lib/facial/plantilla';
import { avisoError, avisoExito } from '@/lib/avisos';

/**
 * Banco de pruebas del reconocimiento facial.
 *
 * Existe porque todo el módulo se venía diagnosticando a ciegas: "no
 * anda en la Samsung" puede ser WebGL degradado, cámara que entrega
 * menos resolución de la que declara, backend caído a CPU, contraluz o
 * un enrolamiento malo, y sin datos cada hipótesis cuesta un día.
 *
 * Se corre **en la tablet de producción**, no en la notebook de
 * desarrollo. Ésa es la única medición que vale.
 *
 * Privacidad: todo vive en memoria de la pestaña. No se guarda ninguna
 * imagen, ningún descriptor sale al servidor y no se toca la base. El
 * informe que se copia son sólo números agregados.
 *
 * Ruta no enlazada desde ningún menú, y sólo para superadmin.
 */

interface Muestra {
  condicion: string;
  sujeto: string;
  descriptor: number[];
  puntaje: number;
}

/**
 * Protocolo de captura. **Las cinco primeras son obligatorias por
 * persona**; sin las cinco, la calibración no representa lo que pasa en
 * la terminal.
 *
 * Cubren las variaciones que un empleado real produce todos los días sin
 * proponérselo: no mira exactamente de frente, no se para siempre a la
 * misma distancia, y la luz de la planta cambia con la hora. Si sólo se
 * midiera de frente y con buena luz, la distribución genuina saldría
 * artificialmente compacta y el umbral quedaría más exigente de lo que
 * la realidad tolera: el sistema rebotaría gente legítima todo el día.
 */
const CONDICIONES = [
  'frontal',
  'giro izquierda',
  'giro derecha',
  'variación vertical',
  'otra distancia',
  // Opcionales: suman realismo si el lugar las tiene.
  'contraluz',
  'poca luz',
  'con anteojos',
];

/** Las que tienen que estar sí o sí para dar la calibración por válida. */
const CONDICIONES_OBLIGATORIAS = CONDICIONES.slice(0, 5);

const PERSONAS_MINIMAS = 10;

const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—');
const pct = (v: number) =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : '—';

const Dato = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1">
    <span className="text-ink-soft">{k}</span>
    <span className="text-right font-mono text-[0.72rem] text-ink">{v}</span>
  </div>
);

const DiagnosticoFacialPage = () => {
  const { usuario } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motorRef = useRef<MotorFacial | null>(null);

  const [sonda, setSonda] = useState<SondaDispositivo | null>(null);
  const [estado, setEstado] = useState<EstadoMotor | null>(null);
  const [ultimoDiag, setUltimoDiag] = useState<Diagnostico | null>(null);
  const [sujeto, setSujeto] = useState('sujeto-1');
  const [condicion, setCondicion] = useState(CONDICIONES[0]);
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [capturando, setCapturando] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  const pendiente = useRef<((m: Muestra) => void) | null>(null);
  const contexto = useRef({ sujeto, condicion });
  contexto.current = { sujeto, condicion };

  useEffect(() => {
    void sondearDispositivo().then(setSonda);
  }, []);

  const arrancar = useCallback(async () => {
    const r = await abrirCamara();
    if (!r.ok) {
      setErrorCamara(MENSAJE_FALLA[r.falla]);
      return;
    }
    streamRef.current = r.camara.stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = r.camara.stream;
    await video.play().catch(() => undefined);

    const motor = new MotorFacial({
      video,
      // Sin prueba de vida: acá se está midiendo el pipeline de
      // identidad, y un parpadeo obligatorio sólo agregaría ruido a la
      // medición sin cambiar nada de lo que se quiere medir.
      exigencia: 'ninguna',
      muestras: 3,
      onEstado: (e) => {
        setEstado(e);
        setUltimoDiag(e.diagnostico);
      },
      onPlantilla: (plantilla, detalle) => {
        const m: Muestra = {
          ...contexto.current,
          descriptor: plantilla,
          puntaje: detalle.diagnostico.ultimoPuntaje ?? 0,
        };
        pendiente.current?.(m);
        pendiente.current = null;
      },
    });
    motorRef.current = motor;
    await motor.iniciar();
  }, []);

  useEffect(() => {
    void arrancar();
    return () => {
      motorRef.current?.detener();
      motorRef.current = null;
      cerrarCamara(streamRef.current);
      streamRef.current = null;
    };
  }, [arrancar]);

  const tomarMuestra = () => {
    if (capturando) return;
    setCapturando(true);
    pendiente.current = (m) => {
      setMuestras((prev) => [...prev, m]);
      setCapturando(false);
      avisoExito('Muestra tomada', `${m.sujeto} · ${m.condicion}`);
    };
    motorRef.current?.reiniciarIntento();

    // Si el motor no llega a entregar dentro de su propio límite, se
    // libera el botón: dejarlo trabado obligaría a recargar la página en
    // medio de una sesión de medición.
    window.setTimeout(() => {
      if (pendiente.current) {
        pendiente.current = null;
        setCapturando(false);
        avisoError(
          'No se pudo tomar la muestra',
          'Revisá el encuadre y la luz.'
        );
      }
    }, 30_000);
  };

  /**
   * Comparaciones todos-contra-todos.
   *
   * Genuinas = pares de muestras del **mismo** sujeto en condiciones
   * distintas. Impostoras = pares de sujetos distintos. De esos dos
   * conjuntos salen el FRR y el FAR reales de esta población, este
   * hardware y esta iluminación.
   */
  const genuinas: number[] = [];
  const impostoras: number[] = [];
  for (let i = 0; i < muestras.length; i++) {
    for (let j = i + 1; j < muestras.length; j++) {
      const d = distancia(muestras[i].descriptor, muestras[j].descriptor);
      if (muestras[i].sujeto === muestras[j].sujeto) genuinas.push(d);
      else impostoras.push(d);
    }
  }

  const puntos = curva(genuinas, impostoras);
  const cruce = puntoDeCruce(puntos);
  const d = separacion(genuinas, impostoras);
  const rg = resumir(genuinas);
  const ri = resumir(impostoras);
  const recomendado = umbralConservador(genuinas, impostoras);
  const cota = cotaSuperiorFar(impostoras.length);

  // Cobertura del protocolo: qué falta para que la calibración sirva.
  const sujetos = [...new Set(muestras.map((m) => m.sujeto))];
  const faltantes = sujetos
    .map((s) => {
      const suyas = new Set(
        muestras.filter((m) => m.sujeto === s).map((m) => m.condicion)
      );
      const falta = CONDICIONES_OBLIGATORIAS.filter((c) => !suyas.has(c));
      return { sujeto: s, falta };
    })
    .filter((x) => x.falta.length > 0);
  const protocoloCompleto =
    sujetos.length >= PERSONAS_MINIMAS && faltantes.length === 0;

  const medido: RequisitosMedidos = {
    msPercepcion: ultimoDiag?.msPercepcion ?? null,
    msDescriptor: ultimoDiag?.embedding.msPromedio ?? null,
    fps: ultimoDiag?.fps ?? null,
    anchoCamara: ultimoDiag?.resolucion?.ancho ?? null,
  };
  const homologacion = sonda ? clasificarDispositivo(sonda, medido) : null;

  const informe = () =>
    [
      '# Informe de diagnóstico facial',
      `fecha: ${new Date().toISOString()}`,
      '',
      '## Dispositivo',
      `fabricante: ${sonda?.fabricante ?? '—'} · modelo: ${sonda?.modelo ?? '—'}`,
      `android: ${sonda?.android ?? '—'} · arquitectura: ${sonda?.arquitectura ?? '—'}`,
      `navegador: ${sonda?.navegador ?? '—'} ${sonda?.navegadorVersion ?? ''}${sonda?.esWebView ? ' (WebView embebido)' : ''}`,
      `userAgent: ${sonda?.userAgent ?? '—'}`,
      `gpu: ${sonda?.gpu ?? '—'}`,
      `webgl: ${sonda?.webgl ?? '—'} · webgpu: ${sonda?.webgpu ? 'sí' : 'no'}`,
      `wasm simd: ${sonda?.wasmSimd ? 'sí' : 'no'} · aislado: ${sonda?.aislado ? 'sí' : 'no'}`,
      `núcleos: ${sonda?.nucleos ?? '—'} · memoria: ${sonda?.memoriaGb ?? '—'} GB`,
      `rVFC: ${sonda?.soporta.requestVideoFrameCallback ? 'sí' : 'no'} · OffscreenCanvas: ${sonda?.soporta.offscreenCanvas ? 'sí' : 'no'}`,
      '',
      '## Homologación',
      `nivel: ${homologacion ? ETIQUETA_NIVEL[homologacion.nivel] : '—'}`,
      ...(homologacion?.bloqueos.map((b) => `  falta: ${b}`) ?? []),
      ...(homologacion?.advertencias.map((a) => `  aviso: ${a}`) ?? []),
      '',
      '## Pipeline',
      `percepción: ${ultimoDiag?.percepcion.delegado ?? '—'} · ${ultimoDiag?.msPercepcion ?? '—'} ms`,
      `alineamiento: ${ultimoDiag?.msAlineamiento ?? '—'} ms`,
      `embedding: ${ultimoDiag?.embedding.backend ?? '—'} en ${ultimoDiag?.embedding.donde ?? '—'} · ${ultimoDiag?.embedding.msPromedio ?? '—'} ms`,
      `reconocimiento completo: ${ultimoDiag?.msReconocimiento ?? '—'} ms`,
      `calentamiento: ${ultimoDiag?.embedding.msCalentamiento ?? '—'} ms`,
      `carga percepción: ${ultimoDiag?.percepcion.msCarga ?? '—'} ms · carga embedding: ${ultimoDiag?.embedding.msCarga ?? '—'} ms`,
      `fps del bucle: ${ultimoDiag?.fps ?? '—'} · fps de cámara: ${ultimoDiag?.fpsCamara ?? '—'}`,
      `cámara real: ${ultimoDiag?.resolucion?.ancho ?? '—'}×${ultimoDiag?.resolucion?.alto ?? '—'} @ ${ultimoDiag?.resolucion?.fps ?? '—'}`,
      `modelo percepción: ${ultimoDiag?.modeloPercepcion ?? '—'}`,
      `modelo embedding: ${MODELO_EMBEDDING} · versión de plantilla: ${VERSION_PLANTILLA}`,
      '',
      '## Estabilidad',
      `corriendo: ${Math.round((ultimoDiag?.estabilidad.msCorriendo ?? 0) / 1000)} s`,
      `percepción inicial: ${ultimoDiag?.estabilidad.msPercepcionInicial ?? '—'} ms · reciente: ${ultimoDiag?.estabilidad.msPercepcionReciente ?? '—'} ms`,
      `degradación: ${ultimoDiag?.estabilidad.degradacionPct ?? '—'} %`,
      `heap JS: ${ultimoDiag?.estabilidad.memoriaJsInicialMb ?? '—'} → ${ultimoDiag?.estabilidad.memoriaJsMb ?? '—'} MB`,
      `cuadros perdidos: ${ultimoDiag?.estabilidad.cuadrosPerdidos ?? 0}`,
      '',
      '## Incidencias',
      ...(ultimoDiag?.incidencias.length
        ? ultimoDiag.incidencias.map((i) => `  - ${i}`)
        : ['  (ninguna)']),
      '',
      '## Calibración',
      `protocolo completo: ${protocoloCompleto ? 'sí' : 'NO'} (${sujetos.length}/${PERSONAS_MINIMAS} personas)`,
      ...faltantes.map((f) => `  ${f.sujeto}: falta ${f.falta.join(', ')}`),
      `muestras: ${muestras.length} · genuinas: ${genuinas.length} · impostoras: ${impostoras.length}`,
      `genuinas  media ${n2(rg.media)} desvío ${n2(rg.desvio)} p95 ${n2(rg.p95)} máx ${n2(rg.maximo)}`,
      `impostoras media ${n2(ri.media)} desvío ${n2(ri.desvio)} mín ${n2(ri.minimo)}`,
      `separación (d'): ${n2(d)}`,
      `EER: umbral ${n2(cruce?.umbral ?? NaN)} · ${pct(cruce?.frr ?? NaN)}`,
      `UMBRAL RECOMENDADO (conservador): ${n2(recomendado?.umbral ?? NaN)}`,
      `  → FRR esperado ${pct(recomendado?.frr ?? NaN)} · impostora más cercana ${n2(recomendado?.impostoraMinima ?? NaN)}`,
      `  → cota superior del FAR real al 95 %: ${pct(cota)} (regla de tres sobre ${impostoras.length} pares)`,
      ...(recomendado?.advertencias.map((a) => `  aviso: ${a}`) ?? []),
      `umbrales vigentes en SQL: 1:1 ${UMBRAL_VERIFICACION} · 1:N ${UMBRAL_IDENTIFICACION}`,
    ].join('\n');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(informe());
      avisoExito('Informe copiado', 'Pegalo donde lo necesites.');
    } catch {
      avisoError(
        'No se pudo copiar',
        'Seleccioná el texto del recuadro a mano.'
      );
    }
  };

  if (usuario && usuario.rol !== 'superadmin') {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Esta herramienta es sólo para el equipo de ISEO.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Diagnóstico facial</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Corré esto <strong>en la tablet real</strong>, no en la computadora.
          Nada de lo que se mide acá sale del navegador: no se guardan imágenes
          ni descriptores, y no se toca la base.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-ink/5">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full -scale-x-100 object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-ink/75 px-3 py-2 text-center text-xs font-semibold text-white">
              {errorCamara ?? estado?.mensaje ?? 'Preparando…'}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Campo
              etiqueta="Sujeto"
              value={sujeto}
              onChange={(e) => setSujeto(e.target.value)}
              placeholder="sujeto-1"
            />
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                Condición
              </label>
              <select
                value={condicion}
                onChange={(e) => setCondicion(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              >
                {CONDICIONES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Boton onClick={tomarMuestra} disabled={capturando}>
              <IconPlayerPlay size={16} />
              {capturando ? 'Midiendo…' : 'Tomar muestra'}
            </Boton>
            <Boton variante="secundario" onClick={() => void copiar()}>
              <IconClipboardCheck size={16} /> Copiar informe
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => setMuestras([])}
              disabled={muestras.length === 0}
            >
              <IconTrash size={16} /> Limpiar
            </Boton>
          </div>

          {/* Cobertura del protocolo: qué falta para que esto sirva. */}
          <div
            className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
              protocoloCompleto
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            <p className="font-bold">
              {protocoloCompleto
                ? 'Protocolo completo'
                : `Protocolo incompleto — ${sujetos.length} de ${PERSONAS_MINIMAS} personas`}
            </p>
            {faltantes.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {faltantes.slice(0, 6).map((f) => (
                  <li key={f.sujeto}>
                    <strong>{f.sujeto}</strong>: falta {f.falta.join(', ')}
                  </li>
                ))}
                {faltantes.length > 6 && <li>…y {faltantes.length - 6} más</li>}
              </ul>
            )}
          </div>

          <p className="text-xs leading-relaxed text-ink-soft">
            Por cada persona hay que tomar las{' '}
            <strong>cinco condiciones obligatorias</strong> (frontal, giro a
            cada lado, variación vertical y otra distancia), y repetir con al
            menos {PERSONAS_MINIMAS} personas. Las comparaciones dentro del
            mismo sujeto dan el <strong>FRR</strong>; las cruzadas entre
            sujetos, el <strong>FAR</strong>. Sin las dos cosas, el umbral no se
            puede calibrar: se elige a ojo, que es exactamente lo que había
            antes.
          </p>
        </div>

        <div className="flex flex-col gap-4 text-xs">
          <div className="rounded-xl border border-line bg-paper/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide text-ink-soft">
              <IconDeviceMobile size={14} /> Dispositivo
            </p>
            <Dato k="Fabricante" v={sonda?.fabricante ?? '—'} />
            <Dato k="Modelo" v={sonda?.modelo ?? '—'} />
            <Dato k="Android" v={sonda?.android ?? '—'} />
            <Dato
              k="Navegador"
              v={`${sonda?.navegador ?? '—'} ${sonda?.navegadorVersion ?? ''}${sonda?.esWebView ? ' (WebView)' : ''}`}
            />
            <Dato k="Arquitectura" v={sonda?.arquitectura ?? '—'} />
            <Dato k="GPU" v={sonda?.gpu ?? 'no expuesta'} />
            <Dato k="WebGL" v={sonda?.webgl ?? 'no'} />
            <Dato k="WebGPU" v={sonda?.webgpu ? 'sí' : 'no'} />
            <Dato k="WASM SIMD" v={sonda?.wasmSimd ? 'sí' : 'no'} />
            <Dato k="Núcleos" v={String(sonda?.nucleos ?? '—')} />
            <Dato
              k="Memoria"
              v={sonda?.memoriaGb ? `${sonda.memoriaGb} GB` : '—'}
            />
            <Dato
              k="rVFC / OffscreenCanvas"
              v={`${sonda?.soporta.requestVideoFrameCallback ? 'sí' : 'no'} / ${sonda?.soporta.offscreenCanvas ? 'sí' : 'no'}`}
            />
            <Dato k="Contexto seguro" v={sonda?.contextoSeguro ? 'sí' : 'NO'} />
          </div>

          {/*
            Veredicto de homologación. Los tres niveles no son lo mismo, y
            el panel lo dice explícitamente: que ande no quiere decir que
            sirva, y que sirva no quiere decir que esté homologado — eso
            último exige la calibración con personas y una jornada de
            kiosco, que ningún script puede certificar.
          */}
          {homologacion && (
            <div
              className={`rounded-xl border p-3 ${
                homologacion.nivel === 'incompatible'
                  ? 'border-red-200 bg-red-50'
                  : homologacion.nivel === 'funcional'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-ink-soft">
                <IconCertificate size={14} /> Homologación
              </p>
              <p className="font-bold text-ink">
                {ETIQUETA_NIVEL[homologacion.nivel]}
              </p>
              {homologacion.bloqueos.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {homologacion.bloqueos.map((b) => (
                    <li key={b} className="font-semibold">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              {homologacion.advertencias.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-soft">
                  {homologacion.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-xl border border-line bg-paper/60 p-3">
            <p className="mb-2 font-bold uppercase tracking-wide text-ink-soft">
              Pipeline
            </p>
            <Dato
              k="Percepción"
              v={`${ultimoDiag?.percepcion.delegado ?? '—'} · ${ultimoDiag?.msPercepcion ?? '—'} ms`}
            />
            <Dato
              k="Alineamiento"
              v={`${ultimoDiag?.msAlineamiento ?? '—'} ms`}
            />
            <Dato
              k="Embedding"
              v={`${ultimoDiag?.embedding.backend ?? '—'} · ${ultimoDiag?.embedding.donde ?? '—'} · ${ultimoDiag?.embedding.msPromedio ?? '—'} ms`}
            />
            <Dato
              k="Reconocimiento total"
              v={`${ultimoDiag?.msReconocimiento ?? '—'} ms`}
            />
            <Dato
              k="Calentamiento"
              v={`${ultimoDiag?.embedding.msCalentamiento ?? '—'} ms`}
            />
            <Dato
              k="Carga percepción"
              v={`${ultimoDiag?.percepcion.msCarga ?? '—'} ms`}
            />
            <Dato
              k="Carga embedding"
              v={`${ultimoDiag?.embedding.msCarga ?? '—'} ms`}
            />
            <Dato
              k="FPS bucle / cámara"
              v={`${ultimoDiag?.fps ?? '—'} / ${ultimoDiag?.fpsCamara ?? '—'}`}
            />
            <Dato
              k="Cámara real"
              v={
                ultimoDiag?.resolucion
                  ? `${ultimoDiag.resolucion.ancho}×${ultimoDiag.resolucion.alto}`
                  : '—'
              }
            />
            <Dato
              k="Cuadros útiles"
              v={`${ultimoDiag?.cuadrosAceptados ?? 0}/${ultimoDiag?.cuadrosVistos ?? 0}`}
            />
            <Dato k="Versión de plantilla" v={String(VERSION_PLANTILLA)} />
          </div>

          {/*
            Estabilidad. Es lo que ninguna medición puntual contesta: si
            esta tablet aguanta un turno. El throttling térmico aparece a
            los veinte o treinta minutos y no se va; comparar la primera
            ventana contra la última es la única forma de verlo.
          */}
          <div className="rounded-xl border border-line bg-paper/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide text-ink-soft">
              <IconActivityHeartbeat size={14} /> Estabilidad
            </p>
            <Dato
              k="Corriendo"
              v={`${Math.round((ultimoDiag?.estabilidad.msCorriendo ?? 0) / 1000)} s`}
            />
            <Dato
              k="Percepción inicial → reciente"
              v={`${ultimoDiag?.estabilidad.msPercepcionInicial ?? '—'} → ${ultimoDiag?.estabilidad.msPercepcionReciente ?? '—'} ms`}
            />
            <Dato
              k="Degradación"
              v={
                ultimoDiag?.estabilidad.degradacionPct === null ||
                ultimoDiag?.estabilidad.degradacionPct === undefined
                  ? 'sin datos aún'
                  : `${ultimoDiag.estabilidad.degradacionPct} %`
              }
            />
            <Dato
              k="Heap JS"
              v={`${ultimoDiag?.estabilidad.memoriaJsInicialMb ?? '—'} → ${ultimoDiag?.estabilidad.memoriaJsMb ?? '—'} MB`}
            />
            <Dato
              k="Cuadros perdidos"
              v={String(ultimoDiag?.estabilidad.cuadrosPerdidos ?? 0)}
            />
            <p className="mt-2 leading-relaxed text-ink-soft">
              Dejá esta pantalla abierta al menos <strong>10 minutos</strong>{' '}
              con alguien delante cada tanto. La degradación se compara contra
              los primeros 30 s: por encima del 30 % la tablet está haciendo
              throttling y no va a aguantar un turno.
            </p>
          </div>

          {ultimoDiag && ultimoDiag.incidencias.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 font-bold uppercase tracking-wide text-amber-900">
                Incidencias
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-900">
                {ultimoDiag.incidencias.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-line bg-paper/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide text-ink-soft">
              <IconRuler size={14} /> Calibración
            </p>
            <Dato k="Muestras" v={String(muestras.length)} />
            <Dato k="Pares genuinos" v={String(genuinas.length)} />
            <Dato k="Pares impostores" v={String(impostoras.length)} />
            <Dato
              k="Genuinas: media / p95"
              v={`${n2(rg.media)} / ${n2(rg.p95)}`}
            />
            <Dato
              k="Impostoras: media / mín"
              v={`${n2(ri.media)} / ${n2(ri.minimo)}`}
            />
            <Dato k="Separación (d′)" v={n2(d)} />
            <Dato
              k="EER"
              v={cruce ? `${n2(cruce.umbral)} → ${pct(cruce.frr)}` : '—'}
            />
            <Dato
              k="UMBRAL RECOMENDADO"
              v={recomendado ? n2(recomendado.umbral) : '—'}
            />
            <Dato
              k="→ FRR esperado"
              v={recomendado ? pct(recomendado.frr) : '—'}
            />
            <Dato
              k="→ cota del FAR real (95 %)"
              v={impostoras.length > 0 ? pct(cota) : '—'}
            />
            <Dato
              k="Vigentes en SQL"
              v={`1:1 ${UMBRAL_VERIFICACION} · 1:N ${UMBRAL_IDENTIFICACION}`}
            />
            {recomendado?.advertencias.map((a) => (
              <p
                key={a}
                className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 leading-relaxed text-amber-900"
              >
                {a}
              </p>
            ))}
            <p className="mt-2 leading-relaxed text-ink-soft">
              El umbral recomendado se pone{' '}
              <strong>por debajo de la impostora más cercana</strong> que se
              haya visto, con margen. No en el EER: el EER supone que un falso
              positivo y un falso negativo cuestan lo mismo, y acá no. Aceptar a
              la persona equivocada mete una marca ajena en el registro horario
              y no lo detecta nadie; rechazar a la correcta cuesta que vuelva a
              mirar la cámara.
            </p>
            <p className="mt-1.5 leading-relaxed text-ink-soft">
              La <strong>cota del FAR</strong> es lo máximo que se puede afirmar
              con esta cantidad de pares (regla de tres). Cero impostores
              observados no es &quot;FAR cero&quot;: con {impostoras.length}{' '}
              pares, lo honesto es decir{' '}
              <strong>FAR por debajo de {pct(cota)}</strong>.
            </p>
            <p className="mt-1.5 leading-relaxed text-ink-soft">
              La separación <strong>d′</strong> es lo único que no depende del
              umbral: si al comparar dos implementaciones no sube, no hubo
              mejora, hubo un cambio de punto de operación.
            </p>
          </div>
        </div>
      </section>

      {muestras.length > 0 && (
        <section className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th className="py-2">#</th>
                <th>Sujeto</th>
                <th>Condición</th>
                <th className="text-right">Puntaje</th>
                <th className="text-right">Dist. a la 1ª del sujeto</th>
              </tr>
            </thead>
            <tbody>
              {muestras.map((m, i) => {
                const primera = muestras.find((x) => x.sujeto === m.sujeto);
                const dd =
                  primera && primera !== m
                    ? distanciasContra(primera.descriptor, [m.descriptor])[0]
                    : null;
                return (
                  <tr key={i} className="border-b border-line/50">
                    <td className="py-1.5 font-mono">{i + 1}</td>
                    <td>{m.sujeto}</td>
                    <td>{m.condicion}</td>
                    <td className="text-right font-mono">
                      {m.puntaje.toFixed(2)}
                    </td>
                    <td className="text-right font-mono">
                      {dd === null ? '—' : n2(dd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <details className="rounded-xl border border-line bg-paper/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Informe en texto
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[0.7rem] leading-relaxed text-ink-soft">
          {informe()}
        </pre>
      </details>
    </div>
  );
};

export default DiagnosticoFacialPage;
