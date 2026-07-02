import { color } from '../theme';

interface AppIconProps {
  size: number;
  style?: React.CSSProperties;
}

export function AppIcon({ size, style }: AppIconProps) {
  return (
    <svg viewBox="0 0 170 170" width={size} height={size} style={style}>
      <rect width="170" height="170" rx="40" fill={color.teal} />
      <g transform="translate(85,85) scale(0.82) translate(-136,-115)">
        <circle cx="108" cy="56" r="6.5" fill="#F5FBFA" />
        <circle cx="164" cy="56" r="6.5" fill="#F5FBFA" />
        <path d="M108 62 C 106 86, 124 92, 136 96" fill="none" stroke="#F5FBFA" strokeWidth="9" strokeLinecap="round" />
        <path d="M164 62 C 166 86, 148 92, 136 96" fill="none" stroke="#F5FBFA" strokeWidth="9" strokeLinecap="round" />
        <path d="M136 96 C 136 116, 136 124, 136 140" fill="none" stroke="#F5FBFA" strokeWidth="9" strokeLinecap="round" />
        <path d="M125 140 L147 140 L136 166 Z" fill="#F5FBFA" />
        <line x1="110" y1="174" x2="162" y2="174" stroke="#F5FBFA" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}
