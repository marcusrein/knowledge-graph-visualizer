import { memo } from 'react';

interface AvatarProps {
  address: string;
}

// Deterministic color but avoid node blue/purple hues (200-300)
const addressToColor = (addr: string) => {
  let hash = 0;
  for (let i = 0; i < addr.length; i++) {
    hash = addr.charCodeAt(i) + ((hash << 5) - hash);
  }
  let hue = Math.abs(hash) % 360;
  if (hue >= 200 && hue <= 300) {
    hue = (hue + 120) % 360;
  }
  const saturation = 70;
  const lightness = 50;
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
};

const Avatar = ({ address }: AvatarProps) => {
  const color = addressToColor(address);
  const shortenedAddress = `${address.slice(0, 4)}…${address.slice(-4)}`;

  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white tooltip"
      style={{ backgroundColor: color }}
      data-tip={shortenedAddress}
    >
      {address.slice(2, 4).toUpperCase()}
    </div>
  );
};

export default memo(Avatar); 