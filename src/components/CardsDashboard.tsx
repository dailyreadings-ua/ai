import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StudyingLesson, Verse, CardGameSettings, FundData } from '../types.ts';
import { PHASE_TEXTS, getLessonStatusText, getDates } from '../constants.ts';

interface CardsDashboardProps {
  studyingLessons: StudyingLesson[];
  onSaveLessons: (lessons: StudyingLesson[]) => void;
  onBack: () => void;
  completedIds: string[];
  onMarkCompleted: (id: string | string[]) => void;
  key?: React.Key;
}

interface CardItem {
  id: string;
  verse: Verse;
  lessonIndex: number;
  part: number;
  targetSide: 'address_by_text' | 'text_by_address';
}

export function CardsDashboard({ 
  studyingLessons, 
  onSaveLessons, 
  onBack,
  completedIds,
  onMarkCompleted
}: CardsDashboardProps) {
  const [part1Data, setPart1Data] = useState<FundData | null>(null);
  const [part2Data, setPart2Data] = useState<FundData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // States for session
  const [viewState, setViewState] = useState<'setup' | 'settings' | 'game' | 'summary'>('setup');
  const [selectedLessonKeys, setSelectedLessonKeys] = useState<string[]>([]);
  
  // Load settings from localStorage with fallback defaults
  const [gameSettings, setGameSettings] = useState<CardGameSettings>(() => {
    try {
      const stored = localStorage.getItem('dr_card_game_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          what: parsed.what || 'both_address_first',
          retryMode: parsed.retryMode || 'until_learned',
          countMode: parsed.countMode || 'all',
          maxCardsLimit: typeof parsed.maxCardsLimit === 'number' ? parsed.maxCardsLimit : 10
        };
      }
    } catch (e) {
      // ignore
    }
    return {
      what: 'both_address_first',
      retryMode: 'until_learned',
      countMode: 'all',
      maxCardsLimit: 10
    };
  });

  // Save settings when changed
  useEffect(() => {
    localStorage.setItem('dr_card_game_settings', JSON.stringify(gameSettings));
  }, [gameSettings]);

  // Load individual side ratings
  const [cardRatings, setCardRatings] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('dr_card_ratings');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });

  const handleSetRating = (verseId: string, side: 'address_by_text' | 'text_by_address', ratingVal: number) => {
    setCardRatings(prev => {
      const key = `${verseId}_${side}`;
      const newRating = prev[key] === ratingVal ? 0 : ratingVal;
      const next = { ...prev };
      if (newRating === 0) {
        delete next[key];
      } else {
        next[key] = newRating;
      }
      localStorage.setItem('dr_card_ratings', JSON.stringify(next));
      return next;
    });
  };

  // Game active state
  const [cardsDeck, setCardsDeck] = useState<CardItem[]>([]);
  const [initialDeck, setInitialDeck] = useState<CardItem[]>([]);
  const [firstAttemptResults, setFirstAttemptResults] = useState<Record<string, 'correct' | 'incorrect'>>({});
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [correctCardIds, setCorrectCardIds] = useState<string[]>([]);
  const [incorrectCardIds, setIncorrectCardIds] = useState<string[]>([]);

  // Dialog overlay state for custom alerts and confirms (safe for cross-origin iframe sandboxes)
  const [appDialog, setAppDialog] = useState<{
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);

  // Retry states
  const [retryPassCount, setRetryPassCount] = useState(0);
  const [currentPassFailures, setCurrentPassFailures] = useState<CardItem[]>([]);
  const [currentPassSuccesses, setCurrentPassSuccesses] = useState<CardItem[]>([]);

  // Ticks for countdown timer updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000); // update timers every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch Part 1 and Part 2 JSONs on mount
  useEffect(() => {
    const loadAllFunds = async () => {
      try {
        setIsLoadingData(true);
        const [p1, p2] = await Promise.all([
          fetch('/fund1.json').then(r => r.json()),
          fetch('/fund2.json').then(r => r.json())
        ]);
        setPart1Data(p1);
        setPart2Data(p2);
      } catch (e) {
        console.error('Error fetching cards data:', e);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadAllFunds();
  }, []);

  // Auto-select lessons that are active (due) or expired (overdue) by default
  useEffect(() => {
    if (studyingLessons.length > 0) {
      const defaultSelected: string[] = [];
      studyingLessons.forEach(lesson => {
        const status = getLessonStatusText(lesson.startDate, lesson.expiryDate);
        // Pre-check active or expired reviews
        if (status.status === 'active' || status.status === 'expired') {
          defaultSelected.push(`${lesson.part}-${lesson.lessonIndex}`);
        }
      });
      // If nothing is pending, select all of them
      if (defaultSelected.length === 0) {
        setSelectedLessonKeys(studyingLessons.map(l => `${l.part}-${l.lessonIndex}`));
      } else {
        setSelectedLessonKeys(defaultSelected);
      }
    }
  }, [studyingLessons]);

  // Combine verses for game round
  const flatVersesCache = useMemo(() => {
    const map = new Map<string, Verse[]>();
    
    if (part1Data) {
      const versesRaw = part1Data[0];
      const versesList = Array.isArray(versesRaw[0]) 
        ? (versesRaw as Verse[][]).flat() 
        : (versesRaw as Verse[]);
        
      part1Data[2].forEach(lesson => {
        const lessonVerses = versesList.filter(v => lesson.texts.includes(Number(v.id)));
        const key = `1-${lesson.chapter}`;
        const existing = map.get(key) || [];
        const merged = [...existing];
        lessonVerses.forEach(v => {
          if (!merged.some(mv => String(mv.id) === String(v.id))) {
            merged.push(v);
          }
        });
        map.set(key, merged);
      });
    }

    if (part2Data) {
      const versesRaw = part2Data[0];
      const versesList = Array.isArray(versesRaw[0]) 
        ? (versesRaw as Verse[][]).flat() 
        : (versesRaw as Verse[]);
        
      part2Data[2].forEach(lesson => {
        const lessonVerses = versesList.filter(v => lesson.texts.includes(Number(v.id)));
        const key = `2-${lesson.chapter}`;
        const existing = map.get(key) || [];
        const merged = [...existing];
        lessonVerses.forEach(v => {
          if (!merged.some(mv => String(mv.id) === String(v.id))) {
            merged.push(v);
          }
        });
        map.set(key, merged);
      });
    }

    return map;
  }, [part1Data, part2Data]);

  // Handle study plan check/uncheck
  const handleToggleLessonSelection = (key: string) => {
    setSelectedLessonKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Launch Game setup config
  const handleProceedToSettings = () => {
    if (selectedLessonKeys.length === 0) return;
    setViewState('settings');
  };

  // Selector to build and shuffle deck for a selected side
  const buildSideDeck = (
    verses: Verse[],
    side: 'address_by_text' | 'text_by_address',
    metaList: { chapter: number; part: number }[]
  ): CardItem[] => {
    const candidates: CardItem[] = verses.map(v => {
      const meta = metaList.find(m => {
        const key = `${m.part}-${m.chapter}`;
        const lessonVerses = flatVersesCache.get(key) || [];
        return lessonVerses.some(lv => String(lv.id) === String(v.id));
      }) || { chapter: 0, part: 1 };

      return {
        id: `${v.id}_${side}`,
        verse: v,
        lessonIndex: meta.chapter,
        part: meta.part,
        targetSide: side
      };
    });

    const getRating = (item: CardItem) => {
      const rKey = `${item.verse.id}_${side}`;
      return cardRatings[rKey] || 0;
    };

    // Poorly known subset: 1 or 2 stars (0 is neutral/unrated, 3 is well known)
    const poorlyKnown = candidates.filter(item => {
      const r = getRating(item);
      return r === 1 || r === 2;
    });

    // Neutral (0) or well known (3) subset
    const neutralOrWellKnown = candidates.filter(item => {
      const r = getRating(item);
      return r === 0 || r === 3;
    });

    const countMode = gameSettings.countMode;
    const N = Number(gameSettings.maxCardsLimit) || 10;

    if (countMode === 'bad_only') {
      return [...poorlyKnown].sort(() => Math.random() - 0.5);
    }

    if (countMode === 'limit') {
      if (N >= candidates.length) {
        return [...candidates].sort(() => Math.random() - 0.5);
      } else {
        let selected: CardItem[] = [];
        if (poorlyKnown.length < N) {
          const shuffledOther = [...neutralOrWellKnown].sort(() => Math.random() - 0.5);
          const needs = N - poorlyKnown.length;
          selected = [...poorlyKnown, ...shuffledOther.slice(0, needs)];
        } else if (poorlyKnown.length === N) {
          selected = [...poorlyKnown];
        } else {
          const shuffledPoorly = [...poorlyKnown].sort(() => Math.random() - 0.5);
          selected = shuffledPoorly.slice(0, N);
        }
        return selected.sort(() => Math.random() - 0.5);
      }
    }

    // Default 'all'
    return [...candidates].sort(() => Math.random() - 0.5);
  };

  // Build the deck and start the round
  const handleStartGame = () => {
    const selectedVersesArray: Verse[] = [];
    const metaList: { chapter: number; part: number }[] = [];

    selectedLessonKeys.forEach(key => {
      const [partStr, chStr] = key.split('-');
      const part = Number(partStr);
      const ch = Number(chStr);
      
      const verses = flatVersesCache.get(key) || [];
      verses.forEach(v => {
        if (!selectedVersesArray.some(sv => String(sv.id) === String(v.id))) {
          selectedVersesArray.push(v);
        }
      });

      metaList.push({ chapter: ch, part });
    });

    if (selectedVersesArray.length === 0) {
      setAppDialog({
        title: 'Внимание',
        message: 'В выбранных уроках нет карточек!',
        type: 'alert'
      });
      return;
    }

    const sideWhat = gameSettings.what;
    let finalDeck: CardItem[] = [];

    if (sideWhat === 'only_address_by_text') {
      finalDeck = buildSideDeck(selectedVersesArray, 'address_by_text', metaList);
    } else if (sideWhat === 'only_text_by_address') {
      finalDeck = buildSideDeck(selectedVersesArray, 'text_by_address', metaList);
    } else if (sideWhat === 'both_address_first') {
      const partA = buildSideDeck(selectedVersesArray, 'address_by_text', metaList);
      const partB = buildSideDeck(selectedVersesArray, 'text_by_address', metaList);
      finalDeck = [...partA, ...partB];
    } else if (sideWhat === 'both_text_first') {
      const partA = buildSideDeck(selectedVersesArray, 'text_by_address', metaList);
      const partB = buildSideDeck(selectedVersesArray, 'address_by_text', metaList);
      finalDeck = [...partA, ...partB];
    }

    if (finalDeck.length === 0) {
      setAppDialog({
        title: 'Внимание',
        message: 'Нет подходящих карточек по выбранным параметрам!',
        type: 'alert'
      });
      return;
    }

    setCardsDeck(finalDeck);
    setInitialDeck(finalDeck);
    setFirstAttemptResults({});
    setCurrentCardIndex(0);
    setIsFlipped(false);
    
    // Reset round/pass stats
    setRetryPassCount(0);
    setCurrentPassFailures([]);
    setCurrentPassSuccesses([]);
    
    setCorrectCardIds([]);
    setIncorrectCardIds([]);
    setViewState('game');
  };

  // Click card answer
  const handleCardFeedback = (knows: boolean) => {
    const currentCard = cardsDeck[currentCardIndex];
    if (!currentCard) return;
    const cardId = currentCard.id;
    const id = String(currentCard.verse.id);
    
    // Log failures / successes for current pass
    const updatedFailures = [...currentPassFailures];
    const updatedSuccesses = [...currentPassSuccesses];
    
    if (knows) {
      updatedSuccesses.push(currentCard);
      if (retryPassCount === 0) {
        setFirstAttemptResults(prev => ({ ...prev, [cardId]: 'correct' }));
        setCorrectCardIds(prev => {
          if (!prev.includes(id)) return [...prev, id];
          return prev;
        });
      }
    } else {
      updatedFailures.push(currentCard);
      if (retryPassCount === 0) {
        setFirstAttemptResults(prev => ({ ...prev, [cardId]: 'incorrect' }));
        setIncorrectCardIds(prev => {
          if (!prev.includes(id)) return [...prev, id];
          return prev;
        });
      }
    }

    // Advance to next card or process next round/pass
    if (currentCardIndex < cardsDeck.length - 1) {
      setIsFlipped(false);
      if (knows) {
        setCurrentPassSuccesses(prev => [...prev, currentCard]);
      } else {
        setCurrentPassFailures(prev => [...prev, currentCard]);
      }
      setTimeout(() => {
        setCurrentCardIndex(prev => prev + 1);
      }, 200);
    } else {
      // Reached end of current deck pass
      const totalFailures = updatedFailures.length;
      const retryMode = gameSettings.retryMode;
      
      let shouldRetry = false;
      if (totalFailures > 0) {
        if (retryMode === 'until_learned') {
          shouldRetry = true;
        } else if (retryMode === 'twice' && retryPassCount < 2) {
          shouldRetry = true;
        } else if (retryMode === 'once' && retryPassCount < 1) {
          shouldRetry = true;
        }
      }

      if (shouldRetry) {
        const nextPassNum = retryPassCount + 1;
        const nextDeck = [...updatedFailures].sort(() => Math.random() - 0.5);
        
        setIsFlipped(false);
        setCardsDeck(nextDeck);
        setCurrentCardIndex(0);
        setRetryPassCount(nextPassNum);
        setCurrentPassFailures([]);
        setCurrentPassSuccesses([]);
      } else {
        setViewState('summary');
        
        // Mark all overall successfully known verses as completed in general progress
        // Only if they were marked as correct on the first pass
        const finalResults = {
          ...firstAttemptResults,
          [cardId]: knows ? 'correct' : 'incorrect'
        };

        const justDiscovered = initialDeck
          .map(c => String(c.verse.id))
          .filter(cid => {
            const cardsOfVerse = initialDeck.filter(c => String(c.verse.id) === cid);
            return cardsOfVerse.every(c => (finalResults as any)[c.id] === 'correct');
          });
        
        const uniqueJustDiscovered = Array.from(new Set(justDiscovered)) as string[];
        if (uniqueJustDiscovered.length > 0) {
          onMarkCompleted(uniqueJustDiscovered);
        }
      }
    }
  };

  // Calculations for phase updates when summary page shows up
  const processedStudyUpdates = useMemo(() => {
    if (viewState !== 'summary') return [];

    // For each checked lesson key, check if all their card IDs were correct
    return selectedLessonKeys.map(key => {
      const [partStr, chStr] = key.split('-');
      const part = Number(partStr);
      const ch = Number(chStr);
      const activeLesson = studyingLessons.find(l => l.part === part && l.lessonIndex === ch);
      
      if (!activeLesson) return null;

      const lessonVerses = flatVersesCache.get(key) || [];
      const verseIds = lessonVerses.map(v => String(v.id));
      
      // Find all cards in initialDeck that belong to this lesson
      const lessonCards = initialDeck.filter(c => String(c.part) === String(part) && String(c.lessonIndex) === String(ch));
      const totalLessonCards = lessonCards.length;
      
      // Check if ALL these lessonCards were answered 'correct' on the first attempt
      const correctLessonCards = lessonCards.filter(c => firstAttemptResults[c.id] === 'correct').length;
      
      const passedAll = totalLessonCards > 0 && correctLessonCards === totalLessonCards;
      const oldPhase = activeLesson.phase;
      
      let nextPhase = oldPhase;
      let statusMsg = '';
      let success = false;
      let newStartStr = activeLesson.startDate;
      let newExpiryStr = activeLesson.expiryDate;

      if (passedAll) {
        success = true;
        nextPhase = Math.min(oldPhase + 1, 14); // 15 phases (0 to 14)
        const [start, expr] = getDates(nextPhase);
        newStartStr = start;
        newExpiryStr = expr;
        statusMsg = `Этап успешно пройден! Перенос на Этап ${nextPhase + 1}.`;
      } else {
        success = false;
        statusMsg = `Некоторые карточки были отвечены неверно с первой попытки (${correctLessonCards}/${totalLessonCards} верно). Для перехода на следующий этап нужно вспомнить все карточки урока без единой ошибки с первого раза.`;
      }

      return {
        key,
        part,
        title: activeLesson.title,
        lessonIndex: ch,
        oldPhase,
        nextPhase,
        passedAll,
        statusMsg,
        success,
        newStart: newStartStr,
        newExpiry: newExpiryStr
      };
    }).filter(Boolean) as Array<{
      key: string;
      part: number;
      title: string;
      lessonIndex: number;
      oldPhase: number;
      nextPhase: number;
      passedAll: boolean;
      statusMsg: string;
      success: boolean;
      newStart: string;
      newExpiry: string;
    }>;
  }, [viewState, selectedLessonKeys, studyingLessons, flatVersesCache, firstAttemptResults, initialDeck]);

  // Save the advanced stages to local storage
  const handleSaveProgress = () => {
    const updatedLessons = studyingLessons.map(lesson => {
      const match = processedStudyUpdates.find(u => u.part === lesson.part && u.lessonIndex === lesson.lessonIndex);
      if (match && match.success) {
        return {
          ...lesson,
          phase: match.nextPhase,
          startDate: match.newStart,
          expiryDate: match.newExpiry
        };
      }
      return lesson;
    });

    onSaveLessons(updatedLessons);
    setViewState('setup');
  };

  if (isLoadingData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#d5ccab] p-6 text-center">
        <div className="h-[8vh] w-[8vh] animate-spin rounded-full border-4 border-[#878568] border-t-transparent" />
        <div className="mt-4 text-[2.5vh] text-[#878568]">Загрузка базы карточек...</div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col bg-[#d5ccab] overflow-hidden relative"
    >
      {/* HEADER */}
      <div className="flex h-[10vh] min-h-[10vh] items-center justify-between border-b border-[#a3a289]/10 px-6">
        <button 
          onClick={() => {
            if (viewState === 'game') {
              setAppDialog({
                title: 'Выйти из раунда?',
                message: 'Вы действительно хотите прервать текущий раунд? Прогресс раунда не будет зафиксирован.',
                type: 'confirm',
                onConfirm: () => {
                  setViewState('setup');
                }
              });
            } else if (viewState === 'summary') {
              // Just return to list
              setViewState('setup');
            } else if (viewState === 'settings') {
              setViewState('setup');
            } else {
              onBack();
            }
          }}
          className="text-[2.2vh] font-medium text-[#505143] hover:opacity-75"
        >
          {viewState === 'game' ? 'Выйти' : 'Назад'}
        </button>
        <div className="text-[3vh] font-bold text-[#878568]">
          {viewState === 'game' ? 'Мемори-Раунд' : 'Повторение'}
        </div>
        <div className="w-[10vw]" /> {/* spacer */}
      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: SETUP CARD CHECKBOXES */}
        {viewState === 'setup' && (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {studyingLessons.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#505143] gap-4">
                <svg className="h-[12vh] w-[12vh] fill-[#878568]/40" viewBox="0 0 576 512">
                  <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2z"/>
                </svg>
                <h3 className="text-[3vh] font-bold text-[#878568]">Нет изучаемых уроков</h3>
                <p className="text-[2.1vh] leading-relaxed max-w-sm font-light text-[#878568]/95">
                  Вы пока не добавили ни одного урока в изучаемые. Перейдите в раздел <strong>"Уроки"</strong>, найдите нужную тему и нажмите кнопку <strong>"Изучать"</strong>.
                </p>
                <button 
                  onClick={onBack}
                  className="mt-4 rounded-xl bg-[#505143] px-6 py-2.5 text-[2.2vh] font-medium text-[#d5ccab] shadow active:scale-95 transition-transform"
                >
                  Перейти в Уроки
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 bg-[#878568]/15 border-b border-[#a3a289]/10 text-[2vh] text-[#505143] leading-snug">
                  Выберите уроки для повторения во флеш-картах. Мы автоматически выделили разделы, подошедшие к сроку повторения по кривой забывания.
                </div>

                {/* Lesson checklist */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                  {studyingLessons.map(lesson => {
                    const key = `${lesson.part}-${lesson.lessonIndex}`;
                    const isChecked = selectedLessonKeys.includes(key);
                    const statusVal = getLessonStatusText(lesson.startDate, lesson.expiryDate);

                    return (
                      <div 
                        key={key}
                        onClick={() => handleToggleLessonSelection(key)}
                        className={`flex items-center gap-4 rounded-2xl p-4 border transition-all cursor-pointer ${
                          isChecked 
                            ? 'bg-white border-[#878568] shadow-md' 
                            : 'bg-white/45 border-[#a3a289]/20 hover:bg-white/60'
                        }`}
                      >
                        {/* Beautiful custom checkbox */}
                        <div className={`h-[4vh] w-[4vh] min-w-[4vh] rounded-lg border-2 flex items-center justify-center transition-colors ${
                          isChecked 
                            ? 'bg-[#505143] border-[#505143]' 
                            : 'border-[#a3a289] bg-transparent'
                        }`}>
                          {isChecked && (
                            <svg className="h-[2vh] w-[2vh] fill-white" viewBox="0 0 448 512">
                              <path d="M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 338.7 54.6 233.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
                            </svg>
                          )}
                        </div>

                        {/* Text and status */}
                        <div className="flex-1 flex flex-col">
                          <div className="text-[2.1vh] font-medium leading-tight text-[#505143] break-words">
                            {lesson.title}
                          </div>
                          <div className="text-[1.5vh] text-[#a3a289] mt-0.5 font-light">
                            Часть {lesson.part} • Этап {lesson.phase + 1}: {PHASE_TEXTS[lesson.phase]?.[0]}
                          </div>
                          {/* Live Countdown status */}
                          <div className={`mt-2 text-[1.4vh] rounded-lg px-2.5 py-1 inline-flex w-fit items-center ${statusVal.bg} ${statusVal.color}`}>
                            {statusVal.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Confirm button */}
                <div className="p-4 bg-white/70 border-t border-[#a3a289]/20">
                  <button
                    disabled={selectedLessonKeys.length === 0}
                    onClick={handleProceedToSettings}
                    className={`w-full py-4 rounded-2xl text-[2.5vh] font-bold text-[#d5ccab] transition-all shadow ${
                      selectedLessonKeys.length > 0 
                        ? 'bg-[#505143] active:scale-98 hover:opacity-95' 
                        : 'bg-[#a3a289]/50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    Запустить карточки ({selectedLessonKeys.length})
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* VIEW 2: GAME SETTINGS PARAMETERS */}
        {viewState === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 p-6 flex flex-col justify-between min-h-0"
          >
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-6 custom-scrollbar pb-4">
              <h2 className="text-[3.2vh] font-bold text-[#505143] mb-2 leading-snug">Параметры карточек</h2>
              
              {/* Option 1: Что повторяем */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[2.2vh] font-bold text-[#878568]">1. Что повторяем?</span>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'both_address_first', label: 'Сначала адрес по тексту, потом текст по адресу' },
                    { id: 'only_address_by_text', label: 'Только адрес по тексту' },
                    { id: 'both_text_first', label: 'Сначала текст по адресу, потом адрес по тексту' },
                    { id: 'only_text_by_address', label: 'Только текст по адресу' }
                  ].map(opt => {
                    const isSelected = gameSettings.what === opt.id;
                    return (
                      <div 
                        key={opt.id}
                        onClick={() => setGameSettings(prev => ({ ...prev, what: opt.id as any }))}
                        className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-white border-[#505143] shadow-md font-semibold text-[#505143]' 
                            : 'bg-white/45 border-[#a3a289]/15 text-[#505143]/85 hover:bg-white/60'
                        }`}
                      >
                        <div className={`h-[2.5vh] w-[2.5vh] rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-[#505143]' : 'border-[#a3a289]'
                        }`}>
                          {isSelected && <div className="h-[1.2vh] w-[1.2vh] rounded-full bg-[#505143]" />}
                        </div>
                        <span className="text-[1.8vh] leading-tight">{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Option 2: Повтор невыученных */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[2.2vh] font-bold text-[#878568]">2. Повтор не выученных:</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'until_learned', label: 'Пока не выучу' },
                    { id: 'twice', label: 'Два раза' },
                    { id: 'once', label: 'Один раз' },
                    { id: 'none', label: 'Не повторяем' }
                  ].map(opt => {
                    const isSelected = gameSettings.retryMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setGameSettings(prev => ({ ...prev, retryMode: opt.id as any }))}
                        className={`p-3 rounded-xl border text-[1.8vh] transition-all leading-snug font-medium text-center ${
                          isSelected 
                            ? 'bg-[#505143] border-[#505143] text-[#d5ccab] shadow' 
                            : 'bg-white/45 border-[#a3a289]/15 text-[#505143]/85 hover:bg-[#505143]/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Option 3: Сколько карточек повторять */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[2.2vh] font-bold text-[#878568]">3. Сколько карточек повторять?</span>
                <div className="flex flex-col gap-2">
                  {/* Option 3a: Все */}
                  <div 
                    onClick={() => setGameSettings(prev => ({ ...prev, countMode: 'all' }))}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      gameSettings.countMode === 'all'
                        ? 'bg-white border-[#505143] shadow-md font-semibold text-[#505143]' 
                        : 'bg-white/45 border-[#a3a289]/15 text-[#505143]/85'
                    }`}
                  >
                    <div className={`h-[2.5vh] w-[2.5vh] rounded-full border-2 flex items-center justify-center ${
                      gameSettings.countMode === 'all' ? 'border-[#505143]' : 'border-[#a3a289]'
                    }`}>
                      {gameSettings.countMode === 'all' && <div className="h-[1.2vh] w-[1.2vh] rounded-full bg-[#505143]" />}
                    </div>
                    <span className="text-[1.8vh]">Все</span>
                  </div>

                  {/* Option 3b: Лимит */}
                  <div 
                    onClick={() => setGameSettings(prev => ({ ...prev, countMode: 'limit' }))}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      gameSettings.countMode === 'limit'
                        ? 'bg-white border-[#505143] shadow-md font-semibold text-[#505143]' 
                        : 'bg-white/45 border-[#a3a289]/15 text-[#505143]/85'
                    }`}
                  >
                    <div className={`h-[2.5vh] w-[2.5vh] rounded-full border-2 flex items-center justify-center ${
                      gameSettings.countMode === 'limit' ? 'border-[#505143]' : 'border-[#a3a289]'
                    }`}>
                      {gameSettings.countMode === 'limit' && <div className="h-[1.2vh] w-[1.2vh] rounded-full bg-[#505143]" />}
                    </div>
                    <div className="flex items-center gap-2 text-[1.8vh]" onClick={(e) => e.stopPropagation()}>
                      <span>Не более</span>
                      <input 
                        type="number"
                        min={1}
                        max={100}
                        value={gameSettings.maxCardsLimit}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setGameSettings(prev => ({ ...prev, maxCardsLimit: val, countMode: 'limit' }));
                        }}
                        className="w-16 h-8 text-center bg-white border border-[#a3a289]/40 rounded-lg text-[#505143] font-bold text-[1.8vh] focus:outline-none focus:border-[#505143]" 
                      />
                      <span>карточек</span>
                    </div>
                  </div>

                  {/* Option 3c: Плохо знаю */}
                  <div 
                    onClick={() => setGameSettings(prev => ({ ...prev, countMode: 'bad_only' }))}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      gameSettings.countMode === 'bad_only'
                        ? 'bg-white border-[#505143] shadow-md font-semibold text-[#505143]' 
                        : 'bg-white/45 border-[#a3a289]/15 text-[#505143]/85'
                    }`}
                  >
                    <div className={`h-[2.5vh] w-[2.5vh] rounded-full border-2 flex items-center justify-center ${
                      gameSettings.countMode === 'bad_only' ? 'border-[#505143]' : 'border-[#a3a289]'
                    }`}>
                      {gameSettings.countMode === 'bad_only' && <div className="h-[1.2vh] w-[1.2vh] rounded-full bg-[#505143]" />}
                    </div>
                    <span className="text-[1.8vh]">Которые плохо знаю (1-2 звезды)</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-4 rounded-2xl text-[2.5vh] font-bold text-[#d5ccab] bg-[#505143] active:scale-98 transition-transform shadow hover:opacity-95 mt-4 flex-shrink-0"
            >
              Начать раунд
            </button>
          </motion.div>
        )}

        {/* VIEW 3: ACTIVE 3D FLIP GAME INTERACTION */}
        {viewState === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 p-6 flex flex-col justify-between"
          >
            {/* Header progress info */}
            <div>
              <div className="flex items-center justify-between text-[1.8vh] text-[#878568] mb-1 font-medium">
                <div className="flex flex-col gap-0.5">
                  <span>Карточка {currentCardIndex + 1} из {cardsDeck.length}</span>
                  {retryPassCount > 0 && (
                    <span className="text-[1.4vh] text-amber-900 font-bold bg-amber-50 border border-amber-200/40 px-2 py-0.5 rounded w-fit mt-1">
                      Повтор: круг {retryPassCount}
                    </span>
                  )}
                </div>
                <span className="text-[#505143] text-right font-light italic">
                  Часть {cardsDeck[currentCardIndex]?.part} (урок {cardsDeck[currentCardIndex]?.lessonIndex + 1})
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#a3a289]/20 overflow-hidden mb-6">
                <div 
                  className="h-full bg-[#878568] transition-all duration-300" 
                  style={{ width: `${((currentCardIndex + 1) / cardsDeck.length) * 100}%` }}
                />
              </div>
            </div>

            {/* 3D Flipping Card Container */}
            <div className="flex-1 flex items-center justify-center mb-8">
              <div className="w-full max-w-md h-[45vh] perspective-1000 relative">
                <div 
                  className={`w-full h-full duration-500 preserve-3d relative transition-transform ${
                    isFlipped ? 'rotate-y-180' : ''
                  }`}
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  
                  {/* FRONT SIDE */}
                  <div className="absolute inset-0 backface-hidden rounded-3xl bg-[#505143] p-6 flex flex-col justify-between shadow-2xl border border-[#a3a289]/10 select-none cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div className="bg-[#a3a289] h-[5.5vh] w-[5.5vh] rounded-full flex items-center justify-center text-[2.5vh] text-[#d5ccab] font-bold">
                        {currentCardIndex + 1}
                      </div>
                      <div className="text-[1.5vh] text-[#a3a289] uppercase tracking-wider font-semibold">
                        {cardsDeck[currentCardIndex]?.targetSide === 'address_by_text' ? 'Адрес по тексту' : 'Текст по адресу'}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                      {(() => {
                        const targetSide = cardsDeck[currentCardIndex]?.targetSide;
                        const v = cardsDeck[currentCardIndex]?.verse;
                        if (!v) return null;

                        if (targetSide === 'address_by_text') {
                          return (
                            <p className="text-[2.6vh] leading-relaxed text-[#d5ccab] text-center font-serif italic">
                              "{v.text}"
                            </p>
                          );
                        } else {
                          return (
                            <div className="text-center">
                              <h3 className="text-[4vh] font-bold text-[#d5ccab] tracking-wide mb-2 leading-tight">
                                {v.book}
                              </h3>
                              <p className="text-[3.2vh] font-light text-[#a3a289]">
                                Глава {v.chapter}, Стих {v.verse}
                              </p>
                            </div>
                          );
                        }
                      })()}
                    </div>

                    {/* Звездочки оценки знания */}
                    {(() => {
                      const v = cardsDeck[currentCardIndex]?.verse;
                      const targetSide = cardsDeck[currentCardIndex]?.targetSide;
                      if (!v || !targetSide) return null;
                      const currentRating = cardRatings[`${v.id}_${targetSide}`] || 0;

                      return (
                        <div 
                          className="flex flex-col items-center gap-1.5 select-none self-center bg-[#505143] py-1 px-3 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <div className="flex gap-2">
                            {[1, 2, 3].map((starVal) => {
                              const isStarred = currentRating >= starVal;
                              return (
                                <button
                                  key={starVal}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetRating(String(v.id), targetSide, starVal);
                                  }}
                                  className="p-0.5 transition-transform active:scale-95 hover:scale-110"
                                >
                                  {isStarred ? (
                                    <svg className="h-[3.2vh] w-[3.2vh] fill-amber-300 stroke-amber-400 drop-shadow" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.48 3.499c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                  ) : (
                                    <svg className="h-[3.2vh] w-[3.2vh] fill-transparent stroke-[#d5ccab]/40" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.48 3.499c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="text-center text-[1.6vh] tracking-widest uppercase text-[#a3a289] font-medium pt-2">
                      Нажмите, чтобы перевернуть
                    </div>
                  </div>

                  {/* BACK SIDE */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-[#878568] p-6 flex flex-col justify-between shadow-2xl border border-white/10 select-none cursor-pointer">
                    <div className="flex justify-between items-center bg-[#505143]/40 rounded-2xl p-2.5">
                      <div className="text-[1.5vh] font-bold text-[#d5ccab] uppercase tracking-wider">Ответ</div>
                      <div className="text-[1.8vh] text-[#d5ccab] font-light italic">
                        {cardsDeck[currentCardIndex]?.verse.book} {cardsDeck[currentCardIndex]?.verse.chapter}:{cardsDeck[currentCardIndex]?.verse.verse}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-3 overflow-y-auto py-4 custom-scrollbar">
                      {cardsDeck[currentCardIndex]?.targetSide === 'address_by_text' ? (
                        <div className="text-center w-full">
                          <h3 className="text-[3.2vh] font-bold text-[#d5ccab] tracking-wide mb-1 leading-tight">
                            {cardsDeck[currentCardIndex]?.verse.book}
                          </h3>
                          <p className="text-[2.6vh] font-light text-[#d5ccab]/80 mb-4">
                            Глава {cardsDeck[currentCardIndex]?.verse.chapter}, Стих {cardsDeck[currentCardIndex]?.verse.verse}
                          </p>
                          <p className="text-[2.2vh] leading-relaxed text-[#d5ccab] text-center font-serif italic border-t border-[#d5ccab]/15 pt-3">
                            "{cardsDeck[currentCardIndex]?.verse.text}"
                          </p>
                        </div>
                      ) : (
                        <div className="w-full">
                          <p className="text-[2.2vh] leading-relaxed text-[#d5ccab] text-center font-serif italic border-[#d5ccab]/15 pb-3 mb-2">
                            "{cardsDeck[currentCardIndex]?.verse.text}"
                          </p>
                          <p className="text-[1.8vh] text-[#d5ccab]/80 text-center font-light mt-1">
                            {cardsDeck[currentCardIndex]?.verse.book} {cardsDeck[currentCardIndex]?.verse.chapter}:{cardsDeck[currentCardIndex]?.verse.verse}
                          </p>
                        </div>
                      )}
                      
                      <div className="w-full mt-2 pt-2 border-t border-white/10">
                        <h4 className="text-[1.5vh] uppercase tracking-[0.1em] text-[#d5ccab]/70 font-semibold mb-1">Смысл:</h4>
                        {cardsDeck[currentCardIndex]?.verse.reason && cardsDeck[currentCardIndex]?.verse.reason.map((r, ri) => (
                          <p key={ri} className="text-[1.7vh] text-[#d5ccab] leading-tight font-light mb-1">
                            • {r}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Звездочки оценки знания */}
                    {(() => {
                      const v = cardsDeck[currentCardIndex]?.verse;
                      const targetSide = cardsDeck[currentCardIndex]?.targetSide;
                      if (!v || !targetSide) return null;
                      const currentRating = cardRatings[`${v.id}_${targetSide}`] || 0;

                      return (
                        <div 
                          className="flex flex-col items-center gap-1.5 select-none self-center bg-[#878568] py-1 px-3 rounded-full border border-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <div className="flex gap-2">
                            {[1, 2, 3].map((starVal) => {
                              const isStarred = currentRating >= starVal;
                              return (
                                <button
                                  key={starVal}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetRating(String(v.id), targetSide, starVal);
                                  }}
                                  className="p-0.5 transition-transform active:scale-95 hover:scale-110"
                                >
                                  {isStarred ? (
                                    <svg className="h-[3.2vh] w-[3.2vh] fill-amber-300 stroke-amber-400 drop-shadow" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.48 3.499c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                  ) : (
                                    <svg className="h-[3.2vh] w-[3.2vh] fill-transparent stroke-[#d5ccab]/40" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.48 3.499c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="text-center text-[1.6vh] tracking-widest uppercase text-[#d5ccab]/50 font-medium pt-2">
                      Нажмите, чтобы повернуть обратно
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Answer Control triggers */}
            <div className="h-[12vh]">
              <AnimatePresence mode="wait">
                {!isFlipped ? (
                  <motion.div 
                    key="hint"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="h-full flex items-center justify-center"
                  >
                    <p className="text-[2.2vh] font-light text-[#505143] text-center">
                      Переверните карточку для ответа
                    </p>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="feedback"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="h-full flex gap-4 items-center"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardFeedback(false);
                      }}
                      className="flex-1 h-[10vh] rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <svg className="h-[3vh] w-[3vh] fill-rose-700" viewBox="0 0 384 512">
                        <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                      </svg>
                      <span className="text-[2.2vh] font-bold">Не помню</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardFeedback(true);
                      }}
                      className="flex-1 h-[10vh] rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <svg className="h-[3vh] w-[3vh] fill-emerald-800" viewBox="0 0 448 512">
                        <path d="M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 338.7 54.6 233.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
                      </svg>
                      <span className="text-[2.2vh] font-bold">Помню!</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* VIEW 4: SUMMARY & INTERVAL RESULTS ADVANCEMENTS */}
        {viewState === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 p-6 flex flex-col justify-between overflow-hidden"
          >
            <div className="flex-1 flex flex-col min-h-0">
              {/* Celeb Stats header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center h-[12vh] w-[12vh] rounded-full bg-emerald-100 border border-emerald-200 mb-3 text-[5vh]">
                  🏆
                </div>
                <h2 className="text-[3.2vh] font-bold text-[#505143] leading-tight">Карточки изучены!</h2>
                <p className="text-[2.1vh] text-[#878568] mt-1 font-light max-w-sm mx-auto">
                  С первой попытки верно: <strong className="font-semibold text-emerald-800">{initialDeck.length - Object.values(firstAttemptResults).filter(val => val === 'incorrect').length}</strong> из <strong className="font-semibold">{initialDeck.length}</strong> ({initialDeck.length > 0 ? Math.round(((initialDeck.length - Object.values(firstAttemptResults).filter(val => val === 'incorrect').length) / initialDeck.length) * 100) : 0}%).
                </p>
                {Object.values(firstAttemptResults).filter(val => val === 'incorrect').length > 0 && (
                  <p className="text-[1.6vh] text-[#878568] mt-1 italic font-light">
                    Ошибочные карточки были дополнительно отработаны вами до правильного ответа!
                  </p>
                )}
              </div>

              {/* Progress on each tracked lesson */}
              <div className="flex-1 flex flex-col min-h-0 bg-white/30 rounded-2xl border border-[#a3a289]/15 p-4">
                <h4 className="text-[2vh] font-bold text-[#505143] mb-3 uppercase tracking-wide">Итоги этапов памяти:</h4>
                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 custom-scrollbar">
                  {processedStudyUpdates.map(upd => (
                    <div 
                      key={upd.key}
                      className={`p-4 rounded-xl border flex flex-col ${
                        upd.success 
                          ? 'bg-emerald-50/50 border-emerald-200/50' 
                          : 'bg-amber-50/50 border-amber-200/50'
                      }`}
                    >
                      <div className="text-[1.9vh] font-bold text-[#505143] mb-1">
                        {upd.title} (Часть {upd.part})
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[1.6vh] bg-[#a3a289]/20 text-[#505143] font-medium px-2 py-0.5 rounded">
                          Этап {upd.oldPhase + 1}
                        </span>
                        {upd.success && (
                          <>
                            <span className="text-[1.6vh] text-[#878568]">➡️</span>
                            <span className="text-[1.6vh] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                              Этап {upd.nextPhase + 1}
                            </span>
                          </>
                        )}
                      </div>

                      <p className={`text-[1.6vh] mt-2 leading-snug font-light ${upd.success ? 'text-emerald-800 font-medium' : 'text-amber-800'}`}>
                        {upd.success ? '🎉 ' : '⚠️ '}{upd.statusMsg}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setViewState('setup')}
                  className="flex-1 py-4 rounded-2xl text-[2.2vh] font-semibold text-[#505143] bg-[#a3a289]/20 active:scale-98 transition-transform border border-[#a3a289]/20"
                >
                  Повторить раунд
                </button>
                <button
                  onClick={handleSaveProgress}
                  className="flex-1 py-4 rounded-2xl text-[2.2vh] font-bold text-[#d5ccab] bg-[#505143] active:scale-98 transition-transform shadow"
                >
                  Сохранить прогресс
                </button>
              </div>
              <div className="flex flex-col gap-1.5 px-1 mt-2 text-[1.5vh] text-[#878568] leading-tight font-light">
                <p><strong>• Сохранить прогресс:</strong> зафиксирует ваши результаты и продвинет успешно повторённые уроки (где не было ошибок с первой попытки) на следующий этап интервального повторения.</p>
                <p><strong>• Повторить раунд:</strong> перезапустит тренировку для дополнительного закрепления материала (ваши интервалы повторения при этом не изменятся).</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Custom Dialog (Alert/Confirm) */}
      <AnimatePresence>
        {appDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#f2ebcf] border border-[#a3a289]/30 rounded-3xl p-6 shadow-2xl max-w-sm w-full flex flex-col items-center text-center"
            >
              <div className="h-14 w-14 rounded-full bg-[#878568]/15 flex items-center justify-center text-[3.5vh] mb-4 text-[#505143]">
                {appDialog.type === 'confirm' ? '❓' : 'ℹ️'}
              </div>
              <h3 className="text-[2.6vh] font-extrabold text-[#505143] mb-2 leading-tight">
                {appDialog.title}
              </h3>
              <p className="text-[1.8vh] text-[#878568] leading-relaxed mb-6 font-light">
                {appDialog.message}
              </p>

              <div className="flex w-full gap-3">
                {appDialog.type === 'confirm' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAppDialog(null)}
                      className="flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-semibold text-[#505143] bg-white border border-[#a3a289]/30 hover:bg-white/60 active:scale-97 transition-all"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (appDialog.onConfirm) appDialog.onConfirm();
                        setAppDialog(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-bold text-[#d5ccab] bg-[#505143] hover:opacity-95 active:scale-97 transition-all shadow"
                    >
                      Да, выйти
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAppDialog(null)}
                    className="w-full py-3 px-4 rounded-xl text-[1.8vh] font-bold text-[#d5ccab] bg-[#505143] hover:opacity-95 active:scale-97 transition-all shadow"
                  >
                    ОК
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
