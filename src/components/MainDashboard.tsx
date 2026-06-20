import React from 'react';
import { motion } from 'motion/react';
import { Calendar } from './Calendar.tsx';
import { MainMenu } from './MainMenu.tsx';

interface MainDashboardProps {
  username: string;
  lessonCount: number;
  onNavigate: () => void;
  key?: React.Key;
}

export function MainDashboard({ username, lessonCount, onNavigate }: MainDashboardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative h-full w-full overflow-hidden"
    >
      <div className="p-4">
        {/* Приветствие */}
        <div className="flex h-[20vh] flex-col justify-center text-[50px] font-thin leading-[60px] text-[#878568]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="font-thin" style={{ fontWeight: 100 }}>ПРИВЕТ,</motion.div>
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="text-[70px] font-light text-[#505143]">{username}</motion.div>
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
