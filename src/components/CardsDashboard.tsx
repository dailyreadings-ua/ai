import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pencil } from 'lucide-react';
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

interface SelectedLessonItem {
  part: number;
  index: number;
  title: string;
}

interface CustomLessonGroup {
  id: string;
  title: string;
  lessons: SelectedLessonItem[];
  count: number;
}

function getBaseTopic(title: string): string {
  return title.replace(/\s*\((?:Продолжение|продолжение|Окончание|окончание).*\)$/i, '').trim();
}

function getLessonTitleFromData(lesson: any, lessons: any[], titles: string[]): string {
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
}

function getLessonsPlural(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) {
    return `${count} уроков`;
  }
  if (mod10 === 1) {
    return `${count} урок`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} урока`;
  }
  return `${count} уроков`;
}

function formatCustomGroupTitle(
  selected: SelectedLessonItem[],
  part1Titles: string[] | undefined,
  part2Titles: string[] | undefined
): string {
  if (!part1Titles || !part2Titles) return '';
  
  // Group by Part & Base Topic
  const groups: Record<string, { part: number; baseTopic: string; items: SelectedLessonItem[] }> = {};
  
  selected.forEach(item => {
    const base = getBaseTopic(item.title);
    const key = `${item.part}-${base}`;
    if (!groups[key]) {
      groups[key] = { part: item.part, baseTopic: base, items: [] };
    }
    groups[key].items.push(item);
  });

  const topicTitles: string[] = [];

  Object.values(groups).forEach(grp => {
    const { part, baseTopic, items } = grp;
    const allTitlesInPart = part === 1 ? part1Titles : part2Titles;
    
    // Find all lessons belonging to this baseTopic in this part
    const allTopicLessonsInPart: { index: number; title: string }[] = [];
    allTitlesInPart.forEach((title, idx) => {
      if (getBaseTopic(title) === baseTopic) {
        allTopicLessonsInPart.push({ index: idx, title });
      }
    });

    // Sort items and allTopicLessons by index
    items.sort((a, b) => a.index - b.index);
    allTopicLessonsInPart.sort((a, b) => a.index - b.index);

    // If there is only 1 lesson in this topic globally, just print the topic name
    if (allTopicLessonsInPart.length <= 1) {
      topicTitles.push(baseTopic);
      return;
    }

    if (items.length === 1) {
      topicTitles.push(items[0].title);
      return;
    }

    // Determine the 1-based order of selected items within this topic
    const selectedOrderNumbers: number[] = items.map(item => {
      const idxInTopic = allTopicLessonsInPart.findIndex(t => t.index === item.index);
      return idxInTopic + 1; // 1-based index
    }).filter(n => n > 0);

    if (selectedOrderNumbers.length === allTopicLessonsInPart.length) {
      topicTitles.push(`${baseTopic} (полностью)`);
    } else {
      const ranges: string[] = [];
      let start = selectedOrderNumbers[0];
      let end = selectedOrderNumbers[0];
      for (let i = 1; i < selectedOrderNumbers.length; i++) {
        if (selectedOrderNumbers[i] === end + 1) {
          end = selectedOrderNumbers[i];
        } else {
          if (start === end) {
            ranges.push(`${start}`);
          } else {
            ranges.push(`${start}-${end}`);
          }
          start = selectedOrderNumbers[i];
          end = selectedOrderNumbers[i];
        }
      }
      if (start === end) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${end}`);
      }
      
      const rangesStr = ranges.join(', ');
      const word = selectedOrderNumbers.length === 1 ? 'урок' : 'уроки';
      topicTitles.push(`${baseTopic} (${rangesStr} ${word})`);
    }
  });

  return topicTitles.join('. ');
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

    // Создаем элемент-спан для замера ширины слов, наследующий все стили testP
    const measureSpan = document.createElement('span');
    measureSpan.style.display = 'inline-block';
    measureSpan.style.whiteSpace = 'nowrap';
    measureSpan.style.position = 'absolute';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.left = '-9999px';
    measureSpan.style.top = '-9999px';
    testP.appendChild(measureSpan);

    // Находим самое длинное по пиксельной ширине слово
    const words = text.split(/\s+/).map(w => w.trim()).filter(Boolean);
    let widestWord = '';
    let maxMeasuredWidth = 0;

    // Сначала замерим все слова на базовом размере шрифта, чтобы найти самое широкое
    testP.style.fontSize = baseSizeVh + 'vh';
    for (const word of words) {
      measureSpan.textContent = word;
      const wWidth = measureSpan.offsetWidth;
      if (wWidth > maxMeasuredWidth) {
        maxMeasuredWidth = wWidth;
        widestWord = word;
      }
    }

    let size = baseSizeVh;
    const minFontSize = minSizeVh;
    const step = 0.1;

    // Установим допустимую ширину для слова с безопасным отступом по бокам
    // (например, 24px от общей ширины контейнера, чтобы слово не прилипало к краям)
    const allowedWordWidth = Math.max(40, clientWidth - 24);

    // Поступово зменшуємо розмір шрифту
    while (size >= minFontSize) {
      testP.style.fontSize = size + 'vh';

      // Замеряем ширину самого широкого слова на текущем размере шрифта
      let wordWidth = 0;
      if (widestWord) {
        measureSpan.textContent = widestWord;
        wordWidth = measureSpan.offsetWidth;
      }

      // Проверяем, что:
      // 1. Общая высота текста помещается по вертикали
      // 2. Самое длинное слово полностью помещается по горизонтали
      if (testEl.scrollHeight <= clientHeight && wordWidth <= allowedWordWidth) {
        break;
      }
      size -= step;
    }

    // Прибираємо тимчасовий елемент (вместе со вложенным measureSpan)
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
          {text}
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

  const [customLessons, setCustomLessons] = useState<CustomLessonGroup[]>(() => {
    try {
      const stored = localStorage.getItem('dr_custom_lessons');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('dr_custom_lessons', JSON.stringify(customLessons));
  }, [customLessons]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPart, setModalPart] = useState<1 | 2>(1);
  const [modalSelected, setModalSelected] = useState<SelectedLessonItem[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState<string>('');

  const handleStartRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setRenamingGroupId(id);
    setRenamingValue(currentTitle);
  };

  const handleSaveRename = (id: string) => {
    if (renamingValue.trim()) {
      setCustomLessons(prev => prev.map(g => {
        if (g.id === id) {
          return { ...g, title: renamingValue.trim() };
        }
        return g;
      }));
    }
    setRenamingGroupId(null);
  };

  const dueLessons = useMemo(() => {
    return studyingLessons.filter(lesson => {
      const status = getLessonStatusText(lesson.startDate, lesson.expiryDate);
      return status.status === 'active' || status.status === 'expired';
    });
  }, [studyingLessons]);

  const part1LessonTitles = useMemo(() => {
    if (!part1Data) return [];
    return part1Data[2].map(lesson => getLessonTitleFromData(lesson, part1Data[2], part1Data[1]));
  }, [part1Data]);

  const part2LessonTitles = useMemo(() => {
    if (!part2Data) return [];
    return part2Data[2].map(lesson => getLessonTitleFromData(lesson, part2Data[2], part2Data[1]));
  }, [part2Data]);
  
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
  const [isPaused, setIsPaused] = useState(false);
  const [pausesUsed, setPausesUsed] = useState(0);
  const [elapsedBeforePause, setElapsedBeforePause] = useState(0);
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
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
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

  // Default to empty selection so that user can manually check desired items

  // Combine verses for game round
  const flatVersesCache = useMemo(() => {
    const map = new Map<string, Verse[]>();
    
    if (part1Data) {
      const versesRaw = part1Data[0];
      const versesList = Array.isArray(versesRaw[0]) 
        ? (versesRaw as Verse[][]).flat() 
        : (versesRaw as Verse[]);
        
      part1Data[2].forEach((lesson, index) => {
        const lessonVerses = versesList.filter(v => lesson.texts.includes(Number(v.id)));
        const key = `1-${index}`;
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
        
      part2Data[2].forEach((lesson, index) => {
        const lessonVerses = versesList.filter(v => lesson.texts.includes(Number(v.id)));
        const key = `2-${index}`;
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

  const handleRemoveLesson = (lessonToRemove: StudyingLesson) => {
    setAppDialog({
      title: 'Убрать из изучения?',
      message: `Вы действительно хотите удалить урок "${lessonToRemove.title}" из списка изучаемых? Ваш прогресс по этому уроку будет сброшен.`,
      type: 'confirm',
      confirmText: 'Да, убрать',
      onConfirm: () => {
        const updated = studyingLessons.filter(
          l => !(l.lessonIndex === lessonToRemove.lessonIndex && l.part === lessonToRemove.part)
        );
        onSaveLessons(updated);
        const key = `${lessonToRemove.part}-${lessonToRemove.lessonIndex}`;
        setSelectedLessonKeys(prev => prev.filter(k => k !== key));
      }
    });
  };

  const handleAddCustomGroup = (selected: SelectedLessonItem[]) => {
    const newTitle = formatCustomGroupTitle(selected, part1LessonTitles, part2LessonTitles);
    if (editingGroupId) {
      const existingGroup = customLessons.find(g => g.id === editingGroupId);
      if (existingGroup) {
        const originalAutoTitle = formatCustomGroupTitle(existingGroup.lessons, part1LessonTitles, part2LessonTitles);
        const hasCustomTitle = existingGroup.title !== originalAutoTitle;
        const countChanged = selected.length !== existingGroup.lessons.length;

        if (hasCustomTitle && countChanged) {
          setAppDialog({
            title: 'Обновить название?',
            message: `Вы изменили количество уроков. Хотите обновить название группы на новое автоматическое («${newTitle}») или оставить ваше текущее название («${existingGroup.title}»)?`,
            type: 'confirm',
            confirmText: 'Обновить',
            cancelText: 'Оставить',
            onConfirm: () => {
              setCustomLessons(prev => prev.map(g => {
                if (g.id === editingGroupId) {
                  return {
                    ...g,
                    title: newTitle,
                    lessons: [...selected],
                    count: selected.length
                  };
                }
                return g;
              }));
              setIsModalOpen(false);
              setEditingGroupId(null);
            },
            onCancel: () => {
              setCustomLessons(prev => prev.map(g => {
                if (g.id === editingGroupId) {
                  return {
                    ...g,
                    lessons: [...selected],
                    count: selected.length
                  };
                }
                return g;
              }));
              setIsModalOpen(false);
              setEditingGroupId(null);
            }
          });
          return;
        } else if (hasCustomTitle) {
          setCustomLessons(prev => prev.map(g => {
            if (g.id === editingGroupId) {
              return {
                ...g,
                lessons: [...selected],
                count: selected.length
              };
            }
            return g;
          }));
          setIsModalOpen(false);
          setEditingGroupId(null);
          return;
        }
      }

      setCustomLessons(prev => prev.map(g => {
        if (g.id === editingGroupId) {
          return {
            ...g,
            title: newTitle,
            lessons: [...selected],
            count: selected.length
          };
        }
        return g;
      }));
    } else {
      const newGroup: CustomLessonGroup = {
        id: 'custom-' + Date.now(),
        title: newTitle,
        lessons: [...selected],
        count: selected.length
      };
      setCustomLessons(prev => [...prev, newGroup]);
      setSelectedLessonKeys(prev => {
        if (prev.includes(newGroup.id)) return prev;
        return [...prev, newGroup.id];
      });
    }
    setIsModalOpen(false);
    setEditingGroupId(null);
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

    const addLessonVerses = (part: number, ch: number) => {
      const cacheKey = `${part}-${ch}`;
      const verses = flatVersesCache.get(cacheKey) || [];
      verses.forEach(v => {
        if (!selectedVersesArray.some(sv => String(sv.id) === String(v.id))) {
          selectedVersesArray.push(v);
        }
      });
      if (!metaList.some(m => m.chapter === ch && m.part === part)) {
        metaList.push({ chapter: ch, part });
      }
    };

    selectedLessonKeys.forEach(key => {
      if (key.startsWith('custom-')) {
        const group = customLessons.find(g => g.id === key);
        if (group) {
          group.lessons.forEach(l => {
            addLessonVerses(l.part, l.index);
          });
        }
      } else {
        const [partStr, chStr] = key.split('-');
        const part = Number(partStr);
        const ch = Number(chStr);
        addLessonVerses(part, ch);
      }
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
    setIsPaused(false);
    setPausesUsed(0);
    setElapsedBeforePause(0);
    setViewState('game');
  };

  // Helper for natural Russian pause plurals
  const getPauseWord = (count: number) => {
    if (count % 10 === 1 && count % 100 !== 11) {
      return 'пауза';
    }
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
      return 'паузы';
    }
    return 'пауз';
  };

  const handlePauseToggle = () => {
    const totalPauses = Math.max(1, Math.ceil(initialDeck.length / 15));
    const pausesRemaining = totalPauses - pausesUsed;

    if (isPaused) {
      // Resume
      setCardShownTime(Date.now() - elapsedBeforePause);
      setIsPaused(false);
    } else {
      // Pause
      if (pausesRemaining <= 0) {
        setAppDialog({
          title: 'Паузы исчерпаны',
          message: `Для этой игры доступно максимум ${totalPauses} ${getPauseWord(totalPauses)}. Вы уже использовали все попытки!`,
          type: 'alert'
        });
        return;
      }
      const elapsed = cardShownTime > 0 ? (Date.now() - cardShownTime) : 0;
      setElapsedBeforePause(elapsed);
      setIsPaused(true);
      setPausesUsed(prev => prev + 1);
    }
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
            className="flex-1 flex flex-col min-h-0 relative"
          >
            <div className="flex h-[10vh] min-h-[10vh] items-center justify-center border-b border-[#a3a289]/10 px-6 flex-shrink-0">
              <div className="text-[3.5vh] font-bold text-[#878568]">
                Повторение
              </div>
            </div>
            {dueLessons.length === 0 && customLessons.length === 0 && studyingLessons.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#505143] gap-4">
                <svg className="h-[12vh] w-[12vh] fill-[#878568]/40" viewBox="0 0 576 512">
                  <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2z"/>
                </svg>
                <h3 className="text-[3vh] font-bold text-[#878568]">Нет изучаемых уроков</h3>
                <p className="text-[2.1vh] leading-relaxed max-w-sm font-light text-[#878568]/95">
                  Вы пока не добавили ни одного урока в изучаемые. Однако вы можете добавить любые темы для повторения вручную с помощью кнопки ниже или перейти в раздел <strong>"Уроки"</strong>.
                </p>
                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={() => {
                      setModalSelected([]);
                      setIsModalOpen(true);
                    }}
                    className="rounded-xl bg-[#878568] px-5 py-2.5 text-[2vh] font-medium text-white shadow active:scale-95 transition-transform"
                  >
                    + Добавить вручную
                  </button>
                  <button 
                    onClick={onBack}
                    className="rounded-xl bg-[#505143] px-5 py-2.5 text-[2vh] font-medium text-[#d5ccab] shadow active:scale-95 transition-transform"
                  >
                    Перейти в Уроки
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 relative">
                {/* Lesson checklist */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      setModalSelected([]);
                      setIsModalOpen(true);
                    }}
                    className="w-full py-3 px-4 mb-1 rounded-xl border border-dashed border-[#878568]/40 bg-white/30 text-[#505143] font-bold text-[1.8vh] flex items-center justify-center gap-2 hover:bg-white/60 active:scale-[0.99] transition-all"
                  >
                    <span>+ Добавить уроки</span>
                  </button>

                  {dueLessons.length === 0 && customLessons.length === 0 ? (
                    <div className="py-8 px-4 text-center text-[#878568] font-light text-[1.8vh]">
                      Нет подоспевших уроков для повторения по кривой забывания.<br/>
                      Вы можете добавить нужные темы вручную с помощью кнопки выше.
                    </div>
                  ) : (
                    <>
                      {/* Standard due lessons */}
                      {dueLessons.map(lesson => {
                        const key = `${lesson.part}-${lesson.lessonIndex}`;
                        const isChecked = selectedLessonKeys.includes(key);
                        const statusVal = getLessonStatusText(lesson.startDate, lesson.expiryDate);

                        return (
                          <div 
                            key={key}
                            onClick={() => handleToggleLessonSelection(key)}
                            className={`relative flex items-center justify-between gap-3 rounded-xl py-2.5 px-3 border transition-all cursor-pointer ${
                              isChecked 
                                ? 'bg-white border-[#878568] shadow-md' 
                                : 'bg-white/45 border-[#a3a289]/20 hover:bg-white/60'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-6">
                              {/* Miniature custom checkbox */}
                              <div className={`h-[3.2vh] w-[3.2vh] min-w-[3.2vh] rounded-md border flex items-center justify-center transition-colors ${
                                isChecked 
                                  ? 'bg-[#505143] border-[#505143]' 
                                  : 'border-[#a3a289] bg-transparent'
                              }`}>
                                {isChecked && (
                                  <svg className="h-[1.6vh] w-[1.6vh] fill-white" viewBox="0 0 448 512">
                                    <path d="M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 338.7 54.6 233.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
                                  </svg>
                                )}
                              </div>

                              {/* Text and status */}
                              <div className="flex-1 flex flex-col min-w-0">
                                <div className="text-[1.8vh] font-semibold leading-tight text-[#505143] break-words">
                                  {lesson.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[1.35vh] flex-wrap">
                                  <span className="text-[#a3a289]">
                                    Этап {lesson.phase + 1}: {PHASE_TEXTS[lesson.phase]?.[0]}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md ${statusVal.bg} ${statusVal.color}`}>
                                    {statusVal.text}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Remove from studying button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveLesson(lesson);
                              }}
                              className="absolute top-1/2 -translate-y-1/2 right-2 h-7 w-7 flex items-center justify-center rounded-lg text-[#a3a289] hover:text-rose-600 hover:bg-rose-50/50 active:scale-95 transition-all"
                              title="Убрать из изучения"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}

                      {/* Custom lessons */}
                      {customLessons.map(group => {
                        const isChecked = selectedLessonKeys.includes(group.id);

                        return (
                          <div 
                            key={group.id}
                            onClick={() => handleToggleLessonSelection(group.id)}
                            className={`relative flex items-center justify-between gap-3 rounded-xl py-2.5 px-3 border transition-all cursor-pointer ${
                              isChecked 
                                ? 'bg-white border-[#878568] shadow-md' 
                                : 'bg-white/45 border-[#a3a289]/20 hover:bg-white/60'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-16">
                              {/* Miniature custom checkbox */}
                              <div className={`h-[3.2vh] w-[3.2vh] min-w-[3.2vh] rounded-md border flex items-center justify-center transition-colors ${
                                isChecked 
                                  ? 'bg-[#505143] border-[#505143]' 
                                  : 'border-[#a3a289] bg-transparent'
                              }`}>
                                {isChecked && (
                                  <svg className="h-[1.6vh] w-[1.6vh] fill-white" viewBox="0 0 448 512">
                                    <path d="M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 338.7 54.6 233.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
                                  </svg>
                                )}
                              </div>

                              {/* Text and status */}
                              <div className="flex-1 flex flex-col min-w-0">
                                {renamingGroupId === group.id ? (
                                  <input
                                    type="text"
                                    value={renamingValue}
                                    onChange={(e) => setRenamingValue(e.target.value)}
                                    onBlur={() => handleSaveRename(group.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveRename(group.id);
                                      } else if (e.key === 'Escape') {
                                        setRenamingGroupId(null);
                                      }
                                    }}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[1.8vh] font-semibold leading-tight text-[#505143] bg-white border border-[#a3a289] rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#878568] w-full"
                                  />
                                ) : (
                                  <div 
                                    onClick={(e) => handleStartRename(e, group.id, group.title)}
                                    className="text-[1.8vh] font-semibold leading-tight text-[#505143] break-words line-clamp-4 cursor-text hover:bg-black/5 hover:rounded px-1 -mx-1 py-0.5 transition-colors"
                                    title="Нажмите, чтобы переименовать"
                                  >
                                    {group.title}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-1 text-[1.35vh]">
                                  <span className="px-2 py-0.5 rounded-md bg-[#878568]/15 text-[#878568] border border-[#a3a289]/10 font-medium">
                                    {getLessonsPlural(group.count)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1">
                              {/* Edit custom group button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGroupId(group.id);
                                  setModalSelected([...group.lessons]);
                                  if (group.lessons.length > 0) {
                                    setModalPart(group.lessons[0].part as 1 | 2);
                                  } else {
                                    setModalPart(1);
                                  }
                                  setIsModalOpen(true);
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-[#a3a289] hover:text-[#505143] hover:bg-[#878568]/15 active:scale-95 transition-all"
                                title="Редактировать список уроков"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              {/* Remove custom group button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomLessons(prev => prev.filter(g => g.id !== group.id));
                                  setSelectedLessonKeys(prev => prev.filter(k => k !== group.id));
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-[#a3a289] hover:text-rose-600 hover:bg-rose-50/50 active:scale-95 transition-all"
                                title="Удалить из списка"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
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

            {/* Modal for adding custom lessons */}
            <AnimatePresence>
              {isModalOpen && (
                <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className="w-full max-w-lg bg-[#d5ccab] rounded-t-3xl shadow-2xl border-t border-[#a3a289]/30 flex flex-col max-h-[85vh]"
                  >
                    {/* Modal Header */}
                    <div className="p-4 border-b border-[#a3a289]/20 flex items-center justify-between bg-[#878568]/15">
                      <span className="text-[2.2vh] font-bold text-[#505143]">
                        {editingGroupId ? 'Редактировать группу' : 'Добавить уроки'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalOpen(false);
                          setEditingGroupId(null);
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-[#505143] hover:bg-black/5 active:scale-95 transition-all"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Part Select tab buttons */}
                    <div className="flex border-b border-[#a3a289]/10 bg-white/10">
                      <button
                        type="button"
                        onClick={() => setModalPart(1)}
                        className={`flex-1 py-3 text-[1.8vh] font-bold text-center transition-all border-b-2 ${
                          modalPart === 1 
                            ? 'border-[#505143] text-[#505143] bg-white/20' 
                            : 'border-transparent text-[#878568] hover:text-[#505143]'
                        }`}
                      >
                        Часть 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalPart(2)}
                        className={`flex-1 py-3 text-[1.8vh] font-bold text-center transition-all border-b-2 ${
                          modalPart === 2 
                            ? 'border-[#505143] text-[#505143] bg-white/20' 
                            : 'border-transparent text-[#878568] hover:text-[#505143]'
                        }`}
                      >
                        Часть 2
                      </button>
                    </div>

                    {/* Select All / Deselect All */}
                    <div className="px-4 py-2 bg-white/20 border-b border-[#a3a289]/10 flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const titles = modalPart === 1 ? part1LessonTitles : part2LessonTitles;
                          if (titles) {
                            const currentPartSelected = titles.map((title, index) => ({ part: modalPart, index, title }));
                            setModalSelected(prev => {
                              const otherParts = prev.filter(item => item.part !== modalPart);
                              return [...otherParts, ...currentPartSelected];
                            });
                          }
                        }}
                        className="text-[1.5vh] font-bold text-[#505143] hover:underline"
                      >
                        Выбрать все
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalSelected(prev => prev.filter(item => item.part !== modalPart));
                        }}
                        className="text-[1.5vh] font-bold text-[#878568] hover:underline"
                      >
                        Снять выделение
                      </button>
                    </div>

                    {/* Lesson List */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 custom-scrollbar bg-white/45">
                      {((modalPart === 1 ? part1LessonTitles : part2LessonTitles) || []).map((title: string, index: number) => {
                        const isSelected = modalSelected.some(item => item.part === modalPart && item.index === index);
                        return (
                          <div
                            key={index}
                            onClick={() => {
                              setModalSelected(prev => {
                                const exists = prev.some(item => item.part === modalPart && item.index === index);
                                if (exists) {
                                  return prev.filter(item => !(item.part === modalPart && item.index === index));
                                } else {
                                  return [...prev, { part: modalPart, index, title }];
                                }
                              });
                            }}
                            className={`flex items-center gap-3 rounded-xl p-3 border cursor-pointer transition-all ${
                              isSelected 
                                ? 'bg-white border-[#505143] shadow-sm' 
                                : 'bg-white/30 border-transparent hover:bg-white/60'
                            }`}
                          >
                            {/* Miniature Checkbox */}
                            <div className={`h-6 w-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected ? 'bg-[#505143] border-[#505143]' : 'border-[#a3a289] bg-transparent'
                            }`}>
                              {isSelected && (
                                <svg className="h-3 w-3 fill-white" viewBox="0 0 448 512">
                                  <path d="M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 338.7 54.6 233.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>
                                </svg>
                              )}
                            </div>
                            <span className="text-[1.8vh] leading-tight text-[#505143] font-medium">{title}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 border-t border-[#a3a289]/20 flex gap-3 bg-[#878568]/10">
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalOpen(false);
                          setEditingGroupId(null);
                        }}
                        className="flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-bold text-[#505143] bg-white/55 border border-[#a3a289]/35 hover:bg-white/80 active:scale-97 transition-all"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={modalSelected.length === 0}
                        onClick={() => {
                          handleAddCustomGroup(modalSelected);
                        }}
                        className={`flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-bold transition-all shadow ${
                          modalSelected.length > 0 
                            ? 'bg-[#505143] text-[#d5ccab] hover:opacity-95 active:scale-97 cursor-pointer' 
                            : 'bg-[#a3a289]/40 text-[#505143]/40 cursor-not-allowed'
                        }`}
                      >
                        {editingGroupId ? 'Сохранить' : 'Добавить'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
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
                <div className="flex flex-col items-end justify-center">
                  {cardsDeck.length > 0 && (
                    <button
                      type="button"
                      onClick={handlePauseToggle}
                      className={`flex items-center gap-1.5 px-3 py-1 bg-[#505143]/10 hover:bg-[#505143]/20 text-[#505143] text-[1.4vh] font-bold rounded-full border border-[#505143]/15 transition-all active:scale-95 cursor-pointer select-none`}
                      title={(() => {
                        const totalPauses = Math.max(1, Math.ceil(initialDeck.length / 15));
                        const remaining = totalPauses - pausesUsed;
                        return remaining > 0 ? `Поставить игру на паузу (Доступно: ${remaining})` : 'Паузы исчерпаны';
                      })()}
                    >
                      {isPaused ? (
                        <>
                          <svg className="h-[1.2vh] w-[1.2vh]" viewBox="0 0 384 512" fill="currentColor">
                            <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/>
                          </svg>
                          <span>Продолжить</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-[1.2vh] w-[1.2vh]" viewBox="0 0 320 512" fill="currentColor">
                            <path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/>
                          </svg>
                          <span>Пауза ({Math.max(0, Math.max(1, Math.ceil(initialDeck.length / 15)) - pausesUsed)})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Segmented Progress Bar with navigation arrows */}
              <div className="flex items-center gap-3 w-full mb-4">
                {/* Left Arrow */}
                <button
                  type="button"
                  disabled={currentCardIndex === 0 || isPaused}
                  onClick={() => {
                    if (currentCardIndex > 0) {
                      setIsFlipped(false);
                      setCurrentCardIndex(prev => prev - 1);
                    }
                  }}
                  className={`p-1.5 rounded-xl transition-all ${
                    currentCardIndex === 0 || isPaused
                      ? 'opacity-20 cursor-not-allowed text-[#878568]'
                      : 'text-[#505143] hover:bg-[#878568]/15 active:scale-95 cursor-pointer'
                  }`}
                  title="Назад"
                >
                  <svg className="h-[2.5vh] w-[2.5vh] fill-current" viewBox="0 0 320 512">
                    <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
                  </svg>
                </button>

                {/* Continuous Three-Color Progress Bar Container */}
                {(() => {
                  const totalCards = initialDeck.length || 1;
                  const correctNum = initialDeck.filter(c => firstAttemptResults[c.id] === 'correct').length;
                  const incorrectNum = initialDeck.filter(c => firstAttemptResults[c.id] === 'incorrect').length;
                  const correctPct = (correctNum / totalCards) * 100;
                  const incorrectPct = (incorrectNum / totalCards) * 100;
                  const currentPosPct = (currentCardIndex / totalCards) * 100;

                  return (
                    <div className="relative flex-1 h-2 bg-[#a3a289]/20 rounded-full select-none">
                      {/* Proportional solid filled segments */}
                      <div className="absolute inset-0 flex rounded-full overflow-hidden">
                        {correctPct > 0 && (
                          <div 
                            className="h-full bg-[#047857] transition-all duration-300 ease-out"
                            style={{ width: `${correctPct}%` }}
                          />
                        )}
                        {incorrectPct > 0 && (
                          <div 
                            className="h-full bg-[#fb7185] transition-all duration-300 ease-out"
                            style={{ width: `${incorrectPct}%` }}
                          />
                        )}
                        <div className="h-full bg-transparent flex-grow" />
                      </div>

                      {/* Sliding marker representing current position */}
                      {initialDeck.length > 0 && (
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#505143] border border-white shadow-md transition-all duration-300 ease-out flex items-center justify-center"
                          style={{ 
                            left: `calc(${currentPosPct}% - 7px)`,
                            zIndex: 10
                          }}
                        >
                          <div className="h-1 w-1 rounded-full bg-[#d5ccab]" />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Right Arrow */}
                <button
                  type="button"
                  disabled={currentCardIndex >= maxCardIndexReached || isPaused}
                  onClick={() => {
                    if (currentCardIndex < maxCardIndexReached) {
                      setIsFlipped(false);
                      setCurrentCardIndex(prev => prev + 1);
                    }
                  }}
                  className={`p-1.5 rounded-xl transition-all ${
                    currentCardIndex >= maxCardIndexReached || isPaused
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
            <div className="flex-1 min-h-0 w-full max-w-md mx-auto flex items-stretch justify-center relative touch-pan-y">
              {isPaused ? (
                <div className="absolute inset-0 z-40 rounded-3xl bg-[#505143]/15 backdrop-blur-xl border border-[#a3a289]/25 flex flex-col items-center justify-center p-6 text-center select-none shadow-2xl">
                  {/* Big Play Icon */}
                  <div 
                    onClick={handlePauseToggle}
                    className="h-[10vh] w-[10vh] rounded-full bg-[#878568] border border-white/20 flex items-center justify-center mb-6 text-[#eae4d3] shadow-lg cursor-pointer active:scale-95 transition-transform"
                  >
                    <svg className="h-[4vh] w-[4vh] ml-1" viewBox="0 0 384 512" fill="currentColor">
                      <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/>
                    </svg>
                  </div>
                  <h3 className="text-[2.8vh] font-black text-[#505143] tracking-wide mb-2 uppercase">
                    Игра на паузе
                  </h3>
                  <p className="text-[1.8vh] text-[#505143]/80 max-w-xs mb-8 leading-relaxed">
                    Время остановлено. Вы можете сделать перерыв и продолжить в любой момент.
                  </p>
                  <button
                    type="button"
                    onClick={handlePauseToggle}
                    className="px-8 py-4 bg-[#505143] text-[#d5ccab] font-bold text-[2vh] rounded-2xl active:scale-95 transition-transform shadow-lg flex items-center gap-3 cursor-pointer select-none hover:bg-[#505143]/90"
                  >
                    <span>Продолжить игру</span>
                  </button>
                  <div className="mt-4 text-[1.4vh] text-[#505143]/60 font-medium">
                    Осталось пауз: {Math.max(0, Math.max(1, Math.ceil(initialDeck.length / 15)) - pausesUsed)} из {Math.max(1, Math.ceil(initialDeck.length / 15))}
                  </div>
                </div>
              ) : (
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
                  <div className={`absolute inset-0 backface-hidden rounded-3xl bg-[#505143] px-4 pt-4 pb-3 flex flex-col justify-between shadow-2xl border border-[#a3a289]/10 select-none touch-pan-y ${
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
                    <div className="flex-grow flex flex-col items-center justify-center px-1 py-2 min-h-0 touch-pan-y">
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
                  <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-[#878568] px-4 pt-4 pb-3 flex flex-col justify-between shadow-2xl border border-white/10 select-none touch-pan-y ${
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
                    <div className="flex-grow flex flex-col justify-center items-center px-1 py-2 min-h-0 touch-pan-y">
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
              )}
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
            <div className="flex-1 p-6 pt-8 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              {/* Celeb Stats header */}
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center h-[11vh] w-[11vh] rounded-full bg-emerald-100 border border-emerald-200 mb-2.5 text-[4.5vh]">
                  🏆
                </div>
                <h2 className="text-[3vh] font-bold text-[#505143] leading-tight">Карточки изучены!</h2>
                <p className="text-[2vh] text-[#878568] mt-1 font-light max-w-sm mx-auto">
                  С первой попытки верно: <strong className="font-semibold text-emerald-800">{initialDeck.length - Object.values(firstAttemptResults).filter(val => val === 'incorrect').length}</strong> из <strong className="font-semibold">{initialDeck.length}</strong> ({initialDeck.length > 0 ? Math.round(((initialDeck.length - Object.values(firstAttemptResults).filter(val => val === 'incorrect').length) / initialDeck.length) * 100) : 0}%).
                </p>
                {Object.values(firstAttemptResults).filter(val => val === 'incorrect').length > 0 && (
                  <p className="text-[1.5vh] text-[#878568] mt-0.5 italic font-light">
                    Ошибочные карточки были дополнительно отработаны вами до правильного ответа!
                  </p>
                )}
              </div>

              {/* Progress on each tracked lesson */}
              <div className="flex-1 flex flex-col min-h-0 bg-white/30 rounded-2xl border border-[#a3a289]/15 p-4">
                {selectedLessonKeys.some(key => key.startsWith('custom-')) ? (
                  <>
                    <h4 className="text-[2vh] font-bold text-[#505143] mb-3 uppercase tracking-wide">
                      Пройденные группы:
                    </h4>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 custom-scrollbar">
                      {selectedLessonKeys
                        .filter(key => key.startsWith('custom-'))
                        .map(key => {
                          const group = customLessons.find(g => g.id === key);
                          if (!group) return null;
                          return (
                            <div key={group.id} className="p-4 rounded-xl border border-[#a3a289]/20 bg-white/40 flex flex-col">
                              <div className="text-[2.2vh] font-bold text-[#505143] mb-1">
                                {group.title}
                              </div>
                              <div className="text-[1.6vh] text-[#878568] font-medium mb-3">
                                Количество уроков: {group.lessons.length}
                              </div>
                              
                              <div className="text-[1.5vh] font-semibold text-[#505143] mb-1.5 uppercase tracking-wider opacity-80">
                                Входящие уроки:
                              </div>
                              <div className="flex flex-col gap-1.5 max-h-[20vh] overflow-y-auto custom-scrollbar pr-1">
                                {group.lessons.map((lesson, idx) => (
                                  <div key={idx} className="text-[1.7vh] text-[#505143]/90 bg-white/30 rounded-lg px-2.5 py-1.5 border border-[#a3a289]/10">
                                    {lesson.title} <span className="text-[1.35vh] opacity-60 font-medium">(Часть {lesson.part})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </>
                ) : processedStudyUpdates.length > 0 ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <h4 className="text-[2vh] font-bold text-[#505143] mb-3 uppercase tracking-wide">
                      Пройденные уроки:
                    </h4>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 custom-scrollbar">
                      {selectedLessonKeys.map(key => {
                        const [partStr, chStr] = key.split('-');
                        const part = Number(partStr);
                        const ch = Number(chStr);
                        const title = part === 1 ? part1LessonTitles?.[ch] : part2LessonTitles?.[ch];
                        return (
                          <div key={key} className="p-4 rounded-xl border border-[#a3a289]/15 bg-white/40 flex flex-col">
                            <div className="text-[1.9vh] font-bold text-[#505143]">
                              {title || `Урок ${ch + 1}`} (Часть {part})
                            </div>
                            <div className="text-[1.5vh] text-[#878568] mt-1">
                              Добавьте этот урок в изучаемые в разделе «Уроки», чтобы отслеживать этапы памяти и интервалы повторения.
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
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
                      onClick={() => {
                        if (appDialog.onCancel) appDialog.onCancel();
                        setAppDialog(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-semibold text-[#505143] bg-white border border-[#a3a289]/30 hover:bg-white/60 active:scale-97 transition-all"
                    >
                      {appDialog.cancelText || 'Отмена'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (appDialog.onConfirm) appDialog.onConfirm();
                        setAppDialog(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-[1.8vh] font-bold text-[#d5ccab] bg-[#505143] hover:opacity-95 active:scale-97 transition-all shadow"
                    >
                      {appDialog.confirmText || 'Да, выйти'}
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
