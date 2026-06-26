import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FundData, Verse } from '../types.ts';

interface StudyProps {
  data: FundData;
  lessonIndex: number;
  verseIndex: number;
  onNext: (id: string) => void;
  onPrev: () => void;
  onFinish: (id: string) => void;
  onBack: () => void;
  onSelectVerse: (index: number) => void;
  mode: 'LESSONS' | 'CARDS' | 'SEARCH';
  key?: React.Key;
}

export function Study({ 
  data, 
  lessonIndex, 
  verseIndex, 
  onNext, 
  onPrev, 
  onFinish, 
  onBack,
  onSelectVerse,
  mode
}: StudyProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedTip, setCopiedTip] = useState(false);
  const versesRaw = data[0];
  const titles = data[1];
  const lessons = data[2];
  
  // Учитываем, что versesData может быть Verse[][] или Verse[]
  const versesData = Array.isArray(versesRaw[0]) 
    ? (versesRaw as Verse[][]).flat() 
    : (versesRaw as Verse[]);

  const getLessonTitle = (lesson: any) => {
    const lessonsWithinChapter = lessons.filter(l => l.chapter === lesson.chapter);
    const indexWithinChapter = lessonsWithinChapter.findIndex(l => l.texts[0] === lesson.texts[0]);
    let text = titles[lesson.chapter] || '';
    if (indexWithinChapter > 0) {
      if (lessonsWithinChapter.length - 1 === indexWithinChapter) {
        text += ' (ОКОНЧАНИЕ)';
      } else if (lessonsWithinChapter.length === 3) {
        text += ' (ПРОДОЛЖЕНИЕ)';
      } else if (lessonsWithinChapter.length > 3) {
        text += ` (ПРОДОЛЖЕНИЕ ${indexWithinChapter}-Е)`;
      }
    }
    return text;
  };

  // Собираем все ID стихов
  const allVerseIds = useMemo(() => {
    if (mode === 'CARDS') {
      // Все тексты из всех уроков
      return lessons.flatMap(l => l.texts);
    }
    // Только тексты выбранного урока
    const selectedLesson = lessons[lessonIndex];
    return selectedLesson ? selectedLesson.texts : [];
  }, [lessons, lessonIndex, mode]);
    
  const totalVersesInSession = allVerseIds.length;
  
  if (totalVersesInSession === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="text-[3vh] text-[#878568]">В этом уроке пока нет стихов</div>
        <button onClick={onBack} className="mt-4 text-[2.5vh] text-[#878568] underline font-medium">Вернуться</button>
      </div>
    );
  }

  const verseId = allVerseIds[verseIndex];
  const currentVerse = versesData.find(v => String(v.id) === String(verseId)) || versesData[0];

  const handleShare = () => {
    const text = `"${currentVerse.text}"\n${currentVerse.book}.${currentVerse.chapter}:${currentVerse.verse}`;
    if (navigator.share) {
      navigator.share({ text }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      setCopiedTip(true);
      setTimeout(() => setCopiedTip(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full flex-col p-6 overflow-hidden"
    >
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="text-[2.5vh] text-[#878568] hover:opacity-70 font-medium">Назад</button>
        <div className="flex items-center gap-3">
          <div className="text-[2vh] font-light text-[#a3a289] bg-[#d5ccab]/30 px-3 py-1 rounded-full">
            {verseIndex + 1} / {totalVersesInSession}
          </div>
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-1 hover:opacity-70 transition-transform active:scale-90"
          >
            <svg className="h-[4vh] w-[4vh] fill-[#878568]" viewBox="0 0 448 512">
              <path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="text-center text-[3.5vh] font-bold text-[#878568] mb-6 leading-tight">
        {mode === 'CARDS' ? 'Все карточки' : (lessons[lessonIndex] ? getLessonTitle(lessons[lessonIndex]) : '')}
      </div>

      <div className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${lessonIndex}-${verseId}-${mode}`}
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -30, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-full flex-col pt-4 pl-4"
          >
            <div className="relative mb-6 rounded-2xl bg-[#505143] p-6 shadow-lg border border-[#a3a289]/10">
              <div className="text-[3vh] leading-relaxed text-[#d5ccab]">
                "{currentVerse.text}"
              </div>
              <div className="mt-4 text-right text-[2.5vh] font-medium text-[#a3a289]">
                {currentVerse.book}.{currentVerse.chapter}:{currentVerse.verse}
              </div>
              <div className="absolute -top-4 -left-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#a3a289] shadow-xl text-[2.2vh] font-bold text-[#d5ccab] border-2 border-[#d5ccab] z-10">
                {verseIndex + 1}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {currentVerse.reason && currentVerse.reason.map((r, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mb-4 text-[2.6vh] font-light leading-snug text-[#505143]"
                >
                  • {r}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex gap-4 h-[10vh]">
        {verseIndex > 0 ? (
          <button
            onClick={onPrev}
            className="flex-1 rounded-xl bg-[#a3a289] text-[3vh] font-light text-[#d5ccab] active:scale-95 transition-transform font-medium"
          >
            Назад
          </button>
        ) : (
          <div className="flex-1" />
        )}
        {verseIndex < totalVersesInSession - 1 ? (
          <button
            onClick={() => onNext(String(currentVerse.id))}
            className="flex-1 rounded-xl bg-[#505143] text-[3vh] font-light text-[#d5ccab] active:scale-95 transition-transform font-medium"
          >
            Далее
          </button>
        ) : (
          <button
            onClick={() => onFinish(String(currentVerse.id))}
            className="flex-1 rounded-xl bg-[#878568] text-[3vh] font-bold text-[#d5ccab] active:scale-95 transition-transform"
          >
            Завершить
          </button>
        )}
      </div>

      {/* Боковое меню навигации */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 z-50 h-full w-[85vw] bg-[#d5ccab] p-6 shadow-2xl flex flex-col"
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="text-[3vh] font-bold text-[#878568]">Меню</span>
                <button onClick={() => setIsMenuOpen(false)} className="text-[4vh] text-[#878568] leading-none p-2">&times;</button>
              </div>

              {/* Быстрые действия */}
              <div className="mb-6 grid grid-cols-2 gap-3">
                <button 
                  onClick={handleShare}
                  className="flex flex-col items-center justify-center p-4 bg-[#878568] rounded-xl text-[#d5ccab] transition-transform active:scale-95"
                >
                  <svg className="h-[4vh] w-[4vh] fill-[#d5ccab] mb-1" viewBox="0 0 448 512">
                    <path d="M352 224c53 0 96-43 96-96s-43-96-96-96s-96 43-96 96c0 4 .2 8 .7 11.9l-94.1 47c-18.2-16.1-42.1-25.9-68.6-25.9c-53 0-96 43-96 96s43 96 96 96c26.5 0 50.4-9.8 68.6-25.9l94.1 47c-.5 3.9-.7 7.9-.7 11.9c0 53 43 96 96 96s96-43 96-96s-43-96-96-96c-26.5 0-50.4 9.8-68.6 25.9l-94.1-47c.5-3.9 .7-7.9 .7-11.9c0-4-.2-8-.7-11.9l94.1-47c18.2 16.1 42.1 25.9 68.6 25.9z"/>
                  </svg>
                  <span className="text-[1.5vh]">Поделиться</span>
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(currentVerse.text);
                    setCopiedTip(true);
                    setTimeout(() => setCopiedTip(false), 1500);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-[#a3a289] rounded-xl text-[#d5ccab] transition-transform active:scale-95"
                >
                  <svg className="h-[4vh] w-[4vh] fill-[#d5ccab] mb-1" viewBox="0 0 448 512">
                    <path d="M208 0L64 0C28.7 0 0 28.7 0 64L0 352c0 35.3 28.7 64 64 64l144 0 0-48-144 0c-8.8 0-16-7.2-16-16L64 64c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16l0 32 48 0 0-32c0-35.3-28.7-64-64-64zM256 160c-35.3 0-64 28.7-64 64L192 448c0 35.3 28.7 64 64 64l128 0c35.3 0 64-28.7 64-64l0-224c0-35.3-28.7-64-64-64l-128 0zm128 48c8.8 0 16 7.2 16 16l0 224c0 8.8-7.2 16-16 16L256 464c-8.8 0-16-7.2-16-16l0-224c0-8.8 7.2-16 16-16l128 0z"/>
                  </svg>
                  <span className="text-[1.5vh]">Копировать</span>
                </button>
              </div>

              <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                {allVerseIds.map((id, idx) => {
                  const v = versesData.find(item => String(item.id) === String(id));
                  return (
                    <motion.div 
                      key={idx}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        onSelectVerse(idx);
                        setIsMenuOpen(false);
                      }}
                      className={`cursor-pointer rounded-xl p-4 text-[2vh] transition-colors border-l-4 ${idx === verseIndex ? 'bg-[#878568] text-[#d5ccab] border-[#505143]' : 'bg-[#a3a289]/10 text-[#505143] border-transparent hover:bg-[#a3a289]/20'}`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span>Карточка {idx + 1}</span>
                        {idx === verseIndex && <span className="text-[1.4vh] uppercase tracking-wider bg-[#505143] px-2 py-0.5 rounded text-[#d5ccab]">Сейчас</span>}
                      </div>
                      <div className="text-[1.8vh] opacity-80 leading-tight">
                        {v ? `${v.book}.${v.chapter}:${v.verse}` : '...'}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Copy notification Toast */}
      <AnimatePresence>
        {copiedTip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#505143] text-[#d5ccab] font-bold text-[1.8vh] py-2.5 px-6 rounded-full shadow-2xl border border-[#a3a289]/20 z-50 pointer-events-none"
          >
            Текст скопирован!
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
