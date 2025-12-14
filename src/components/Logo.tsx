import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
  return (
    <div
      style={{ position: 'relative' }}
      className={`w-[240px] h-[72px] sm:w-[320px] sm:h-[96px] ${className || ''}`}
    >
      <Image
        src="/logo.svg"
        alt="ISEO RH"
        fill
        style={{
          objectFit: 'contain',
          objectPosition: 'left center',
        }}
        priority
      />
    </div>
  );
};
