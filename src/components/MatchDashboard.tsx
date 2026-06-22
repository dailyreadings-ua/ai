import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Trophy, Play, RotateCcw, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Verse, StudyingLesson } from '../types.ts';
import { PHASE_TEXTS, getLessonStatusText } from '../constants.ts';

interface MatchDashboardProps {
  studyingLessons: StudyingLesson[];
  onBack: () => void;
  key?: React.Key;
}

interface RefNode extends Verse {
  similar: string[];
}

interface PlaySlot {
  id: string;
  type: 'text' | 'link';
  text: string;
  opacity: number;
  isGold: boolean;
  isCoral: boolean;
  isSelected: boolean;
}

// Russian points declension helper
function pointsText(val: number): string {
  const absVal = Math.abs(val);
  const mod10 = absVal % 10;
  const mod100 = absVal % 100;

  if (mod100 >= 11 && mod100 <= 19) {
    return 'очков';
  }
  if (mod10 === 1) {
    return 'очко';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'очка';
  }
  return 'очков';
}

// Array shuffle helper
function shuffleArray<T>(arr: T[]): T[] {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

// Helper to get any element
function getAnyEl<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// Helper to remove element from array by id
function removeNode<T extends { id: string }>(el: T, arr: T[]) {
  const idx = arr.findIndex(item => item.id === el.id);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
}

export function MatchDashboard({ studyingLessons, onBack }: MatchDashboardProps) {
  const [part1Data, setPart1Data] = useState<any | null>(null);
  const [part2Data, setPart2Data] = useState<any | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // States for views: setup (matching selection) | game (actual speedrun) | summary (results)
  const [viewState, setViewState] = useState<'setup' | 'game' | 'summary'>('setup');
  const [selectedLessonKeys, setSelectedLessonKeys] = useState<string[]>([]);
  
  // Game metrics
  const [timerCount, setTimerCount] = useState(120);
  const [points, setPoints] = useState(0);
  const [appDialog, setAppDialog] = useState<{
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);

  // Active game cards / slots
  const [slots, setSlots] = useState<PlaySlot[]>([]);

  // The synchronous game engine ref (matches exact JS structure logic)
  const engineRef = useRef<{
    readyToUse: RefNode[];
    recentlyUsed: RefNode[];
    archive: RefNode[];
    preViewLinks: RefNode[];
    preViewTexts: RefNode[];
    currentViewLinks: RefNode[]; // 3 items
    currentViewTexts: RefNode[]; // 3 items
  }>({
    readyToUse: [],
    recentlyUsed: [],
    archive: [],
    preViewLinks: [],
    preViewTexts: [],
    currentViewLinks: [],
    currentViewTexts: []
  });

  // Fetch verse database
  useEffect(() => {
    const loadAllFunds = async () => {
      try {
        setIsLoadingData(true);
        const [p1, p2] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}fund1.json`).then(r => r.json()),
          fetch(`${import.meta.env.BASE_URL}fund2.json`).then(r => r.json())
        ]);
        setPart1Data(p1);
        setPart2Data(p2);
      } catch (e) {
        console.error('Error fetching match data:', e);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadAllFunds();
  }, []);

  // Pre-select lessons due for repeat
  useEffect(() => {
    if (studyingLessons.length > 0) {
      const defaultSelected: string[] = [];
      studyingLessons.forEach(lesson => {
        const status = getLessonStatusText(lesson.startDate, lesson.expiryDate);
        if (status.status === 'active' || status.status === 'expired') {
          defaultSelected.push(`${lesson.part}-${lesson.lessonIndex}`);
        }
      });
      if (defaultSelected.length === 0) {
        setSelectedLessonKeys(studyingLessons.map(l => `${l.part}-${l.lessonIndex}`));
      } else {
        setSelectedLessonKeys(defaultSelected);
      }
    }
  }, [studyingLessons]);

  // Combine verses of selected list
  const flatVersesCache = useMemo(() => {
    const map = new Map<string, Verse[]>();
    
    if (part1Data) {
      const versesRaw = part1Data[0];
      const versesList = Array.isArray(versesRaw[0]) 
        ? (versesRaw as Verse[][]).flat() 
        : (versesRaw as Verse[]);
        
      part1Data[2].forEach((lesson: any) => {
        const lessonVerses = versesList.filter((v: any) => lesson.texts.includes(Number(v.id)));
        const key = `1-${lesson.chapter}`;
        const existing = map.get(key) || [];
        const merged = [...existing];
        lessonVerses.forEach((v: any) => {
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
        
      part2Data[2].forEach((lesson: any) => {
        const lessonVerses = versesList.filter((v: any) => lesson.texts.includes(Number(v.id)));
        const key = `2-${lesson.chapter}`;
        const existing = map.get(key) || [];
        const merged = [...existing];
        lessonVerses.forEach((v: any) => {
          if (!merged.some(mv => String(mv.id) === String(v.id))) {
            merged.push(v);
          }
        });
        map.set(key, merged);
      });
    }

    return map;
  }, [part1Data, part2Data]);

  // Handle countdown Timer
  useEffect(() => {
    let timerId: any = null;
    if (viewState === 'game' && timerCount > 0) {
      timerId = setInterval(() => {
        setTimerCount(prev => {
          if (prev <= 1) {
            clearInterval(timerId);
            setViewState('summary');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [viewState, timerCount]);

  // Toggle lesson in checkbox checklist
  const handleToggleLessonSelection = (key: string) => {
    setSelectedLessonKeys(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  // Helper to determine similar verses in selected deck
  const getSimilarVerses = (el: Verse, all: Verse[]): string[] => {
    const results: string[] = [];
    all.forEach(item => {
      if (String(item.id) !== String(el.id)) {
        if (item.book === el.book || item.chapter === el.chapter) {
          results.push(String(item.id));
        }
      }
    });
    // Fallback: fill up to 2 random items
    if (results.length === 0) {
      const others = all.filter(item => String(item.id) !== String(el.id));
      const shuffledOthers = shuffleArray(others);
      shuffledOthers.slice(0, 2).forEach(item => results.push(String(item.id)));
    }
    return results;
  };

  // Start Matching round with exact JS logic!
  const handleStartRound = () => {
    // 1. Accumulate all verses from selected lessons
    const mixedSelection: Verse[] = [];
    selectedLessonKeys.forEach(key => {
      const verses = flatVersesCache.get(key) || [];
      verses.forEach(v => {
        if (!mixedSelection.some(mv => String(mv.id) === String(v.id))) {
          mixedSelection.push(v);
        }
      });
    });

    if (mixedSelection.length < 3) {
      setAppDialog({
        title: 'Недостаточно карточек',
        message: 'Для игры "Подбор" нужно выбрать уроки, содержащие суммарно хотя бы 3 стиха. Попробуйте выбрать больше уроков.',
        type: 'alert'
      });
      return;
    }

    // 2. Prepare nodes with similarities
    const nodes: RefNode[] = mixedSelection.map(v => ({
      ...v,
      similar: []
    }));

    nodes.forEach(el => {
      el.similar = getSimilarVerses(el, mixedSelection);
    });

    // 3. Reset and fill core engine
    const engine = engineRef.current;
    engine.readyToUse = [...nodes];
    engine.recentlyUsed = [];
    engine.archive = [];
    engine.preViewLinks = [...nodes];
    engine.preViewTexts = [...nodes];
    engine.currentViewLinks = [];
    engine.currentViewTexts = [];

    // Seed the first matched element to guarantee paths
    const curEl = engine.readyToUse[0];
    engine.currentViewLinks.push(curEl);
    engine.preViewLinks = engine.preViewLinks.filter(n => n.id !== curEl.id);
    engine.currentViewTexts.push(curEl);
    engine.preViewTexts = engine.preViewTexts.filter(n => n.id !== curEl.id);

    // Fill similar links for curEl
    let len = curEl.similar.length;
    while (len > 0 && engine.currentViewLinks.length < 3) {
      const similarId = curEl.similar[len - 1];
      const searchResult = engine.preViewLinks.find(n => n.id === similarId);
      if (searchResult) {
        engine.currentViewLinks.push(searchResult);
        engine.preViewLinks = engine.preViewLinks.filter(n => n.id !== similarId);
      }
      len--;
    }

    // Fill rest of links randomly
    while (engine.currentViewLinks.length < 3 && engine.preViewLinks.length > 0) {
      const newEl = getAnyEl<RefNode>(engine.preViewLinks);
      engine.currentViewLinks.push(newEl);
      engine.preViewLinks = engine.preViewLinks.filter(n => n.id !== newEl.id);
    }

    // Fill rest of texts randomly
    while (engine.currentViewTexts.length < 3 && engine.preViewTexts.length > 0) {
      const newEl = getAnyEl<RefNode>(engine.preViewTexts);
      engine.currentViewTexts.push(newEl);
      engine.preViewTexts = engine.preViewTexts.filter(n => n.id !== newEl.id);
    }

    // 4. Generate shuffled board Slots
    const sixMix = shuffleArray([0, 1, 2, 3, 4, 5]);
    const initialSlots: PlaySlot[] = sixMix.map(el => {
      if (el <= 2) {
        const textObj = engine.currentViewTexts[el];
        return {
          id: textObj.id,
          type: 'text',
          text: textObj.text,
          opacity: 1,
          isGold: false,
          isCoral: false,
          isSelected: false
        };
      } else {
        const linkObj = engine.currentViewLinks[el - 3];
        return {
          id: linkObj.id,
          type: 'link',
          text: `${linkObj.book}.${linkObj.chapter}:${linkObj.verse}`,
          opacity: 1,
          isGold: false,
          isCoral: false,
          isSelected: false
        };
      }
    });

    // Reset game states
    setSlots(initialSlots);
    setPoints(0);
    setTimerCount(120);
    setViewState('game');
  };

  // Option Click state reducer and visual flow controller
  const handleOptionClick = (slotIndex: number) => {
    const clickedSlot = slots[slotIndex];
    if (clickedSlot.opacity === 0 || clickedSlot.isGold || clickedSlot.isCoral) return;

    // Get index of the already selected slot (if any)
    const firstIdx = slots.findIndex(s => s.isSelected);

    if (firstIdx === -1) {
      // Nothing is selected, select the clicked one
      setSlots(prev => prev.map((s, idx) => {
        if (idx === slotIndex) return { ...s, isSelected: true };
        return s;
      }));
    } else if (firstIdx === slotIndex) {
      // Clicked the same selected one, toggle off
      setSlots(prev => prev.map((s, idx) => {
        if (idx === slotIndex) return { ...s, isSelected: false };
        return s;
      }));
    } else {
      const firstSlot = slots[firstIdx];
      
      if (firstSlot.type === clickedSlot.type) {
        // Same type (both texts or both links), shift selection to the new clicked option
        setSlots(prev => prev.map((s, idx) => {
          if (idx === firstIdx) return { ...s, isSelected: false };
          if (idx === slotIndex) return { ...s, isSelected: true };
          return s;
        }));
      } else {
        // Different types! Check ID match
        if (firstSlot.id === clickedSlot.id) {
          // CORRECT MATCH!
          setPoints(p => p + 1);
          
          // 1. Highlight in gold
          setSlots(prev => prev.map((s, idx) => {
            if (idx === firstIdx || idx === slotIndex) {
              return { ...s, isGold: true, isSelected: false };
            }
            return s;
          }));

          // 2. Fade out
          setTimeout(() => {
            setSlots(prev => prev.map((s, idx) => {
              if (idx === firstIdx || idx === slotIndex) {
                return { ...s, opacity: 0 };
              }
              return s;
            }));
          }, 350);

          // 3. Perform engine mutation and refill slots
          setTimeout(() => {
            const engine = engineRef.current;
            const matchedId = clickedSlot.id;

            // Calculate 'size' of other options currently on board
            const otherSlots = slots.filter(s => s.id !== matchedId);
            const idSet = new Set(otherSlots.map(s => s.id));
            const size = idSet.size;

            const curTextObj = engine.readyToUse.find(n => n.id === matchedId);
            if (!curTextObj) return;

            const moveToRecentlyUsed = (el: RefNode) => {
              engine.recentlyUsed.push(el);
              removeNode(el, engine.readyToUse);
              removeNode(el, engine.currentViewLinks);
              removeNode(el, engine.currentViewTexts);
              if (engine.recentlyUsed.length === 3) {
                // shiftToArchive
                const removed = engine.recentlyUsed.splice(1, 1)[0];
                engine.archive.push(removed);
              }
              if (engine.readyToUse.length === 2) {
                // refill
                const shuffledArchive = shuffleArray(engine.archive);
                shuffledArchive.forEach(item => {
                  engine.readyToUse.push(item);
                  engine.preViewTexts.push(item);
                  engine.preViewLinks.push(item);
                });
                engine.archive = [];
              }
            };

            const nextStep = (sz: number, el: RefNode) => {
              moveToRecentlyUsed(el);
              const linksView: RefNode[] = engine.currentViewLinks;
              const textsView: RefNode[] = engine.currentViewTexts;
              const linksPre: RefNode[] = engine.preViewLinks;
              const textsPre: RefNode[] = engine.preViewTexts;

              if (sz === 4) {
                const anyLink = getAnyEl<RefNode>(linksView);

                let len = anyLink.similar ? anyLink.similar.length : 0;
                while (len > 0 && linksView.length < 3) {
                  const similarId = anyLink.similar[len - 1];
                  const searchResult = linksPre.find(n => n.id === similarId);
                  if (searchResult) {
                    linksView.push(searchResult);
                    removeNode<RefNode>(searchResult, linksPre);
                  }
                  len--;
                }

                while (linksView.length < 3) {
                  const newEl = getAnyEl<RefNode>(linksPre);
                  linksView.push(newEl);
                  removeNode<RefNode>(newEl, linksPre);
                }

                let textToAdd = textsPre.find(n => n.id === anyLink.id);
                if (!textToAdd && textsPre.length > 0) {
                  textToAdd = getAnyEl<RefNode>(textsPre);
                }
                if (textToAdd) {
                  textsView.push(textToAdd);
                  removeNode<RefNode>(textToAdd, textsPre);
                }
              } else {
                const anyLink = getAnyEl<RefNode>(linksPre);
                if (anyLink) {
                  linksView.push(anyLink);
                  removeNode<RefNode>(anyLink, linksPre);
                }

                const anyText = getAnyEl<RefNode>(textsPre);
                if (anyText) {
                  textsView.push(anyText);
                  removeNode<RefNode>(anyText, textsPre);
                }
              }
            };

            // Execute next step state mutation
            nextStep(size, curTextObj);

            // Get the newly added elements at the end of current views
            const nextText = engine.currentViewTexts[engine.currentViewTexts.length - 1];
            const nextLink = engine.currentViewLinks[engine.currentViewLinks.length - 1];

            // Apply slot replacement with fresh cards at the matched indexes
            setSlots(prev => {
              const updated = [...prev];
              if (nextText) {
                updated[firstIdx] = {
                  id: nextText.id,
                  type: 'text',
                  text: nextText.text,
                  opacity: 1,
                  isGold: false,
                  isCoral: false,
                  isSelected: false
                };
              }
              if (nextLink) {
                updated[slotIndex] = {
                  id: nextLink.id,
                  type: 'link',
                  text: `${nextLink.book}.${nextLink.chapter}:${nextLink.verse}`,
                  opacity: 1,
                  isGold: false,
                  isCoral: false,
                  isSelected: false
                };
              }
              return updated;
            });

          }, 600);

        } else {
          // INCORRECT MATCH!
          setPoints(p => p - 1);
          setSlots(prev => prev.map((s, idx) => {
            if (idx === firstIdx || idx === slotIndex) {
              return { ...s, isCoral: true };
            }
            return s;
          }));

          setTimeout(() => {
            setSlots(prev => prev.map((s, idx) => {
              if (idx === firstIdx || idx === slotIndex) {
                return { ...s, isCoral: false, isSelected: false };
              }
              return s;
            }));
          }, 450);
        }
      }
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#d5ccab] p-6 text-center">
        <div className="h-[8vh] w-[8vh] animate-spin rounded-full border-4 border-[#878568] border-t-transparent" />
        <div className="mt-4 text-[2.5vh] text-[#878568]">Загрузка базы подбора...</div>
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
                message: 'Вы действительно хотите прервать текущий раунд подбора? Набранные очки сгорят.',
                type: 'confirm',
                onConfirm: () => {
                  setViewState('setup');
                }
              });
            } else if (viewState === 'summary') {
              setViewState('setup');
            } else {
              onBack();
            }
          }}
          className="text-[2.2vh] font-medium text-[#505143] hover:opacity-75"
        >
          {viewState === 'game' ? 'Выход' : 'Назад'}
        </button>
        <div className="text-[3vh] font-bold text-[#878568]">
          {viewState === 'game' ? 'Игра "Подбор"' : 'Подбор'}
        </div>
        <div className="w-[10vw]" />
      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: SETUP CHECKLIST */}
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
                <svg className="h-[12vh] w-[12vh] fill-[#878568]/40" viewBox="0 0 512 512">
                  <path d="M403.8 34.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9s-19.8-16.6-19.8-29.6l0-32-32 0c-10.1 0-19.6 4.7-25.6 12.8L284 229.3 244 176l31.2-41.6C293.3 110.2 321.8 96 352 96l32 0 0-32c0-12.9 7.8-24.6 19.8-29.6z" />
                </svg>
                <h3 className="text-[3vh] font-bold text-[#878568]">Нет изучаемых уроков</h3>
                <p className="text-[2.1vh] leading-relaxed max-w-sm font-light text-[#878568]/95">
                  Вы пока не добавили ни одного урока в изучаемые. Добавьте уроки в разделе <strong>"Уроки"</strong>, чтобы запускать по ним подбор.
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
                  Выберите уроки для игры на подбор соответствий. Сопоставляйте стих с его каноническим адресом на время!
                </div>

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

                        <div className="flex-1 flex flex-col">
                          <div className="text-[2.1vh] font-medium leading-tight text-[#505143] break-words">
                            {lesson.title}
                          </div>
                          <div className="text-[1.5vh] text-[#a3a289] mt-0.5 font-light">
                            Часть {lesson.part} • Этап {lesson.phase + 1}: {PHASE_TEXTS[lesson.phase]?.[0]}
                          </div>
                          <div className={`mt-2 text-[1.4vh] rounded-lg px-2.5 py-1 inline-flex w-fit items-center ${statusVal.bg} ${statusVal.color}`}>
                            {statusVal.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 bg-white/70 border-t border-[#a3a289]/20">
                  <button
                    disabled={selectedLessonKeys.length === 0}
                    onClick={handleStartRound}
                    className={`w-full py-4 rounded-2xl text-[2.5vh] font-bold text-[#d5ccab] transition-all shadow ${
                      selectedLessonKeys.length > 0 
                        ? 'bg-[#505143] active:scale-98 hover:opacity-95' 
                        : 'bg-[#a3a289]/50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    Запустить подбор ({selectedLessonKeys.length})
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* VIEW 2: MAIN GAME INTERACTIVE */}
        {viewState === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 p-5 flex flex-col justify-between min-h-0"
          >
            {/* Top Info metrics */}
            <div className="flex justify-between items-center mb-4 bg-white/45 p-3 rounded-2xl border border-[#a3a289]/10">
              <div className="flex items-center gap-2">
                <Clock className="h-[3vh] w-[3vh] text-[#505143]" />
                <span className="text-[2.6vh] font-extrabold text-[#505143] font-mono">
                  {timerCount} <span className="text-[1.8vh] font-normal">сек</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-[3vh] w-[3vh] text-[#878568]" />
                <span className="text-[2.6vh] font-extrabold text-[#505143] font-mono">
                  {points} <span className="text-[1.8vh] text-[#878568] font-normal leading-none">{pointsText(points)}</span>
                </span>
              </div>
            </div>

            {/* Core interactive buttons board (6 scrambled elements styled with space typography) */}
            <div className="flex-1 grid grid-cols-1 select-none gap-3 items-stretch content-center max-w-lg mx-auto w-full py-2">
              {slots.map((slot, index) => {
                const getColorsClass = () => {
                  if (slot.isGold) return 'bg-[#e5c158] border-[#c09d3b] text-[#505143] shadow-lg scale-98';
                  if (slot.isCoral) return 'bg-rose-200 border-rose-400 text-rose-800 scale-98 border-2';
                  if (slot.isSelected) return 'bg-[#505143] border-[#505143] text-[#d5ccab] ring-4 ring-[#505143]/20 scale-[0.99] font-semibold';
                  return 'bg-white border-[#a3a289]/20 text-[#505143] shadow-md hover:bg-white/80 active:scale-98 font-normal';
                };

                return (
                  <button
                    key={`${index}-${slot.id}`}
                    onClick={() => handleOptionClick(index)}
                    disabled={slot.opacity === 0 || slot.isGold || slot.isCoral}
                    style={{
                      opacity: slot.opacity,
                      transition: 'opacity 0.35s ease-out, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s'
                    }}
                    className={`flex items-center justify-center p-4 rounded-2xl border text-center font-normal break-words leading-tight shadow-sm cursor-pointer select-none outline-none ${getColorsClass()} min-h-[9vh]`}
                  >
                    {slot.type === 'text' ? (
                      <span className="text-[1.7vh] leading-normal font-light line-clamp-3">
                        {slot.text}
                      </span>
                    ) : (
                      <span className="text-[2.2vh] font-bold tracking-wide font-mono">
                        {slot.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 text-center text-[1.6vh] text-[#878568] px-2 italic font-light">
              Сопоставляйте пары: нажмите текст Писания, затем соответствующий ему канонический адрес книги и главы.
            </div>
          </motion.div>
        )}

        {/* VIEW 3: SUMMARY SCORE */}
        {viewState === 'summary' && (
          <motion.div 
            key="summary"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 p-6 flex flex-col justify-between min-h-0"
          >
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="h-[12vh] w-[12vh] rounded-full bg-emerald-100 flex items-center justify-center mb-6 text-[6vh] shadow-inner">
                🏆
              </div>
              <h2 className="text-[3.8vh] font-extrabold text-[#505143] leading-tight">Время вышло!</h2>
              <p className="text-[2.4vh] text-[#878568] mt-2 font-light">
                Ваш финальный результат в подборе:
              </p>
              <div className="text-[7.5vh] font-black text-emerald-800 font-mono mt-1 leading-none">
                {points}
              </div>
              <p className="text-[2.1vh] text-[#878568] font-normal italic mt-1">
                {pointsText(points)}
              </p>

              <p className="text-[1.8vh] text-[#878568]/85 max-w-sm mt-6 font-light leading-relaxed">
                Вы успешно закрепили знания по выбранным урокам Писания в игровом режиме. Попробуйте еще раз, чтобы побить свой рекорд!
              </p>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setViewState('setup')}
                className="flex-1 py-4 rounded-2xl text-[2.2vh] font-semibold text-[#505143] bg-[#a3a289]/20 active:scale-98 transition-transform border border-[#a3a289]/20 shadow-sm"
              >
                Выбрать уроки
              </button>
              <button
                onClick={handleStartRound}
                className="flex-1 py-4 rounded-2xl text-[2.2vh] font-bold text-[#d5ccab] bg-[#505143] active:scale-98 transition-transform shadow-md"
              >
                Повторить
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SYSTEM CONFIRM / ALERT CUSTOM MODAL */}
      <AnimatePresence>
        {appDialog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-[24px] bg-[#f2ebcf] p-6 shadow-2xl border border-[#a3a289]/30 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-[#878568]/15 flex items-center justify-center text-[3.5vh] mb-4 mx-auto text-[#505143]">
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
