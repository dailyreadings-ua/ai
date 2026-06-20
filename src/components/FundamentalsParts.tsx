import React from 'react';
import { motion } from 'motion/react';

interface FundamentalsPartsProps {
  onSelectPart: (part: number) => void;
  onBack: () => void;
  key?: React.Key;
}

export function FundamentalsParts({ onSelectPart, onBack }: FundamentalsPartsProps) {
  const parts = [
    { 
      title: 'Часть I', 
      icon: 'M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z',
      color: 'bg-[#d5ccab]',
      textColor: 'text-[#878568]',
      iconColor: 'fill-[#878568]'
    },
    { 
      title: 'Часть II', 
      icon: 'M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z',
      color: 'bg-[#878568]',
      textColor: 'text-[#d5ccab]',
      iconColor: 'fill-[#d5ccab]'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex h-[10vh] min-h-[10vh] items-center justify-center text-[5vh] font-light text-[#878568]">
        Разделы
      </div>
      
      <div className="flex flex-1 flex-col gap-4 p-6 overflow-hidden">
        {parts.map((part, i) => (
          <motion.div
            key={part.title}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectPart(i + 1)}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl ${part.color} shadow-xl relative overflow-hidden group`}
          >
            <svg className={`h-[12vh] w-[12vh] mb-4 ${part.iconColor} z-10`} viewBox="0 0 512 512">
              <path d={part.icon} />
            </svg>
            <div className={`text-[5vh] font-bold ${part.textColor} z-10`}>{part.title}</div>
          </motion.div>
        ))}
      </div>

      <div 
        onClick={onBack}
        className="flex h-[10vh] min-h-[10vh] cursor-pointer items-center border-t border-[#a3a289]/20"
      >
        <div className="flex h-[10vh] w-[10vh] items-center justify-center">
          <svg className="h-[5vh] w-[5vh] fill-[#505143] opacity-20" viewBox="0 0 576 512">
            <path d="M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z" />
          </svg>
        </div>
        <div className="pl-4 text-[3vh] font-light text-[#505143] opacity-20">
          Вернуться
        </div>
      </div>
    </motion.div>
  );
}
