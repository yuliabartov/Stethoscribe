import logoIcon from '../assets/logo-icon.png';

interface AppIconProps {
  size: number;
  style?: React.CSSProperties;
}

export function AppIcon({ size, style }: AppIconProps) {
  return <img src={logoIcon} alt="Stethoscribe" style={{ width: size, height: 'auto', ...style }} />;
}
