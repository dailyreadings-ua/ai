import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
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

interface AutoFittingTextProps {
  text: string;
  maxVh: number;
  baseSizeVh: number;
  minSizeVh?: number;
  italic?: boolean;
  fontWeight?: string;
}

function AutoFittingText({
  text,
  maxVh,
  baseSizeVh,
  minSizeVh = 1.4,
  italic = false,
  fontWeight = 'font-sans font-semibold'
}: AutoFittingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(baseSizeVh);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // Monitor container size changes to re-run font fitting once element is fully laid out and sized
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) {
      setFontSize(baseSizeVh);
      return;
    }

    const clientHeight = container.clientHeight;
    const clientWidth = container.clientWidth;

    // If container is not yet visible or has zero/very small dimensions, don't run fitting yet
    if (clientHeight <= 20 || clientWidth <= 20) {
      setFontSize(baseSizeVh);
      return;
    }

    const innerEl = textEl.parentElement;
    if (!innerEl) {
      setFontSize(baseSizeVh);
      return;
    }

    // Клонируем весь внутренний контейнер со всеми паддингами и дочерними элементами
    const testEl = innerEl.cloneNode(true) as HTMLDivElement;
    testEl.style.position = 'absolute';
    testEl.style.visibility = 'hidden';
    testEl.style.zIndex = '-9999';
    testEl.style.width = clientWidth + 'px';
    testEl.style.left = '-9999px';
    testEl.style.top = '-9999px';
    testEl.style.height = 'auto';
    testEl.style.maxHeight = 'none';

    container.appendChild(testEl);

    const testP = testEl.querySelector('p');
    if (!testP) {
      container.removeChild(testEl);
      setFontSize(baseSizeVh);
      return;
    }

    let size = baseSizeVh;
    const minFontSize = minSizeVh;
    const step = 0.1;

    // Поступово зменшуємо розмір шрифту
    while (size >= minFontSize) {
      testP.style.fontSize = size + 'vh';
      if (testEl.scrollHeight <= clientHeight) {
        break;
      }
      size -= step;
    }

    // Прибираємо тимчасовий елемент
    container.removeChild(testEl);

    // Застосовуємо знайдений розмір шрифту
    setFontSize(Math.max(minFontSize, size));
  }, [text, baseSizeVh, minSizeVh, containerHeight]);

  return (
    <div 
      ref={containerRef}
      className="flex-grow w-full h-full min-h-0 overflow-hidden flex flex-col justify-center items-center"
      style={{ maxHeight: `${maxVh}vh` }}
    >
      <div className="w-full p-2 flex flex-col items-center justify-center text-center touch-pan-y">
        <p 
          ref={textRef}
          style={{ fontSize: `${fontSize}vh` }}
          className={`leading-[1.28] text-[#d5ccab] text-center touch-pan-y ${fontWeight} ${italic ? 'italic' : ''}`}
        >
          "{text}"
        </p>
      </div>
    </div>
  );
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
          maxCardsLimit: (typeof parsed.maxCardsLimit === 'number' || parsed.maxCardsLimit === '') ? parsed.maxCardsLimit : 10
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

  const handleAutoRate = (verseId: string, side: 'address_by_text' | 'text_by_address', knows: boolean, elapsedSec: number) => {
    let nextRating = 0;
    setCardRatings(prev => {
      const rKey = `${verseId}_${side}`;
      const prevRating = prev[rKey] || 0;

      if (!knows) {
        if (prevRating === 0) {
          nextRating = 1;
        } else if (prevRating === 3) {
          nextRating = 2;
        } else if (prevRating === 2) {
          nextRating = 1;
        } else {
          nextRating = 1;
        }
      } else {
        if (elapsedSec <= 10.0) {
          if (prevRating === 0) {
            nextRating = 3;
          } else if (prevRating === 1) {
            nextRating = 2;
          } else if (prevRating === 2) {
            nextRating = 3;
          } else {
            nextRating = 3;
          }
        } else {
          if (prevRating === 0) {
            nextRating = 2;
          } else if (prevRating === 1) {
            nextRating = 2;
          } else if (prevRating === 3) {
            nextRating = 2;
          } else {
            nextRating = 2;
          }
        }
      }

      // If rating actually changed, trigger an animated feedback on the screen!
      if (nextRating !== prevRating) {
        setRatingFeedback({
          direction: nextRating > prevRating ? 'up' : 'down',
          prev: prevRating,
          next: nextRating,
          seconds: Number(elapsedSec.toFixed(1))
        });
      }

      const next = { ...prev };
      if (nextRating === 0) {
        delete next[rKey];
      } else {
        next[rKey] = nextRating;
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
  const [dragX, setDragX] = useState(0);
  const [exitX, setExitX] = useState(0);
  const [exitRotate, setExitRotate] = useState(0);
  const [maxCardIndexReached, setMaxCardIndexReached] = useState(0);
  const [currentRoundResults, setCurrentRoundResults] = useState<Record<string, 'correct' | 'incorrect'>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [correctCardIds, setCorrectCardIds] = useState<string[]>([]);
  const [incorrectCardIds, setIncorrectCardIds] = useState<string[]>([]);
  const [cardShownTime, setCardShownTime] = useState<number>(0);
  const [ratingFeedback, setRatingFeedback] = useState<{
    direction: 'up' | 'down';
    prev: number;
    next: number;
    seconds: number;
  } | null>(null);

  // Reset/start card shown timer when a new card is loaded on screen
  useEffect(() => {
    if (viewState === 'game' && cardsDeck[currentCardIndex]) {
      setCardShownTime(Date.now());
    }
  }, [currentCardIndex, cardsDeck, viewState]);

  // Clear rating feedback notification after a brief delay
  useEffect(() => {
    if (ratingFeedback) {
      const timer = setTimeout(() => {
        setRatingFeedback(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [ratingFeedback]);

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

  const { correctCount, incorrectCount } = useMemo(() => {
    const correct = initialDeck.filter(c => firstAttemptResults[c.id] === 'correct').length;
    const incorrect = initialDeck.filter(c => firstAttemptResults[c.id] === 'incorrect').length;
    return { correctCount: correct, incorrectCount: incorrect };
  }, [initialDeck, firstAttemptResults]);

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
          fetch(`${import.meta.env.BASE_URL}fund1.json`).then(r => r.json()),
          fetch(`${import.meta.env.BASE_URL}fund2.json`).then(r => r.json())
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
    if (gameSettings.countMode === 'limit' && (gameSettings.maxCardsLimit === '' || Number(gameSettings.maxCardsLimit) <= 0)) {
      setAppDialog({
        title: 'Внимание',
        message: 'Необходимо указать количество карточек для повторения (не менее 1)!',
        type: 'alert'
      });
      return;
    }

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
    setCurrentRoundResults({});
    setCurrentCardIndex(0);
    setMaxCardIndexReached(0);
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
    const targetSide = currentCard.targetSide;
    
    // Calculate elapsed seconds since card was displayed
    const elapsedSec = cardShownTime > 0 ? (Date.now() - cardShownTime) / 1000 : 0;
    
    // Automatically determine and update the card's rating (only during the first pass!)
    if (retryPassCount === 0) {
      handleAutoRate(id, targetSide, knows, elapsedSec);
    }

    // Log failures / successes for current pass
    const updatedFailures = [...currentPassFailures];
    const updatedSuccesses = [...currentPassSuccesses];
    
    // Always store the result of the current card in the current pass
    setCurrentRoundResults(prev => ({
      ...prev,
      [cardId]: knows ? 'correct' : 'incorrect'
    }));
    
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
      const nextIndex = currentCardIndex + 1;
      setCurrentCardIndex(nextIndex);
      setMaxCardIndexReached(prev => Math.max(prev, nextIndex));
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
        setMaxCardIndexReached(0);
        setCurrentRoundResults({});
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
            <div className="flex h-[10vh] min-h-[10vh] items-center justify-center border-b border-[#a3a289]/10 px-6 flex-shrink-0">
              <div className="text-[3.5vh] font-bold text-[#878568]">
                Повторение
              </div>
            </div>
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
                <div className="p-4 flex-shrink-0">
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
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex h-[10vh] min-h-[10vh] items-center justify-center border-b border-[#a3a289]/10 px-6 flex-shrink-0">
              <div className="text-[3.5vh] font-bold text-[#878568]">
                Повторение
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col justify-between min-h-0">
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
                          const raw = e.target.value;
                          if (raw === '') {
                            setGameSettings(prev => ({ ...prev, maxCardsLimit: '', countMode: 'limit' }));
                          } else {
                            const parsed = parseInt(raw, 10);
                            setGameSettings(prev => ({ 
                              ...prev, 
                              maxCardsLimit: isNaN(parsed) ? '' : parsed, 
                              countMode: 'limit' 
                            }));
                          }
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
            </div>
          </motion.div>
        )}

        {/* VIEW 3: ACTIVE 3D FLIP GAME INTERACTION */}
        {viewState === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 px-6 pt-6 pb-6 flex flex-col justify-between min-h-0 relative"
          >
            {/* Animated Rating Feedback Overlay */}
            <AnimatePresence>
              {ratingFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.85 }}
                  className="absolute top-[2.5vh] left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex flex-col items-center w-max max-w-[90%]"
                >
                  <div className={`px-4 py-2.5 rounded-2xl shadow-xl border flex items-center gap-2.5 bg-opacity-95 backdrop-blur-md ${
                    ratingFeedback.direction === 'up'
                      ? 'bg-[#e6f4ea] border-emerald-500/30 text-[#137333] shadow-emerald-900/10'
                      : 'bg-[#fce8e6] border-rose-500/30 text-[#c5221f] shadow-rose-900/10'
                  }`}>
                    <span className="text-[2.2vh]">
                      {ratingFeedback.direction === 'up' ? '📈' : '📉'}
                    </span>
                    <div className="flex flex-col text-left">
                      <span className="font-extrabold text-[1.6vh] leading-snug">
                        {ratingFeedback.direction === 'up' ? 'Рейтинг повышен!' : 'Рейтинг понижен!'}
                      </span>
                      <span className="text-[1.3vh] opacity-90 leading-tight">
                        Уровень {ratingFeedback.prev || 0} → {ratingFeedback.next} ({ratingFeedback.seconds} сек)
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header progress info */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between text-[1.8vh] text-[#878568] mb-2 font-medium">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[2vh] font-bold text-[#505143]">Карточка {currentCardIndex + 1} из {cardsDeck.length}</span>
                    {retryPassCount > 0 && (
                      <span className="text-[1.4vh] text-amber-950 font-bold bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded">
                        круг {retryPassCount}
                      </span>
                    )}
                  </div>
                  {/* Visual mini-indicator of current session counts */}
                  <div className="flex items-center gap-3 text-[1.6vh] mt-1">
                    <span className="flex items-center gap-1 text-emerald-800 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                      {correctCount} верно
                    </span>
                    <span className="flex items-center gap-1 text-rose-800 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-rose-400" />
                      {incorrectCount} неверно
                    </span>
                  </div>
                </div>
                <span className="text-[#505143] text-right font-light italic">
                  Часть {cardsDeck[currentCardIndex]?.part} (урок {cardsDeck[currentCardIndex]?.lessonIndex + 1})
                </span>
              </div>
              
              {/* Segmented Progress Bar with navigation arrows */}
              <div className="flex items-center gap-3 w-full mb-4">
                {/* Left Arrow */}
                <button
                  type="button"
                  disabled={currentCardIndex === 0}
                  onClick={() => {
                    if (currentCardIndex > 0) {
                      setIsFlipped(false);
                      setCurrentCardIndex(prev => prev - 1);
                    }
                  }}
                  className={`p-1.5 rounded-xl transition-all ${
                    currentCardIndex === 0
                      ? 'opacity-20 cursor-not-allowed text-[#878568]'
                      : 'text-[#505143] hover:bg-[#878568]/15 active:scale-95 cursor-pointer'
                  }`}
                  title="Назад"
                >
                  <svg className="h-[2.5vh] w-[2.5vh] fill-current" viewBox="0 0 320 512">
                    <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
                  </svg>
                </button>

                {/* Segmented Progress Bar Container */}
                <div className="flex gap-1 flex-1">
                  {initialDeck.map((c) => {
                    const res = firstAttemptResults[c.id];
                    const isActive = cardsDeck[currentCardIndex] && c.id === cardsDeck[currentCardIndex].id;
                    
                    let pillBg = "bg-[#a3a289]/25";
                    if (res === 'correct') {
                      pillBg = "bg-[#047857]"; // solid green
                    } else if (res === 'incorrect') {
                      pillBg = "bg-[#fb7185]"; // solid rose
                    }
                    
                    return (
                      <div 
                        key={c.id} 
                        className={`h-2 flex-grow rounded-full transition-all duration-300 ${pillBg} ${
                          isActive ? 'ring-2 ring-[#505143] ring-offset-2 scale-y-125 bg-[#505143]' : ''
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Right Arrow */}
                <button
                  type="button"
                  disabled={currentCardIndex >= maxCardIndexReached}
                  onClick={() => {
                    if (currentCardIndex < maxCardIndexReached) {
                      setIsFlipped(false);
                      setCurrentCardIndex(prev => prev + 1);
                    }
                  }}
                  className={`p-1.5 rounded-xl transition-all ${
                    currentCardIndex >= maxCardIndexReached
                      ? 'opacity-20 cursor-not-allowed text-[#878568]'
                      : 'text-[#505143] hover:bg-[#878568]/15 active:scale-95 cursor-pointer'
                  }`}
                  title="Вперед"
                >
                  <svg className="h-[2.5vh] w-[2.5vh] fill-current" viewBox="0 0 320 512">
                    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* 3D Flipping Card Container */}
            <div className="flex-1 min-h-0 w-full max-w-md mx-auto flex items-stretch justify-center touch-pan-y">
              <motion.div 
                key={cardsDeck[currentCardIndex]?.id}
                drag={currentCardIndex === maxCardIndexReached ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.8}
                onDragStart={() => {
                  if (currentCardIndex === maxCardIndexReached) {
                    setIsDragging(true);
                  }
                }}
                onDrag={(_, info) => {
                  if (currentCardIndex === maxCardIndexReached) {
                    setDragX(info.offset.x);
                  }
                }}
                onDragEnd={(_, info) => {
                  if (currentCardIndex !== maxCardIndexReached) return;
                  // Small delay to ensure pointer tap doesn't fire immediately if it was dragged
                  setTimeout(() => {
                    setIsDragging(false);
                  }, 50);

                  const swipeThreshold = 120;
                  if (info.offset.x > swipeThreshold) {
                    setExitX(1000);
                    setExitRotate(30);
                  } else if (info.offset.x < -swipeThreshold) {
                    setExitX(-1000);
                    setExitRotate(-30);
                  } else {
                    setExitX(0);
                    setExitRotate(0);
                    setDragX(0);
                  }
                }}
                onTap={() => {
                  if (!isDragging) {
                    setIsFlipped(prev => !prev);
                  }
                }}
                animate={exitX !== 0 ? {
                  x: exitX,
                  rotate: exitRotate,
                  opacity: 0,
                  scale: 0.9
                } : {
                  rotate: dragX / 15,
                  opacity: 1,
                  scale: 1
                }}
                transition={{
                  type: 'spring',
                  stiffness: exitX !== 0 ? 160 : 300,
                  damping: exitX !== 0 ? 20 : 26
                }}
                onAnimationComplete={() => {
                  if (exitX !== 0) {
                    const isCorrect = exitX > 0;
                    handleCardFeedback(isCorrect);
                    setExitX(0);
                    setExitRotate(0);
                    setDragX(0);
                  }
                }}
                className={`w-full h-full min-h-0 perspective-1000 relative select-none touch-pan-y ${
                  currentCardIndex === maxCardIndexReached ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                }`}
              >
                {/* Drag status overlay on card wrapper for seamless motion with the card */}
                {dragX > 15 && (
                  <div 
                    className="absolute inset-0 rounded-3xl bg-emerald-700/20 flex flex-col items-center justify-center pointer-events-none z-40 transition-opacity duration-75"
                    style={{ opacity: Math.min(Math.max((dragX - 15) / 100, 0), 1) }}
                  >
                    <div className="bg-[#505143] text-emerald-400 font-black text-[2.80vh] tracking-widest px-8 py-4 rounded-2xl border border-emerald-500/30 shadow-2xl uppercase">
                      Помню
                    </div>
                  </div>
                )}
                {dragX < -15 && (
                  <div 
                    className="absolute inset-0 rounded-3xl bg-rose-700/20 flex flex-col items-center justify-center pointer-events-none z-40 transition-opacity duration-75"
                    style={{ opacity: Math.min(Math.max((-dragX - 15) / 100, 0), 1) }}
                  >
                    <div className="bg-[#505143] text-rose-400 font-black text-[2.80vh] tracking-widest px-8 py-4 rounded-2xl border border-rose-500/30 shadow-2xl uppercase">
                      Не помню
                    </div>
                  </div>
                )}

                <div 
                  className={`w-full h-full duration-500 preserve-3d relative transition-transform touch-pan-y ${
                    isFlipped ? 'rotate-y-180' : ''
                  }`}
                >
                  
                  {/* FRONT SIDE */}
                  <div className={`absolute inset-0 backface-hidden rounded-3xl bg-[#505143] p-6 flex flex-col justify-between shadow-2xl border border-[#a3a289]/10 select-none touch-pan-y ${
                    isFlipped ? 'pointer-events-none' : ''
                  }`}>
                    {/* Visual marker if already completed */}
                    {currentCardIndex < maxCardIndexReached && (
                      <div className="w-full flex justify-center mb-1 flex-shrink-0">
                        {currentRoundResults[cardsDeck[currentCardIndex]?.id] === 'correct' ? (
                          <span className="text-emerald-400 border border-emerald-500/35 text-[1.4vh] px-4 py-1 rounded-full uppercase tracking-widest font-black bg-[#444538]">
                            Пройдено • Помню
                          </span>
                        ) : (
                          <span className="text-rose-400 border border-rose-500/35 text-[1.4vh] px-4 py-1 rounded-full uppercase tracking-widest font-black bg-[#444538]">
                            Пройдено • Не помню
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex-grow flex flex-col items-center justify-center p-4 min-h-0 touch-pan-y">
                      {(() => {
                        const targetSide = cardsDeck[currentCardIndex]?.targetSide;
                        const v = cardsDeck[currentCardIndex]?.verse;
                        if (!v) return null;

                        if (targetSide === 'address_by_text') {
                          return (
                            <AutoFittingText 
                              text={v.text}
                              maxVh={42}
                              baseSizeVh={4.2}
                              fontWeight="font-sans font-semibold"
                              italic={false}
                            />
                          );
                        } else {
                          return (
                            <div className="text-center flex flex-col items-center justify-center h-full touch-pan-y">
                              <h3 className="text-[4.5vh] sm:text-[5vh] font-black text-[#d5ccab] tracking-wide leading-tight touch-pan-y">
                                {v.book}.{v.chapter}:{v.verse}
                              </h3>
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
                          className="flex items-center gap-2 select-none self-center bg-[#505143]/65 py-1.5 px-4 rounded-full mb-1 pointer-events-none"
                        >
                          <div className="flex gap-2">
                            {[1, 2, 3].map((starVal) => {
                              const isStarred = currentRating >= starVal;
                              return (
                                <div key={starVal} className="p-0.5">
                                  {isStarred ? (
                                    <svg className="h-[2.4vh] w-[2.4vh] fill-[#d5ccab] stroke-[#d5ccab]" viewBox="0 0 24 24">
                                      <circle cx="12" cy="12" r="8" strokeWidth="2" />
                                    </svg>
                                  ) : (
                                    <svg className="h-[2.4vh] w-[2.4vh] fill-transparent stroke-[#d5ccab]/40" viewBox="0 0 24 24">
                                      <circle cx="12" cy="12" r="8" strokeWidth="2" />
                                    </svg>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* BACK SIDE */}
                  <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-[#878568] p-6 flex flex-col justify-between shadow-2xl border border-white/10 select-none touch-pan-y ${
                    !isFlipped ? 'pointer-events-none' : ''
                  }`}>
                    {/* Visual marker if already completed */}
                    {currentCardIndex < maxCardIndexReached && (
                      <div className="w-full flex justify-center mb-1 flex-shrink-0">
                        {currentRoundResults[cardsDeck[currentCardIndex]?.id] === 'correct' ? (
                          <span className="text-emerald-200 border border-emerald-400/30 text-[1.4vh] px-4 py-1 rounded-full uppercase tracking-widest font-black bg-[#757356]">
                            Пройдено • Помню
                          </span>
                        ) : (
                          <span className="text-rose-200 border border-rose-400/30 text-[1.4vh] px-4 py-1 rounded-full uppercase tracking-widest font-black bg-[#757356]">
                            Пройдено • Не помню
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex-grow flex flex-col justify-center items-center p-4 min-h-0 touch-pan-y">
                      {(() => {
                        const targetSide = cardsDeck[currentCardIndex]?.targetSide;
                        const v = cardsDeck[currentCardIndex]?.verse;
                        if (!v) return null;

                        if (targetSide === 'address_by_text') {
                          return (
                            <div className="text-center flex flex-col items-center justify-center h-full touch-pan-y">
                              <h3 className="text-[5vh] sm:text-[5.5vh] font-black text-[#d5ccab] tracking-wide leading-tight touch-pan-y">
                                {v.book}.{v.chapter}:{v.verse}
                              </h3>
                            </div>
                          );
                        } else {
                          return (
                            <AutoFittingText 
                              text={v.text}
                              maxVh={42}
                              baseSizeVh={4.2}
                              fontWeight="font-sans font-semibold"
                              italic={false}
                            />
                          );
                        }
                      })()}
                    </div>
                  </div>

                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* VIEW 4: SUMMARY & INTERVAL RESULTS ADVANCEMENTS */}
        {viewState === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex h-[10vh] min-h-[10vh] items-center justify-center border-b border-[#a3a289]/10 px-6 flex-shrink-0">
              <div className="text-[3.5vh] font-bold text-[#878568]">
                Повторение
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col justify-between overflow-hidden">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STANDARD BOTTOM FOOTER */}
      <div 
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
            setViewState('setup');
          } else if (viewState === 'settings') {
            setViewState('setup');
          } else {
            onBack();
          }
        }}
        className="flex h-[10vh] min-h-[10vh] cursor-pointer items-center border-t border-[#a3a289]/20"
      >
        <div className="flex h-[10vh] w-[10vh] items-center justify-center">
          <svg className="h-[5vh] w-[5vh] fill-[#505143] opacity-20" viewBox="0 0 576 512">
            <path d="M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z" />
          </svg>
        </div>
        <div className="pl-4 text-[3vh] font-light text-[#505143] opacity-20">
          {viewState === 'game' ? 'Выйти' : 'Вернуться'}
        </div>
      </div>

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
