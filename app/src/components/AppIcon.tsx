import logoIcon from '../assets/logo-icon.png';

interface AppIconProps {
  size: number;
  style?: React.CSSProperties;
}

export function AppIcon({ size, style }: AppIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.235),
        background: '#F6F1EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <img src={logoIcon} alt="Stethoscribe" style={{ width: '60%', height: 'auto' }} />
    </div>
  );
}
