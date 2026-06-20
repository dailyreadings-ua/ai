import React from 'react';
import { motion } from 'motion/react';
import { FundData, StudyingLesson } from '../types.ts';
import { PHASE_TEXTS, getLessonStatusText } from '../constants.ts';

interface LessonListProps {
  data: FundData;
  onSelectLesson: (i: number) => void;
  completedIds: string[];
  studyingLessons: StudyingLesson[];
  onToggleStudy: (lessonIndex: number, title: string) => void;
  onBack: () => void;
  currentPart: number;
  key?: React.Key;
}

export function LessonList({ 
  data, 
  onSelectLesson, 
  completedIds,
  studyingLessons,
  onToggleStudy,
  onBack,
  currentPart
}: LessonListProps) {
  const titles = data[1];
  const lessons = data[2];

  // Periodic re-render to update timers
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000); // refresh every minute
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col overflow-hidden"
    >
       <div className="flex h-[10vh] items-center justify-center text-[5vh] font-light text-[#878568]">
        Уроки
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 gap-3">
        {titles.map((title, index) => {
          const lessonVerses = lessons.filter(l => l.chapter === index).flatMap(l => l.texts).map(id => String(id));
          const totalInLesson = lessonVerses.length;
          const completedInLesson = lessonVerses.filter(id => completedIds.includes(id)).length;
          const progress = totalInLesson > 0 ? (completedInLesson / totalInLesson) * 100 : 0;

          // Check if this lesson is in studying state for the current part
          const activeStudy = studyingLessons.find(
            s => s.lessonIndex === index && s.part === currentPart
          );

          return (
            <motion.div
              key={index}
              initial={{ x: -25, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.04, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="group relative flex flex-col justify-center rounded-2xl bg-white/45 p-4 border border-[#a3a289]/10 shadow-sm hover:shadow-md transition-shadow"
            >
              <div 
                onClick={() => onSelectLesson(index)}
                className="flex items-start cursor-pointer"
              >
                <div className="flex h-[5.5vh] w-[5.5vh] min-w-[5.5vh] items-center justify-center rounded-full bg-[#878568] text-[2.2vh] font-bold text-[#d5ccab] shadow-sm mt-0.5">
                  {index + 1}
                </div>
                <div className="flex flex-1 flex-col pl-4">
                  <div className="text-[2.1vh] font-light leading-tight text-[#505143] uppercase break-words mb-1">
                    {title}
                  </div>
                  {/* Progress Bar Container */}
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#a3a289]/30 border border-[#a3a289]/10">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-[#878568]" 
                    />
                  </div>
                  <div className="mt-1 text-[1.2vh] text-[#a3a289] font-medium">
                    Стихи: {completedInLesson} / {totalInLesson}
                  </div>
                </div>
              </div>

              {/* Study Control Panel */}
              <div className="mt-3 flex items-center justify-between border-t border-[#a3a289]/10 pt-3 gap-3">
                {activeStudy ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="text-[1.5vh] font-medium text-[#505143]">
                      Этап {activeStudy.phase + 1}: <span className="font-light">{PHASE_TEXTS[activeStudy.phase]?.[0] || 'Изучение'}</span>
                    </div>
                    {/* Schedule Timer */}
                    {(() => {
                      const stat = getLessonStatusText(activeStudy.startDate, activeStudy.expiryDate);
                      return (
                        <div className={`text-[1.4vh] rounded-lg px-2.5 py-1 inline-flex w-fit items-center ${stat.bg} ${stat.color}`}>
                          {stat.text}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-[1.4vh] text-[#a3a289] italic">
                    Не добавлен в план изучения
                  </div>
                )}

                <button
                  onClick={() => onToggleStudy(index, title)}
                  className={`px-3 py-1.5 rounded-xl text-[1.4vh] font-medium transition-all duration-200 active:scale-95 ${
                    activeStudy 
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100/80 border border-rose-200/50' 
                      : 'bg-[#505143] text-[#d5ccab] hover:opacity-90 shadow-sm'
                  }`}
                >
                  {activeStudy ? 'Удалить' : 'Изучать (кривая забывания)'}
                </button>
              </div>
            </motion.div>
          );
        })}
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
