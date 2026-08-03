'use client';

import Link from 'next/link';
import { IconBuildingFactory2, IconSettings } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Panel } from '@/components/app/Panel';
import { ConfigPlataformaForm } from '@/components/app/configuracion/ConfigPlataformaForm';
import { EquipoIseo } from '@/components/app/plataforma/EquipoIseo';

/**
 * Lo que es de ISEO, no de ningún cliente.
 *
 * Antes esto vivía adentro de "Configuración", que mostraba una cosa u
 * otra según si había una empresa activa: el mismo ítem del menú
 * significaba dos cosas que no tienen nada que ver. Acá quedan los
 * defaults de la plataforma y el equipo; la configuración de cada
 * empresa es de esa empresa y se ajusta entrando a ella.
 *
 * El registro de errores se sacó a propósito: esta pantalla la usa quien
 * administra RRHH, no quien programa. Los errores se siguen guardando en
 * `errores_app` para poder diagnosticar desde la base cuando haga falta.
 */
const PlataformaPage = () => {
  const { usuario } = useAuth();

  if (!usuario || usuario.rol !== 'superadmin') {
    return (
      <p className="text-sm text-ink-soft">
        No tenés permisos para ver esta sección.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
          <IconSettings size={24} className="text-ink-soft" />
          Plataforma
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          La configuración de ISEO: lo que aplica a todos los clientes y a tu
          equipo. Lo de cada empresa —horarios, módulos, cargas— se ajusta
          entrando a ella.
        </p>
      </div>

      <Panel className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-soft">
          ¿Buscabas la configuración de un cliente? Está en su ficha.
        </p>
        <Link
          href="/empresas"
          className="presionable inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-brand-300"
        >
          <IconBuildingFactory2 size={16} />
          Ir a Empresas
        </Link>
      </Panel>

      <ConfigPlataformaForm />

      <EquipoIseo />
    </div>
  );
};

export default PlataformaPage;
