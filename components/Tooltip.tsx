import React from 'react';
import Tippy from '@tippyjs/react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content }) => {
  return (
    <Tippy
      content={<div className="p-2 text-sm max-w-xs">{content}</div>}
      animation="fade"
      arrow={true}
      trigger="mouseenter focus"
      interactive={true}
    >
      <button className="text-gray-400 hover:text-white focus:outline-none">
        <HelpCircle size={16} />
      </button>
    </Tippy>
  );
};

export default Tooltip; 