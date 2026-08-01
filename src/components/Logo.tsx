import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  /** Tamaño del logo: 'sm' para la navbar, 'lg' para el footer/hero. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * 'auto' sigue el tema de la app (claro/oscuro). 'sobre-oscuro' fuerza
   * la versión de trazo claro, para bloques oscuros de la landing.
   */
  tono?: 'auto' | 'sobre-oscuro';
}

const marcaMap: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'h-9 w-9 sm:h-10 sm:w-10',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

const textoMap: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'text-[1.15rem] sm:text-[1.3rem]',
  md: 'text-[1.3rem]',
  lg: 'text-[1.6rem]',
};

/**
 * Isotipo circular + el nombre en texto. En modo oscuro se cambia el
 * isotipo por la versión de trazo claro y el texto se aclara (reglas
 * `.logo-claro` / `.logo-oscuro` / `.logo-texto` en globals.css).
 */
export const Logo: React.FC<LogoProps> = ({
  className,
  size = 'sm',
  tono = 'auto',
}) => {
  const sobreOscuro = tono === 'sobre-oscuro';

  return (
    <span className={`flex items-center gap-2.5 ${className || ''}`}>
      <span className={`relative shrink-0 ${marcaMap[size]}`}>
        {sobreOscuro ? (
          <Image
            src="/logo-iseo-marca-dark.png"
            alt="ISEO RH"
            fill
            sizes="56px"
            className="object-contain"
            priority
          />
        ) : (
          <>
            <Image
              src="/logo-iseo-marca.png"
              alt="ISEO RH"
              fill
              sizes="56px"
              className="logo-claro rounded-full object-contain"
              priority
            />
            <Image
              src="/logo-iseo-marca-dark.png"
              alt=""
              aria-hidden
              fill
              sizes="56px"
              className="logo-oscuro object-contain"
              priority
            />
          </>
        )}
      </span>
      <span
        className={`logo-texto whitespace-nowrap font-bold tracking-[0.09em] ${
          sobreOscuro ? 'text-white' : 'text-[#14336B]'
        } ${textoMap[size]}`}
      >
        ISEO <span className="text-[#CE9E56]">RH</span>
      </span>
    </span>
  );
};
