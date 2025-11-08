import React from 'react';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  width = 200,
  height = 60,
  className,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M10 15 H35 V20 H25 V45 H20 V20 H10 Z" fill="#1864ab" />
      <path
        d="M38 28 Q38 25 41 25 Q44 25 44 28 V45 H49 V44 Q49 42 51 42 Q53 42 53 44 V45 H48 V28 Q48 23 44 23 Q40 23 40 28 V45 H35 V28 Q35 23 38 23 Z"
        fill="#1864ab"
      />
      <rect x="56" y="15" width="4" height="30" fill="#1864ab" />
      <path
        d="M63 34 Q63 28 68 28 Q73 28 73 34 Q73 40 68 40 Q63 40 63 34 Z M67 34 Q67 31 68 31 Q69 31 69 34 Q69 37 68 37 Q67 37 67 34 Z"
        fill="#1864ab"
      />
      <path
        d="M76 28 V45 H80 V33 Q80 28 84 28 Q88 28 88 33 V45 H92 V33 Q92 25 84 25 Q76 25 76 28 Z"
        fill="#1864ab"
      />
      <path
        d="M95 20 V25 H92 V29 H95 V40 Q95 45 100 45 H102 V41 H100 Q99 41 99 40 V29 H102 V25 H99 V20 Z"
        fill="#1864ab"
      />
      <circle cx="110" cy="34" r="6" fill="#1864ab" />
      <circle cx="110" cy="34" r="3" fill="white" />
      <g transform="translate(125, 25)">
        <rect x="8" y="0" width="4" height="20" rx="2" fill="#228be6" />
        <rect x="0" y="8" width="20" height="4" rx="2" fill="#228be6" />
        <circle
          cx="10"
          cy="10"
          r="12"
          stroke="#228be6"
          strokeWidth="2"
          fill="none"
          opacity="0.3"
        />
      </g>
    </svg>
  );
};
