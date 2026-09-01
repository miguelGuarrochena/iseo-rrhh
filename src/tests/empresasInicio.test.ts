import { empresasMock } from '@/lib/mocks/empresa';
import { getEmpresas, getEmpresasInicio } from '@/lib/services/rrhh';
import { Empresa, LIMITE_EMPRESAS_INICIO } from '@/types/rrhh';

const extras: Empresa[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return {
    id: `emp-extra-${String(n).padStart(2, '0')}`,
    nombre: `Cliente extra ${n}`,
    cuit: `30-8000000${n}-0`,
    estado: 'activa',
    contactoNombre: 'Test',
    contactoEmail: `extra${n}@iseo.test`,
    config: empresasMock[0].config,
    creadaEn: `2026-08-${String(n).padStart(2, '0')}`,
  };
});

describe('getEmpresasInicio', () => {
  const cantidadOriginal = empresasMock.length;

  afterEach(() => {
    empresasMock.splice(cantidadOriginal);
  });

  it('con pocos clientes los devuelve todos, de más nuevo a más viejo', async () => {
    const lista = await getEmpresasInicio();
    expect(lista.map((r) => r.empresa.id)).toEqual(['emp-2', 'emp-3', 'emp-1']);
    expect(lista.find((r) => r.empresa.id === 'emp-2')?.empleadosActivos).toBe(
      11
    );
  });

  it('no devuelve más del tope: se queda con las más recientes', async () => {
    empresasMock.push(...extras);
    expect(empresasMock.length).toBeGreaterThan(LIMITE_EMPRESAS_INICIO);

    const preview = await getEmpresasInicio();
    const catalogo = await getEmpresas();

    expect(catalogo).toHaveLength(cantidadOriginal + extras.length);
    expect(preview).toHaveLength(LIMITE_EMPRESAS_INICIO);
    expect(preview.map((r) => r.empresa.id)).toEqual(
      extras
        .slice()
        .sort(
          (a, b) =>
            b.creadaEn.localeCompare(a.creadaEn) || b.id.localeCompare(a.id)
        )
        .slice(0, LIMITE_EMPRESAS_INICIO)
        .map((e) => e.id)
    );
    expect(preview.every((r) => r.empresa.id.startsWith('emp-extra-'))).toBe(
      true
    );
  });
});
