'use client';

import Link from 'next/link';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
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
      compacto ? 'text-[0.65rem]' : 'text-xs'
    } ${
      falta.severidad === 'bloquea'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'
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
        frena ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      Faltan {faltas.length} datos
    </span>
  );
};

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
  if (faltas.length === 0) return null;
  const frena = bloquea(faltas);
  const Icono = frena ? IconAlertTriangle : IconInfoCircle;

  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        frena ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      } ${className}`}
    >
      <p
        className={`flex items-center gap-2 text-sm font-bold ${
          frena ? 'text-red-900' : 'text-amber-900'
        }`}
      >
        <Icono size={18} />
        {titulo ??
          (faltas.length === 1
            ? 'Falta un dato'
            : `Faltan ${faltas.length} datos`)}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {faltas.map((f) => (
          <li
            key={f.clave}
            className={`text-xs leading-relaxed ${
              frena ? 'text-red-900' : 'text-amber-900'
            }`}
          >
            <span className="font-bold">{f.titulo}.</span> {f.detalle}{' '}
            {f.ruta ? (
              <Link
                href={f.ruta}
                className={`font-semibold underline underline-offset-2 ${
                  frena ? 'text-red-900' : 'text-amber-900'
                }`}
              >
                {f.comoSeArregla}
              </Link>
            ) : (
              <span className="font-semibold">{f.comoSeArregla}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
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
  const Icono = frena ? IconAlertTriangle : IconInfoCircle;

  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        frena ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      } ${className}`}
    >
      <p
        className={`flex items-center gap-2 text-sm font-bold ${
          frena ? 'text-red-900' : 'text-amber-900'
        }`}
      >
        <Icono size={18} />
        {titulo ??
          (conAlgo.length === 1
            ? 'A 1 persona le falta algo'
            : `A ${conAlgo.length} personas les falta algo`)}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {grupos.map((g) => (
          <li
            key={g.falta.clave}
            className={`text-xs leading-relaxed ${
              frena ? 'text-red-900' : 'text-amber-900'
            }`}
          >
            <span className="font-bold">
              {g.falta.titulo} ({g.nombres.length})
            </span>{' '}
            — {g.nombres.slice(0, 3).join(', ')}
            {g.nombres.length > 3 && ` y ${g.nombres.length - 3} más`}.{' '}
            {g.falta.detalle}{' '}
            {g.falta.ruta ? (
              <Link
                href={destinoDe(g.falta, g.nombres.length) ?? g.falta.ruta}
                className={`font-semibold underline underline-offset-2 ${
                  frena ? 'text-red-900' : 'text-amber-900'
                }`}
              >
                {g.falta.comoSeArregla}
              </Link>
            ) : (
              <span className="font-semibold">{g.falta.comoSeArregla}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
