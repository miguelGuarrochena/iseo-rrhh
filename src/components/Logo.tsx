import React from 'react';
import Image from 'next/image';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  width = 400,
  height = 120,
  className,
}) => {
  return (
    <div style={{ width, height, position: 'relative' }} className={className}>
      <Image
        src="/logo.svg"
        alt="ISEO RH"
        fill
        style={{ objectFit: 'contain' }}
        priority
      />
    </div>
  );
};
