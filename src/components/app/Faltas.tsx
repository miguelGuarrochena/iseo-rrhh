'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconInfoCircle,
} from '@tabler/icons-react';
import { Falta, bloquea } from '@/lib/requisitos';

/**
 * Cómo se muestra lo que falta. Un solo lugar para que "sin cuenta" se
 * vea igual en Recibos, en la ficha y en Documentos a firmar: si cada
 * pantalla lo dibuja a su manera, la mitad termina no dibujándolo.
 *
 * El color separa lo que frena de lo que sólo avisa. Rojo es "corregí
 * esto o alguien ve el dato de otra persona"; ámbar es "se puede seguir,
 * pero enterate". Si todo fuera rojo nadie leería ninguno.
 */

export const ChipFalta = ({
  falta,
  compacto = false,
}: {
  falta: Falta;
  compacto?: boolean;
}) => (
  <span
    title={`${falta.detalle} ${falta.comoSeArregla}`}
    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-bold ${
      compacto ? 'text-[0.6875rem]' : 'text-xs'
    } ${
      falta.severidad === 'bloquea'
        ? 'bg-red-100 text-red-800'
        : 'border border-line bg-paper text-ink'
    }`}
  >
    {falta.titulo}
  </span>
);

/**
 * Resumen de una persona en una fila de lista: un chip si falta una
 * cosa, un contador si faltan varias. Enumerar cinco chips por fila
 * convierte la lista en un tablero ilegible.
 */
export const ChipsFaltas = ({ faltas }: { faltas: Falta[] }) => {
  if (faltas.length === 0) return null;
  if (faltas.length === 1) return <ChipFalta falta={faltas[0]} compacto />;
  const frena = bloquea(faltas);
  return (
    <span
      title={faltas.map((f) => `${f.titulo}: ${f.detalle}`).join('\n\n')}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${
        frena
          ? 'bg-red-100 text-red-800'
          : 'border border-line bg-paper text-ink'
      }`}
    >
      Faltan {faltas.length} datos
    </span>
  );
};

/**
 * Cuántos avisos se ven antes de tener que pedir el resto.
 *
 * Una empresa con cuarenta legajos a medio cargar junta siete u ocho
 * grupos, y cada uno son tres renglones: el cartel pasaba los 600px y
 * empujaba fuera de la pantalla justo lo que el aviso pedía mirar. Tres
 * entran de un vistazo y el resto está a un click.
 *
 * Lo que frena no se recorta nunca: ahí el costo de no verlo es que
 * alguien termine viendo el dato de otra persona.
 */
const VISIBLES = 3;

/**
 * La caja del aviso.
 *
 * Sin el lavado amarillo: fondo paper (el celeste suave de la app) y
 * borde de marca. Se distingue de los paneles blancos sin gritar.
 */
const Cartel = ({
  frena,
  titulo,
  children,
  className = '',
}: {
  frena: boolean;
  titulo: string;
  children: ReactNode;
  className?: string;
}) => {
  const Icono = frena ? IconAlertTriangle : IconInfoCircle;
  return (
    <div
      className={`rounded-3xl border bg-paper p-4 sm:p-5 ${
        frena ? 'border-red-200' : 'border-brand-200'
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            frena ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'
          }`}
        >
          <Icono size={19} stroke={2} />
        </span>
        <p className="min-w-0 text-[0.9375rem] font-bold text-ink">{titulo}</p>
      </div>
      {/* `list-none`: el reset de la app saca el padding de la lista pero
          no el marcador, así que a la izquierda de cada tarjeta quedaba
          un puntito suelto, afuera de la caja. */}
      <ul className="mt-3.5 flex list-none flex-col gap-2">{children}</ul>
    </div>
  );
};

/**
 * Una falta. Cuatro niveles distintos y cada uno con su tratamiento:
 * qué falta (título), a quiénes (nombres), qué consecuencia tiene
 * (cuerpo) y qué hacer (acción, en el azul con el que la app marca todo
 * lo que se puede tocar).
 */
const ItemFalta = ({
  frena,
  titulo,
  cuantos,
  personas,
  detalle,
  accion,
  ruta,
}: {
  frena: boolean;
  titulo: string;
  cuantos?: number;
  personas?: string;
  detalle: string;
  accion: string;
  ruta?: string;
}) => (
  <li className="rounded-2xl border border-line bg-surface px-4 py-3.5">
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[0.9375rem] font-bold text-ink">{titulo}</p>
      {cuantos !== undefined && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            frena ? 'bg-red-100 text-red-800' : 'bg-paper text-ink-soft'
          }`}
        >
          {cuantos}
        </span>
      )}
    </div>
    {personas && (
      <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
        {personas}
      </p>
    )}
    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{detalle}</p>
    {ruta ? (
      <Link
        href={ruta}
        className="mt-2.5 inline-flex items-start gap-1.5 text-sm font-bold text-brand-700 no-underline underline-offset-4 transition-colors hover:text-brand-600 hover:underline"
      >
        <IconArrowNarrowRight size={17} className="mt-0.5 shrink-0" />
        <span>{accion}</span>
      </Link>
    ) : (
      <p className="mt-2.5 text-sm font-semibold text-ink">{accion}</p>
    )}
  </li>
);

/** Botón para desplegar los avisos que quedaron guardados. */
const VerResto = ({
  cuantos,
  abierto,
  onCambiar,
}: {
  cuantos: number;
  abierto: boolean;
  onCambiar: () => void;
}) => (
  <li>
    <button
      type="button"
      onClick={onCambiar}
      className="presionable min-h-11 w-full cursor-pointer rounded-2xl border border-line bg-surface/60 px-4 text-sm font-bold text-ink-soft hover:bg-surface hover:text-ink"
    >
      {abierto
        ? 'Ver menos'
        : `Ver los otros ${cuantos} ${cuantos === 1 ? 'aviso' : 'avisos'}`}
    </button>
  </li>
);

/**
 * Panel con el detalle. Cada falta dice qué consecuencia tiene y lleva
 * al lugar donde se arregla: un aviso que no dice cómo salir de ahí es
 * sólo una molestia.
 */
export const BloqueFaltas = ({
  faltas,
  titulo,
  className = '',
}: {
  faltas: Falta[];
  titulo?: string;
  className?: string;
}) => {
  const [abierto, setAbierto] = useState(false);
  if (faltas.length === 0) return null;
  const frena = bloquea(faltas);
  const recorta = !frena && faltas.length > VISIBLES && !abierto;
  const visibles = recorta ? faltas.slice(0, VISIBLES) : faltas;

  return (
    <Cartel
      frena={frena}
      className={className}
      titulo={
        titulo ??
        (faltas.length === 1
          ? 'Falta un dato'
          : `Faltan ${faltas.length} datos`)
      }
    >
      {visibles.map((f) => (
        <ItemFalta
          key={f.clave}
          frena={frena}
          titulo={f.titulo}
          detalle={f.detalle}
          accion={f.comoSeArregla}
          ruta={f.ruta}
        />
      ))}
      {!frena && faltas.length > VISIBLES && (
        <VerResto
          cuantos={faltas.length - VISIBLES}
          abierto={abierto}
          onCambiar={() => setAbierto((v) => !v)}
        />
      )}
    </Cartel>
  );
};

/**
 * Lo mismo pero para varias personas: agrupa por falta en vez de por
 * persona. Al subir cuarenta recibos importa "a estos quince les falta
 * cuenta", no repetir el mismo párrafo quince veces.
 */
export const BloqueFaltasDeVarios = ({
  items,
  titulo,
  className = '',
}: {
  items: { nombre: string; faltas: Falta[] }[];
  titulo?: string;
  className?: string;
}) => {
  const [abierto, setAbierto] = useState(false);
  const conAlgo = items.filter((i) => i.faltas.length > 0);
  if (conAlgo.length === 0) return null;

  const porClave = new Map<string, { falta: Falta; nombres: string[] }>();
  for (const item of conAlgo) {
    for (const f of item.faltas) {
      const previo = porClave.get(f.clave);
      if (previo) previo.nombres.push(item.nombre);
      else porClave.set(f.clave, { falta: f, nombres: [item.nombre] });
    }
  }
  const grupos = [...porClave.values()].sort(
    (a, b) => b.nombres.length - a.nombres.length
  );

  /**
   * Algunas rutas llevan a la pantalla ya cargada con esa persona
   * (`/permisos?empleado=ple-3`). Acá el grupo es de varias y la de la
   * query es sólo la primera: se manda a la pantalla pelada, que es lo
   * que corresponde cuando el aviso habla de quince.
   */
  const destinoDe = (falta: Falta, cuantos: number) =>
    cuantos > 1 ? falta.ruta?.split('?')[0] : falta.ruta;
  const frena = grupos.some((g) => g.falta.severidad === 'bloquea');
  const recorta = !frena && grupos.length > VISIBLES && !abierto;
  const visibles = recorta ? grupos.slice(0, VISIBLES) : grupos;

  return (
    <Cartel
      frena={frena}
      className={className}
      titulo={
        titulo ??
        (conAlgo.length === 1
          ? 'A 1 persona le falta algo'
          : `A ${conAlgo.length} personas les falta algo`)
      }
    >
      {visibles.map((g) => (
        <ItemFalta
          key={g.falta.clave}
          frena={frena}
          titulo={g.falta.titulo}
          cuantos={g.nombres.length}
          personas={`${g.nombres.slice(0, 3).join(', ')}${
            g.nombres.length > 3 ? ` y ${g.nombres.length - 3} más` : ''
          }`}
          detalle={g.falta.detalle}
          accion={g.falta.comoSeArregla}
          ruta={destinoDe(g.falta, g.nombres.length) ?? g.falta.ruta}
        />
      ))}
      {!frena && grupos.length > VISIBLES && (
        <VerResto
          cuantos={grupos.length - VISIBLES}
          abierto={abierto}
          onCambiar={() => setAbierto((v) => !v)}
        />
      )}
    </Cartel>
  );
};
