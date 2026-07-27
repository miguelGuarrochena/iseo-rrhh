import {
  asignarPorNombre,
  idsDuplicados,
  tokensNumericos,
} from '@/lib/asignarRecibos';

const ana = {
  id: 'ana',
  dni: '25123456',
  cuil: '27-25123456-4',
  numeroLegajo: '1',
};
const beto = {
  id: 'beto',
  dni: '30987654',
  cuil: '20-30987654-3',
  numeroLegajo: '2',
};
const cora = {
  id: 'cora',
  dni: '33111222',
  cuil: '27-33111222-9',
  numeroLegajo: '104',
};

const equipo = [ana, beto, cora];

describe('tokensNumericos', () => {
  it('separa los números del nombre del archivo', () => {
    expect(tokensNumericos('27341555138-11. Noviembre 2025.pdf')).toEqual([
      '27341555138',
      '11',
      '2025',
    ]);
  });
});

describe('asignarPorNombre', () => {
  it('asigna por CUIL, con guiones o sin ellos', () => {
    expect(asignarPorNombre('27-25123456-4.pdf', equipo)).toEqual({
      empleadoId: 'ana',
      por: 'cuil',
    });
    expect(asignarPorNombre('27251234564 julio.pdf', equipo)).toEqual({
      empleadoId: 'ana',
      por: 'cuil',
    });
  });

  it('cae al DNI cuando no hay CUIL en el nombre', () => {
    expect(asignarPorNombre('recibo 30987654 junio.pdf', equipo)).toEqual({
      empleadoId: 'beto',
      por: 'dni',
    });
  });

  it('usa el legajo solo si tiene 3 dígitos o más', () => {
    expect(asignarPorNombre('legajo 104 - marzo.pdf', equipo)).toEqual({
      empleadoId: 'cora',
      por: 'legajo',
    });
  });

  // El bug que reportó el cliente: con legajos de 1 dígito, cualquier
  // número del nombre del archivo (el mes, el día, el año) matcheaba y el
  // recibo se le asignaba a la persona equivocada.
  it('no asigna por un legajo de un solo dígito', () => {
    const r = asignarPorNombre('Recibo 1. Noviembre 2025.pdf', equipo);
    expect(r.empleadoId).toBe('');
  });

  it('no asigna cuando el número del archivo es una fecha cualquiera', () => {
    const r = asignarPorNombre('recibos 11-2025.pdf', equipo);
    expect(r).toEqual({
      empleadoId: '',
      por: null,
      motivo: 'sin_coincidencia',
    });
  });

  it('ante dos candidatos posibles prefiere no asignar', () => {
    const mellizos = [
      { id: 'uno', dni: '40111222', numeroLegajo: '500' },
      { id: 'dos', dni: '40111222', numeroLegajo: '501' },
    ];
    expect(asignarPorNombre('40111222.pdf', mellizos)).toEqual({
      empleadoId: '',
      por: null,
      motivo: 'ambiguo',
    });
  });

  it('el CUIL le gana al DNI de otra persona', () => {
    // El nombre trae el CUIL de Ana y, de casualidad, el DNI de Beto.
    const r = asignarPorNombre('27251234564-30987654.pdf', equipo);
    expect(r).toEqual({ empleadoId: 'ana', por: 'cuil' });
  });

  it('ignora a quien no tenga el dato cargado', () => {
    const sinDatos = [{ id: 'x' }, { id: 'y', dni: '25123456' }];
    expect(asignarPorNombre('25123456.pdf', sinDatos)).toEqual({
      empleadoId: 'y',
      por: 'dni',
    });
  });
});

describe('idsDuplicados', () => {
  it('detecta dos archivos para la misma persona', () => {
    const dup = idsDuplicados([
      { empleadoId: 'ana' },
      { empleadoId: 'beto' },
      { empleadoId: 'ana' },
    ]);
    expect([...dup]).toEqual(['ana']);
  });

  it('no cuenta los que quedaron sin asignar', () => {
    const dup = idsDuplicados([{ empleadoId: '' }, { empleadoId: '' }]);
    expect(dup.size).toBe(0);
  });
});
