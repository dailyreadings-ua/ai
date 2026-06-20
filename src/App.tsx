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
import { getDates } from './constants.ts';

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

  // Шаг 1: Загрузка данных при старте (аналог load() в твоем коде)
  useEffect(() => {
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

    setIsLoading(false);
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
      return next;
    });
  };

  // Сохранение имени пользователя
  const handleSetName = (name: string) => {
    localStorage.setItem('dr_info', JSON.stringify({ username: name }));
    setUsername(name);
  };

  const handleNavigate = (newView: ViewState) => {
    setView(newView);
  };

  const handleSelectPart = async (part: number, overrideMode?: 'LESSONS' | 'CARDS' | 'SEARCH') => {
    const activeMode = overrideMode || mode;
    setIsLoading(true);
    setSelectedPart(part);
    try {
      const response = await fetch(`/fund${part}.json`);
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
            }}
            onMarkCompleted={markVerseAsCompleted}
            completedIds={completedVerses}
            onBack={() => setView('FUNDAMENTALS_HOME')}
          />
        ) : view === 'MATCH_DASHBOARD' ? (
          <MatchDashboard
            key="match_dashboard"
            studyingLessons={studyingLessons}
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
    </div>
  );
}
