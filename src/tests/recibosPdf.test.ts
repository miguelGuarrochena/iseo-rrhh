import {
  agruparPorDueno,
  clasificarArchivo,
  cuilsEnTexto,
  dnisEnTexto,
  duenoDePagina,
} from '@/lib/recibosPdf';

const ana = { id: 'ana', dni: '25123456', cuil: '27-25123456-4' };
const beto = { id: 'beto', dni: '30987654', cuil: '20-30987654-3' };
const equipo = [ana, beto];
const CUIT_EMPRESA = '30-71234567-1';

/** Texto parecido al que sale de un recibo real. */
const recibo = (nombre: string, cuil: string, dni: string) => `
  RECIBO DE HABERES — Periodo 11/2025
  Empleador: ISEO SRL  CUIT 30-71234567-1
  Apellido y Nombre: ${nombre}
  CUIL ${cuil}   DNI ${dni}
  Sueldo basico          1.707.317,07
  Total Neto             1.400.000,00
`;

describe('cuilsEnTexto', () => {
  it('lee CUIL con guiones, con puntos y pegado', () => {
    expect(cuilsEnTexto('CUIL 27-25123456-4')).toEqual(['27251234564']);
    expect(cuilsEnTexto('CUIL 27.25123456.4')).toEqual(['27251234564']);
    expect(cuilsEnTexto('CUIL 27251234564')).toEqual(['27251234564']);
  });

  it('no confunde un importe largo con un CUIL', () => {
    expect(cuilsEnTexto('Total 1.707.317,07')).toEqual([]);
    expect(cuilsEnTexto('123456789012345')).toEqual([]);
  });

  it('devuelve todos los distintos, sin repetir', () => {
    const t = 'CUIT 30-71234567-1 CUIL 27-25123456-4 CUIL 27-25123456-4';
    expect(cuilsEnTexto(t).sort()).toEqual(['27251234564', '30712345671']);
  });
});

describe('dnisEnTexto', () => {
  it('lee DNI con y sin puntos', () => {
    expect(dnisEnTexto('DNI 25.123.456')).toEqual(['25123456']);
    expect(dnisEnTexto('DNI 25123456')).toEqual(['25123456']);
  });

  it('ignora números que no tienen largo de DNI', () => {
    expect(dnisEnTexto('Legajo 12 Periodo 112025000')).toEqual([]);
  });

  // Un recibo está lleno de números que no son documentos. Cada uno de
  // estos rompió (o casi) el reconocimiento en algún momento.
  it.each([
    ['Periodo 112025000', []],
    ['Orden 123456789', []],
    ['Legajo 1234567890', []],
    ['CBU 0110599520000001234501', []],
    ['Aportes 307.317,07', []],
    ['Jubilacion 11% 204.878,05', []],
    ['Total: 12.345.678,90', []],
    // Estos sí tienen forma de documento y deben leerse.
    ['Cod 1234567', ['1234567']],
    ['Total: 12.345.678', ['12345678']],
  ])('en "%s" encuentra %j', (texto, esperado) => {
    expect(dnisEnTexto(texto)).toEqual(esperado);
  });
});

describe('duenoDePagina', () => {
  it('identifica por el CUIL impreso', () => {
    const t = recibo('Aragon, Ana', '27-25123456-4', '25.123.456');
    expect(duenoDePagina(t, equipo, CUIT_EMPRESA)).toEqual({
      ok: true,
      empleadoId: 'ana',
      por: 'cuil',
    });
  });

  it('el CUIT del empleador no confunde', () => {
    // El recibo trae el CUIT de la empresa y el CUIL de la persona.
    const t = recibo('Aragon, Ana', '27-25123456-4', '25.123.456');
    expect(cuilsEnTexto(t)).toContain('30712345671');
    expect(duenoDePagina(t, equipo, CUIT_EMPRESA)).toEqual({
      ok: true,
      empleadoId: 'ana',
      por: 'cuil',
    });
  });

  it('cae al DNI si el CUIL no está cargado en la ficha', () => {
    const sinCuil = [{ id: 'ana', dni: '25123456' }];
    const t = 'Apellido y Nombre: Aragon, Ana  DNI 25.123.456';
    expect(duenoDePagina(t, sinCuil, CUIT_EMPRESA)).toEqual({
      ok: true,
      empleadoId: 'ana',
      por: 'dni',
    });
  });

  it('avisa cuando la página menciona a dos colaboradores', () => {
    const t = `${recibo('Ana', '27-25123456-4', '25.123.456')}
               ${recibo('Beto', '20-30987654-3', '30.987.654')}`;
    expect(duenoDePagina(t, equipo, CUIT_EMPRESA)).toEqual({
      ok: false,
      motivo: 'varios',
    });
  });

  it('distingue un PDF sin texto de uno con gente ajena', () => {
    expect(duenoDePagina('', equipo, CUIT_EMPRESA)).toEqual({
      ok: false,
      motivo: 'sin_documento',
    });
    expect(duenoDePagina('CUIL 20-11111111-2', equipo, CUIT_EMPRESA)).toEqual({
      ok: false,
      motivo: 'desconocido',
    });
  });
});

describe('agruparPorDueno', () => {
  const pagAna = recibo('Ana', '27-25123456-4', '25.123.456');
  const pagBeto = recibo('Beto', '20-30987654-3', '30.987.654');

  it('junta las páginas seguidas de la misma persona', () => {
    const t = agruparPorDueno([pagAna, pagAna, pagBeto], equipo, CUIT_EMPRESA);
    expect(t).toEqual([
      { empleadoId: 'ana', paginas: [0, 1] },
      { empleadoId: 'beto', paginas: [2] },
    ]);
  });

  // El duplicado del recibo muchas veces no repite el CUIL.
  it('la hoja sin documento continúa el recibo anterior', () => {
    const t = agruparPorDueno(
      [pagAna, 'Duplicado', pagBeto],
      equipo,
      CUIT_EMPRESA
    );
    expect(t[0]).toEqual({ empleadoId: 'ana', paginas: [0, 1] });
    expect(t[1]).toEqual({ empleadoId: 'beto', paginas: [2] });
  });

  it('separa a la misma persona si vuelve más adelante', () => {
    const t = agruparPorDueno([pagAna, pagBeto, pagAna], equipo, CUIT_EMPRESA);
    expect(t.map((x) => x.empleadoId)).toEqual(['ana', 'beto', 'ana']);
  });

  it('un PDF vacío no genera tramos', () => {
    expect(agruparPorDueno([], equipo, CUIT_EMPRESA)).toEqual([]);
  });
});

describe('clasificarArchivo', () => {
  const pagAna = recibo('Ana', '27-25123456-4', '25.123.456');
  const pagBeto = recibo('Beto', '20-30987654-3', '30.987.654');

  it('un PDF de una sola persona es individual', () => {
    const t = agruparPorDueno([pagAna, pagAna], equipo, CUIT_EMPRESA);
    expect(clasificarArchivo(t)).toEqual({
      tipo: 'individual',
      empleadoId: 'ana',
    });
  });

  // Este es el caso que le filtraba los sueldos a los compañeros.
  it('detecta el export con toda la nómina', () => {
    const t = agruparPorDueno([pagAna, pagBeto], equipo, CUIT_EMPRESA);
    expect(clasificarArchivo(t)).toEqual({ tipo: 'consolidado', personas: 2 });
  });

  it('marca como ilegible un PDF escaneado', () => {
    const t = agruparPorDueno(['', '  '], equipo, CUIT_EMPRESA);
    expect(clasificarArchivo(t)).toEqual({ tipo: 'ilegible' });
  });

  it('marca como desconocido a alguien que no es de la empresa', () => {
    const t = agruparPorDueno(['CUIL 20-11111111-2'], equipo, CUIT_EMPRESA);
    expect(clasificarArchivo(t)).toEqual({ tipo: 'desconocido' });
  });

  // Este apareció probando en el navegador con un PDF de tres personas
  // donde sólo una tenía el CUIL cargado. Se clasificaba como individual
  // y las páginas de los otros dos viajaban pegadas a su recibo.
  it('una persona reconocida + páginas ajenas NO es individual', () => {
    const t = agruparPorDueno(
      [pagAna, 'CUIL 20-44555666-7 FANTASMA, FULANO'],
      equipo,
      CUIT_EMPRESA
    );
    expect(clasificarArchivo(t)).toEqual({ tipo: 'consolidado', personas: 1 });
  });

  it('sigue siendo individual si todas las páginas son de esa persona', () => {
    const t = agruparPorDueno([pagAna, 'DUPLICADO'], equipo, CUIT_EMPRESA);
    expect(clasificarArchivo(t)).toEqual({
      tipo: 'individual',
      empleadoId: 'ana',
    });
  });
});

// Casos que aparecieron al probar contra PDFs generados de verdad, no
// contra texto inventado. Los dos rompían el agrupado en producción.
describe('trampas de un recibo real', () => {
  it('un importe argentino no se confunde con un DNI', () => {
    // 1.707.317,07 tiene exactamente la forma de un DNI con puntos.
    expect(dnisEnTexto('Sueldo basico 1.707.317,07')).toEqual([]);
    expect(dnisEnTexto('$ 1.400.000,00')).toEqual([]);
    expect(dnisEnTexto('Neto 1.400.000,00 Bruto 1.707.317,07')).toEqual([]);
    expect(dnisEnTexto('DNI 25.123.456 Neto 1.400.000,00')).toEqual([
      '25123456',
    ]);
  });

  it('el CUIT del empleador no cuenta como documento de una persona', () => {
    // Va impreso en el encabezado de todas las hojas, duplicado incluido.
    const duplicado = 'Empleador: ISEO SRL CUIT 30-71234567-1 DUPLICADO';
    expect(duenoDePagina(duplicado, equipo, CUIT_EMPRESA)).toEqual({
      ok: false,
      motivo: 'sin_documento',
    });
    // Sin decirle cuál es el CUIT, lo lee como el documento de un ajeno.
    expect(duenoDePagina(duplicado, equipo)).toEqual({
      ok: false,
      motivo: 'desconocido',
    });
  });

  it('la hoja de alguien no cargado no se pega al recibo anterior', () => {
    // Si se pegara, esa persona abriría su recibo y vería el del otro.
    const paginas = [
      recibo('Ana', '27-25123456-4', '25.123.456'),
      'Empleador: ISEO SRL CUIT 30-71234567-1 DUPLICADO',
      recibo('Fantasma', '20-44555666-7', '44.555.666'),
      recibo('Beto', '20-30987654-3', '30.987.654'),
    ];
    const tramos = agruparPorDueno(paginas, equipo, CUIT_EMPRESA);
    expect(tramos).toEqual([
      { empleadoId: 'ana', paginas: [0, 1] },
      { empleadoId: null, paginas: [2], motivo: 'desconocido' },
      { empleadoId: 'beto', paginas: [3] },
    ]);
  });
});
