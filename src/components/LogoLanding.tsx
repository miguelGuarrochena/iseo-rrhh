import React from 'react';
import Image from 'next/image';

interface LogoLandingProps {
  /** 'oscura' invierte el texto para fondos oscuros (footer). */
  variante?: 'clara' | 'oscura';
  className?: string;
}

/**
 * Marca de la landing: el isotipo circular nuevo + el nombre en texto.
 * Va aparte del componente `Logo` de la app para poder probarlo acá
 * sin tocar el resto del producto.
 */
export const LogoLanding: React.FC<LogoLandingProps> = ({
  variante = 'clara',
  className = '',
}) => (
  <span className={`flex items-center gap-2.5 ${className}`}>
    <Image
      src="/logo-iseo-marca.png"
      alt=""
      aria-hidden
      width={96}
      height={96}
      priority
      className="h-10 w-10 rounded-full sm:h-11 sm:w-11"
    />
    <span
      className={`whitespace-nowrap text-[1.15rem] font-bold tracking-[0.09em] sm:text-[1.3rem] ${
        variante === 'oscura' ? 'text-white' : 'text-[#14336B]'
      }`}
    >
      ISEO <span className="text-[#CE9E56]">RH</span>
    </span>
  </span>
);
