import React from 'react';
import { motion } from 'motion/react';
import { Calendar } from './Calendar.tsx';
import { MainMenu } from './MainMenu.tsx';
import { User, Settings } from 'lucide-react';

interface MainDashboardProps {
  username: string;
  lessonCount: number;
  onNavigate: () => void;
  onOpenProfile: () => void;
  key?: React.Key;
}

export function MainDashboard({ username, lessonCount, onNavigate, onOpenProfile }: MainDashboardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative h-full w-full overflow-hidden"
    >
      <div className="p-4">
        {/* Кнопка настроек/профиля сверху справа */}
        <div className="flex justify-between items-center h-[5vh]">
          <span className="text-[1.8vh] font-light text-[#878568]/70">Кривая забывания</span>
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/40 hover:bg-white/60 text-[#505143] text-[1.5vh] font-medium transition-all active:scale-95 cursor-pointer border border-[#878568]/10"
            title="Открыть настройки профиля"
          >
            <User className="h-4 w-4" />
            Профиль
          </button>
        </div>

        {/* Приветствие */}
        <div 
          onClick={onOpenProfile}
          className="flex h-[20vh] flex-col justify-center text-[50px] font-thin leading-[60px] text-[#878568] cursor-pointer group hover:opacity-90 active:scale-99 transition-all"
        >
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="font-thin flex items-center gap-1.5" style={{ fontWeight: 100 }}>
            ПРИВЕТ, 
            <span className="text-[1.6vh] text-[#878568]/60 font-sans tracking-wide italic lowercase opacity-0 group-hover:opacity-100 transition-opacity">(настройки профиля)</span>
          </motion.div>
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="text-[70px] font-light text-[#505143] border-b border-transparent group-hover:border-b-[#505143]/20 pb-1 self-start select-none transition-all duration-300">
            {username}
          </motion.div>
        </div>
        
        {/* Счёт уроков */}
        <div className="flex justify-end pr-2 text-[6vh] font-thin text-[#878568]">
          {lessonCount}
        </div>

        <Calendar />
      </div>
      
      <MainMenu onNavigate={onNavigate} />
    </motion.div>
  );
}
