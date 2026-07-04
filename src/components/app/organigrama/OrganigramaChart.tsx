'use client';

import { useEffect, useRef } from 'react';

export interface NodoOrgData {
  id: string;
  parentId: string;
  nombre: string;
  puesto: string;
  iniciales: string;
  esRaiz?: boolean;
}

const escapar = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      (
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<
          string,
          string
        >
      )[c]
  );

/** HTML de cada nodo (usa variables CSS para respetar claro/oscuro). */
const tarjeta = (d: NodoOrgData): string => {
  if (d.esRaiz) {
    return `<div style="height:100%;display:flex;align-items:center;justify-content:center;">
      <div style="border:1px solid rgb(var(--line-rgb));border-radius:9999px;background:rgb(var(--surface-rgb));padding:8px 18px;font-weight:700;font-size:13px;color:rgb(var(--ink-rgb));">${escapar(
        d.nombre
      )}</div>
    </div>`;
  }
  return `<div style="height:100%;padding-top:6px;box-sizing:border-box;">
    <div style="height:100%;box-sizing:border-box;border:1px solid rgb(var(--line-rgb));border-radius:16px;background:rgb(var(--surface-rgb));display:flex;align-items:center;gap:12px;padding:0 14px;cursor:pointer;">
      <div style="width:40px;height:40px;flex-shrink:0;border-radius:9999px;background:#dde6ff;color:#1d51d1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${escapar(
        d.iniciales
      )}</div>
      <div style="min-width:0;">
        <div style="font-weight:700;font-size:14px;color:rgb(var(--ink-rgb));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapar(
          d.nombre
        )}</div>
        <div style="font-size:12px;color:rgb(var(--ink-soft-rgb));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapar(
          d.puesto
        )}</div>
      </div>
    </div>
  </div>`;
};

interface OrganigramaChartProps {
  data: NodoOrgData[];
  /** Se llama con el id del empleado al clickear su nodo (no la raíz). */
  onNodo?: (id: string) => void;
}

export const OrganigramaChart = ({ data, onNodo }: OrganigramaChartProps) => {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const onNodoRef = useRef(onNodo);
  onNodoRef.current = onNodo;

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    let cancelado = false;

    void import('d3-org-chart').then(({ OrgChart }) => {
      if (cancelado || !ref.current) return;
      if (!chartRef.current) chartRef.current = new OrgChart();
      chartRef.current
        .container(ref.current)
        .data(data)
        .nodeWidth(() => 250)
        .nodeHeight(() => 76)
        .childrenMargin(() => 50)
        .siblingsMargin(() => 24)
        .compact(false)
        .nodeContent((d: { data: NodoOrgData }) => tarjeta(d.data))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .onNodeClick((param: any) => {
          const id =
            typeof param === 'string' ? param : (param?.data?.id ?? param?.id);
          const nodo = data.find((n) => n.id === id);
          if (nodo && !nodo.esRaiz) onNodoRef.current?.(id);
        })
        .render();
    });

    return () => {
      cancelado = true;
    };
  }, [data]);

  return (
    <div
      ref={ref}
      className="h-[70vh] w-full overflow-hidden rounded-2xl border border-line bg-paper/40"
    />
  );
};
