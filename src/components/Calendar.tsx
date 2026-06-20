import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export function Calendar() {
  const [days, setDays] = useState<number[]>([]);
  const [currentDate, setCurrentDate] = useState<number>(0);

  useEffect(() => {
    const dateNow = new Date();
    const dayOfWeek = dateNow.getDay();
    const date = dateNow.getDate();
    setCurrentDate(date);

    const qtyOfDaysPrev = new Date(dateNow.getFullYear(), dateNow.getMonth(), 0).getDate();
    const qtyOfDaysCur = new Date(dateNow.getFullYear(), dateNow.getMonth() + 1, 0).getDate();

    let startText = 0;
    let monthType = '';

    if (date > dayOfWeek) {
      startText = date - dayOfWeek - 1;
      monthType = 'Cur';
    } else {
      startText = date - dayOfWeek + qtyOfDaysPrev - 1;
      monthType = 'Prev';
    }

    const calculatedDays: number[] = [];
    let text = startText;
    let currentMonth = monthType;

    for (let i = 0; i < 28; i++) {
      if (currentMonth === 'Prev' && text + 1 > qtyOfDaysPrev) {
        text = 1;
        currentMonth = 'Cur';
      } else if (currentMonth === 'Cur' && text + 1 > qtyOfDaysCur) {
        text = 1;
        currentMonth = 'Next';
      } else {
        text += 1;
      }
      calculatedDays.push(text);
    }
    setDays(calculatedDays);
  }, []);

  return (
    <motion.div 
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mt-6 flex flex-wrap gap-2"
    >
      {days.map((day, i) => (
        <div
          key={i}
          className={`flex h-[calc((100vw-80px)/7)] w-[calc((100vw-80px)/7)] items-center justify-center rounded-full text-[#d5ccab] ${day === currentDate ? 'bg-[#505143]' : 'bg-[#a3a289]'}`}
        >
          {day}
        </div>
      ))}
    </motion.div>
  );
}
