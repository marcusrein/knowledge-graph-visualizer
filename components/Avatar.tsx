import { memo } from 'react';

interface AvatarProps {
  address: string;
}

// Simple hashing function to get a color from the address
const addressToColor = (address: string) => {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return `#${'00000'.substring(0, 6 - c.length)}${c}`;
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