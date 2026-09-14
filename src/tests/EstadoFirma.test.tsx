import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  AvisoFirmaSinSello,
  FirmaBadge,
  ResultadoConstancia,
} from '@/components/app/recibos/EstadoFirma';
import { ReciboSueldo } from '@/types/rrhh';

const recibo = (parcial: Partial<ReciboSueldo> = {}): ReciboSueldo => ({
  id: 'r1',
  empleadoId: 'e1',
  periodo: '2026-08',
  tipo: 'mensual',
  archivoUrl: 'emp/e1/2026-08.pdf',
  estadoFirma: 'pendiente',
  ...parcial,
});

describe('EstadoFirma', () => {
  it('en pendiente no dice que está firmado', () => {
    render(<FirmaBadge recibo={recibo()} />);
    expect(screen.getByText('Pendiente de firma')).toBeInTheDocument();
  });

  it('en firmado muestra constancia digital, no un sello en el PDF', () => {
    render(
      <FirmaBadge
        recibo={recibo({ estadoFirma: 'firmado' })}
        fecha="14/09/2026"
      />
    );
    expect(screen.getByText(/Constancia digital/)).toBeInTheDocument();
    expect(screen.queryByText(/^Firmado/)).not.toBeInTheDocument();
  });

  it('el aviso aclara que el PDF no lleva sello', () => {
    render(<AvisoFirmaSinSello />);
    expect(screen.getByText(/no incluye un sello visual/i)).toBeInTheDocument();
  });

  it('si el archivo cambió, el resultado es una alerta de integridad', () => {
    render(
      <ResultadoConstancia
        resultado={{
          estado: 'no_coincide',
          esperado: 'aa',
          obtenido: 'bb',
        }}
      />
    );
    expect(
      screen.getByText(/El documento NO es el que se firmó/)
    ).toBeInTheDocument();
  });
});
