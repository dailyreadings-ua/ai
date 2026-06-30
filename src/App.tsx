/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ViewState, FundData, Lesson, StudyingLesson } from './types.ts';
import { GreetingPage } from './components/GreetingPage.tsx';
import { MainDashboard } from './components/MainDashboard.tsx';
import { FundamentalsHome } from './components/FundamentalsHome.tsx';
import { FundamentalsParts } from './components/FundamentalsParts.tsx';
import { LessonList } from './components/LessonList.tsx';
import { Study } from './components/Study.tsx';
import { CardsDashboard } from './components/CardsDashboard.tsx';
import { MatchDashboard } from './components/MatchDashboard.tsx';
import { getDates, getLessonStatusText } from './constants.ts';
import { ProfileModal } from './components/ProfileModal.tsx';

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [studyingLessons, setStudyingLessons] = useState<StudyingLesson[]>([]);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [mode, setMode] = useState<'LESSONS' | 'CARDS' | 'SEARCH'>('LESSONS');
  const [fundData, setFundData] = useState<FundData | null>(null);
  const [currentLesson, setCurrentLesson] = useState<number | null>(null);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [completedVerses, setCompletedVerses] = useState<string[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');

  // Функция для синхронизации с full-stack сервером
  const syncWithServer = async (overrideData?: {
    username?: string;
    studyingLessons?: StudyingLesson[];
    tgEnabled?: boolean;
    tgBotToken?: string;
    tgChatId?: string;
  }) => {
    let currentUserId = localStorage.getItem('dr_user_id');
    if (!currentUserId) {
      currentUserId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : 'user_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('dr_user_id', currentUserId);
    }

    const currentUsername = overrideData?.username ?? username ?? (JSON.parse(localStorage.getItem('dr_info') || '{}').username || '');
    const currentLessons = overrideData?.studyingLessons ?? studyingLessons;
    const currentTgEnabled = overrideData?.tgEnabled ?? (localStorage.getItem('dr_tg_enabled') === 'true');
    const currentTgBotToken = overrideData?.tgBotToken ?? (localStorage.getItem('dr_tg_bot_token') || '');
    const currentTgChatId = overrideData?.tgChatId ?? (localStorage.getItem('dr_tg_chat_id') || '');
    
    const notifiedPhasesStr = localStorage.getItem('dr_tg_notified_phases') || '{}';
    const currentNotifiedPhases = JSON.parse(notifiedPhasesStr);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentUserId,
          username: currentUsername,
          tgEnabled: currentTgEnabled,
          tgBotToken: currentTgBotToken,
          tgChatId: currentTgChatId,
          studyingLessons: currentLessons,
          notifiedPhases: currentNotifiedPhases
        })
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        console.error('Failed to sync settings with server:', resData);
      } else {
        console.log('Successfully synced settings with server!');
      }
    } catch (err) {
      console.error('Error syncing with server:', err);
    }
  };

  // Автоматические уведомления в Telegram при обнаружении новых доступных этапов (резервный клиентский таймер)
  useEffect(() => {
    if (isLoading || !username || studyingLessons.length === 0) return;

    const tgEnabled = localStorage.getItem('dr_tg_enabled') === 'true';
    const botToken = localStorage.getItem('dr_tg_bot_token')?.trim();
    const chatId = localStorage.getItem('dr_tg_chat_id')?.trim();

    if (!tgEnabled || !botToken || !chatId) return;

    // Находим все уроки, которые сейчас доступны для повторения
    const dueLessons = studyingLessons.filter(lesson => {
      const statusVal = getLessonStatusText(lesson.startDate, lesson.expiryDate);
      return statusVal.status === 'active' || statusVal.status === 'expired';
    });

    if (dueLessons.length === 0) return;

    // Загружаем уже отправленные уведомления, чтобы не слать дубли
    const notifiedPhasesStr = localStorage.getItem('dr_tg_notified_phases') || '{}';
    const notifiedPhases: Record<string, number> = JSON.parse(notifiedPhasesStr);

    // Фильтруем только те уроки, для которых фаза изменилась и уведомление еще не посылалось
    const newlyDueLessons = dueLessons.filter(lesson => {
      const key = `${lesson.part}_${lesson.lessonIndex}`;
      const lastNotifiedPhase = notifiedPhases[key];
      // Если мы еще не уведомляли о текущей фазе этого урока
      return lastNotifiedPhase === undefined || lastNotifiedPhase < lesson.phase;
    });

    if (newlyDueLessons.length === 0) return;

    // Формируем красивое сообщение
    const listText = newlyDueLessons
      .map((l, idx) => `${idx + 1}. <b>Часть ${l.part}</b>, урок ${l.lessonIndex + 1}: <i>«${l.title}»</i> (Фаза ${l.phase + 1})`)
      .join('\n');

    const messageText = `📚 <b>Привет, ${username}!</b>\n\nПоявились новые уроки для повторения по кривой забывания:\n\n${listText}\n\n👉 Зайдите в приложение для прохождения интервального повторения!`;

    // Отправляем в фоновом режиме
    const sendNotify = async () => {
      try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'HTML',
          }),
        });

        const data = response.ok ? await response.json() : null;
        if (data && data.ok) {
          console.log('Telegram notification sent successfully!');
          // Обновляем состояние отправленных фаз
          newlyDueLessons.forEach(l => {
            const key = `${l.part}_${l.lessonIndex}`;
            notifiedPhases[key] = l.phase;
          });
          localStorage.setItem('dr_tg_notified_phases', JSON.stringify(notifiedPhases));
          
          // Синхронизируем отправленные фазы с сервером
          syncWithServer();
        } else {
          console.error('Failed to send Telegram notification:', data);
        }
      } catch (error) {
        console.error('Error sending automatic Telegram notification:', error);
      }
    };

    // Задержка на полторы секунды, чтобы не спамить при инициализации приложения
    const timer = setTimeout(() => {
      sendNotify();
    }, 1500);

    return () => clearTimeout(timer);
  }, [isLoading, username, studyingLessons]);

  // Загрузка данных при старте и Cloud-синхронизация
  useEffect(() => {
    const loadAndSync = async () => {
      // Загрузка пользователя
      const loadedInfo = JSON.parse(localStorage.getItem('dr_info') || '{}');
      if (loadedInfo.username) {
        setUsername(loadedInfo.username);
      }

      // Загрузка уроков (аналог lessons.load())
      const loadedLessons = JSON.parse(localStorage.getItem('dr_lessons') || '[]');
      setStudyingLessons(loadedLessons);

      // Загрузка прогресса
      const loadedCompleted = JSON.parse(localStorage.getItem('dr_completed_ids') || '[]');
      setCompletedVerses(loadedCompleted);

      // Загрузка или создание userId
      let storedUserId = localStorage.getItem('dr_user_id');
      if (!storedUserId) {
        storedUserId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : 'user_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('dr_user_id', storedUserId);
      }
      setUserId(storedUserId);

      setIsLoading(false);

      // Пробуем синхронизировать профиль с full-stack сервером
      try {
        const res = await fetch(`/api/profile/${storedUserId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const s = data.data;
            // Если на сервере более свежие настройки, обновляем локально
            if (s.username && s.username !== loadedInfo.username) {
              setUsername(s.username);
              localStorage.setItem('dr_info', JSON.stringify({ username: s.username }));
            }
            if (s.tgEnabled !== undefined) {
              localStorage.setItem('dr_tg_enabled', String(s.tgEnabled));
            }
            if (s.tgBotToken) {
              localStorage.setItem('dr_tg_bot_token', s.tgBotToken);
            }
            if (s.tgChatId) {
              localStorage.setItem('dr_tg_chat_id', s.tgChatId);
            }
            if (s.studyingLessons && s.studyingLessons.length > 0 && loadedLessons.length === 0) {
              setStudyingLessons(s.studyingLessons);
              localStorage.setItem('dr_lessons', JSON.stringify(s.studyingLessons));
            }
            if (s.notifiedPhases) {
              localStorage.setItem('dr_tg_notified_phases', JSON.stringify(s.notifiedPhases));
            }
          } else {
            // Если на сервере нет данных, отправим наши локальные данные на сервер
            if (loadedInfo.username) {
              const currentTgEnabled = localStorage.getItem('dr_tg_enabled') === 'true';
              const currentTgBotToken = localStorage.getItem('dr_tg_bot_token') || '';
              const currentTgChatId = localStorage.getItem('dr_tg_chat_id') || '';
              const notifiedPhasesStr = localStorage.getItem('dr_tg_notified_phases') || '{}';
              const currentNotifiedPhases = JSON.parse(notifiedPhasesStr);

              await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: storedUserId,
                  username: loadedInfo.username,
                  tgEnabled: currentTgEnabled,
                  tgBotToken: currentTgBotToken,
                  tgChatId: currentTgChatId,
                  studyingLessons: loadedLessons,
                  notifiedPhases: currentNotifiedPhases
                })
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync profile on startup:', err);
      }
    };

    loadAndSync();
  }, []);

  // Сохранение прогресса
  const markVerseAsCompleted = (id: string | string[]) => {
    setCompletedVerses(prev => {
      const idsToAdd = Array.isArray(id) ? id : [id];
      const next = [...prev];
      let updated = false;
      
      idsToAdd.forEach(itemId => {
        if (!next.includes(itemId)) {
          next.push(itemId);
          updated = true;
        }
      });
      
      if (!updated) return prev;
      localStorage.setItem('dr_completed_ids', JSON.stringify(next));
      return next;
    });
  };

  // Добавление / удаление из списка изучаемых (кривая забывания)
  const handleToggleStudy = (lessonIndex: number, title: string) => {
    if (selectedPart === null) return;
    setStudyingLessons(prev => {
      const exists = prev.some(s => s.lessonIndex === lessonIndex && s.part === selectedPart);
      let next: StudyingLesson[];
      
      if (exists) {
        next = prev.filter(s => !(s.lessonIndex === lessonIndex && s.part === selectedPart));
      } else {
        const [start, expiry] = getDates(0);
        const newStudy: StudyingLesson = {
          lessonIndex,
          part: selectedPart,
          title,
          phase: 0,
          startDate: start,
          expiryDate: expiry
        };
        next = [...prev, newStudy];
      }
      localStorage.setItem('dr_lessons', JSON.stringify(next));
      // Синхронизируем с сервером
      syncWithServer({ studyingLessons: next });
      return next;
    });
  };

  // Сохранение имени пользователя
  const handleSetName = (name: string) => {
    localStorage.setItem('dr_info', JSON.stringify({ username: name }));
    setUsername(name);
    syncWithServer({ username: name });
  };

  const handleNavigate = (newView: ViewState) => {
    setView(newView);
  };

  const handleSelectPart = async (part: number, overrideMode?: 'LESSONS' | 'CARDS' | 'SEARCH') => {
    const activeMode = overrideMode || mode;
    setIsLoading(true);
    setSelectedPart(part);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}fund${part}.json`);
      if (!response.ok) throw new Error('Failed to fetch fund data');
      const data = await response.json();
      setFundData(data);
      
      if (activeMode === 'CARDS') {
        // Если выбран режим Карточки, выбираем все стихи и идем в STUDY
        setCurrentLesson(0); 
        setCurrentVerseIndex(0);
        setView('STUDY');
      } else {
        setView('LESSON_LIST');
      }
    } catch (error) {
      console.error('Error loading fund data:', error);
      alert('Ошибка при загрузке данных. Пожалуйста, проверьте интернет-соединение.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectLesson = (lessonIndex: number) => {
    setCurrentLesson(lessonIndex);
    setCurrentVerseIndex(0);
    setView('STUDY');
  };

  return (
    <div id="main" className="h-full w-full bg-[#d5ccab] relative">
      {/* Индикатор загрузки */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-[#d5ccab]/60 backdrop-blur-sm"
          >
            <div className="h-[8vh] w-[8vh] animate-spin rounded-full border-4 border-[#878568] border-t-transparent" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!username ? (
          <GreetingPage key="greeting" onSetName={handleSetName} />
        ) : view === 'DASHBOARD' ? (
          <MainDashboard 
            key="dashboard" 
            username={username} 
            lessonCount={studyingLessons.length} 
            onNavigate={() => handleNavigate('FUNDAMENTALS_HOME')}
            onOpenProfile={() => setIsProfileOpen(true)}
          />
        ) : view === 'FUNDAMENTALS_HOME' ? (
          <FundamentalsHome 
            key="fund_home" 
            onSelectCategory={(cat) => {
              if (cat === 'Уроки') {
                setMode('LESSONS');
                handleNavigate('FUNDAMENTALS_PARTS');
              } else if (cat === 'Карточки') {
                setMode('CARDS');
                setView('CARDS_DASHBOARD');
              } else if (cat === 'Подбор') {
                setMode('CARDS');
                setView('MATCH_DASHBOARD');
              } else {
                setMode('LESSONS');
                handleNavigate('FUNDAMENTALS_PARTS');
              }
            }} 
            onBack={() => handleNavigate('DASHBOARD')} 
          />
        ) : view === 'FUNDAMENTALS_PARTS' ? (
          <FundamentalsParts 
            key="fundamentals" 
            onSelectPart={handleSelectPart}
            onBack={() => handleNavigate('FUNDAMENTALS_HOME')} 
          />
        ) : view === 'LESSON_LIST' && fundData && selectedPart !== null ? (
          <LessonList 
            key="lesson_list"
            data={fundData}
            onSelectLesson={handleSelectLesson}
            completedIds={completedVerses}
            studyingLessons={studyingLessons}
            onToggleStudy={handleToggleStudy}
            currentPart={selectedPart}
            onBack={() => {
              setFundData(null);
              setSelectedPart(null);
              setView('FUNDAMENTALS_PARTS');
            }}
          />
        ) : view === 'CARDS_DASHBOARD' ? (
          <CardsDashboard
            key="cards_dashboard"
            studyingLessons={studyingLessons}
            onSaveLessons={(updated) => {
              setStudyingLessons(updated);
              localStorage.setItem('dr_lessons', JSON.stringify(updated));
              syncWithServer({ studyingLessons: updated });
            }}
            onMarkCompleted={markVerseAsCompleted}
            completedIds={completedVerses}
            onBack={() => setView('FUNDAMENTALS_HOME')}
          />
        ) : view === 'MATCH_DASHBOARD' ? (
          <MatchDashboard
            key="match_dashboard"
            studyingLessons={studyingLessons}
            onSaveLessons={(updated) => {
              setStudyingLessons(updated);
              localStorage.setItem('dr_lessons', JSON.stringify(updated));
              syncWithServer({ studyingLessons: updated });
            }}
            onBack={() => setView('FUNDAMENTALS_HOME')}
          />
        ) : view === 'STUDY' && fundData && currentLesson !== null ? (
          <Study 
            key="study"
            data={fundData}
            lessonIndex={currentLesson}
            verseIndex={currentVerseIndex}
            onNext={(id) => {
              markVerseAsCompleted(id);
              setCurrentVerseIndex(prev => prev + 1);
            }}
            onPrev={() => setCurrentVerseIndex(prev => prev - 1)}
            onSelectVerse={(idx) => setCurrentVerseIndex(idx)}
            onFinish={(id) => {
              markVerseAsCompleted(id);
              setView('LESSON_LIST');
            }}
            onBack={() => setView('LESSON_LIST')}
            mode={mode}
          />
        ) : null}
      </AnimatePresence>

      {/* Профиль и настройки Telegram */}
      <AnimatePresence>
        {isProfileOpen && username && (
          <ProfileModal
            userId={userId}
            username={username}
            studyingLessons={studyingLessons}
            onSaveSettings={(newName, enabled, token, chatId) => {
              localStorage.setItem('dr_info', JSON.stringify({ username: newName }));
              localStorage.setItem('dr_tg_enabled', String(enabled));
              localStorage.setItem('dr_tg_bot_token', token);
              localStorage.setItem('dr_tg_chat_id', chatId);
              
              setUsername(newName);
              
              syncWithServer({
                username: newName,
                tgEnabled: enabled,
                tgBotToken: token,
                tgChatId: chatId
              });
            }}
            onClose={() => setIsProfileOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
