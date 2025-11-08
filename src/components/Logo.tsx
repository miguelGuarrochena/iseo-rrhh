import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
  return (
    <div
      style={{ position: 'relative' }}
      className={`w-[180px] h-[54px] sm:w-[240px] sm:h-[72px] ${className || ''}`}
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
