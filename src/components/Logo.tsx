import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  /** Tamaño del logo: 'sm' para la navbar, 'lg' para el footer/hero. */
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'w-[180px] h-[54px] sm:w-[210px] sm:h-[62px]',
  md: 'w-[200px] h-[60px]',
  lg: 'w-[240px] h-[72px] sm:w-[288px] sm:h-[86px]',
};

export const Logo: React.FC<LogoProps> = ({ className, size = 'sm' }) => {
  return (
    <div
      style={{ position: 'relative' }}
      className={`${sizeMap[size]} ${className || ''}`}
    >
      <Image
        src="/logo.svg"
        alt="ISEO RH"
        fill
        sizes="(max-width: 640px) 170px, 288px"
        style={{
          objectFit: 'contain',
          objectPosition: 'left center',
        }}
        priority
      />
    </div>
  );
};
