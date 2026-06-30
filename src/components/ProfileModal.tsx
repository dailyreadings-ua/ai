import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Check, AlertCircle, ExternalLink, Info, Bell, BellOff, User, Save, Sparkles } from 'lucide-react';
import { StudyingLesson } from '../types.ts';

interface ProfileModalProps {
  userId: string;
  username: string;
  studyingLessons: StudyingLesson[];
  onSaveSettings: (name: string, enabled: boolean, token: string, chatId: string) => void;
  onClose: () => void;
}

export function ProfileModal({ userId, username, studyingLessons, onSaveSettings, onClose }: ProfileModalProps) {
  const [nameInput, setNameInput] = useState(username);
  
  // Telegram settings states loaded from localStorage
  const [tgEnabled, setTgEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dr_tg_enabled') === 'true';
  });
  const [tgChatId, setTgChatId] = useState<string>(() => {
    return localStorage.getItem('dr_tg_chat_id') || '';
  });

  const [hasGlobalBot, setHasGlobalBot] = useState(false);
  const [globalBotUsername, setGlobalBotUsername] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Fetch bot config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.hasGlobalBot) {
          setHasGlobalBot(true);
          setGlobalBotUsername(data.globalBotUsername);
        }
      })
      .catch(err => console.error("Error fetching app config:", err));
  }, []);

  // Poll server to check if Telegram connection was established via Webhook
  useEffect(() => {
    if (!userId || tgChatId) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/profile/${userId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (active && data.success && data.data && data.data.tgChatId) {
          const remoteChatId = data.data.tgChatId;
          setTgChatId(remoteChatId);
          setTgEnabled(true);
          
          // Save locally
          localStorage.setItem('dr_tg_chat_id', remoteChatId);
          localStorage.setItem('dr_tg_enabled', 'true');
          
          showStatus('Ура! Бот успешно подключен и привязан в 1 клик! 🎉', 'success');
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Error polling user profile:", err);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [userId, tgChatId]);

  const showStatus = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      showStatus('Пожалуйста, введите имя!', 'error');
      return;
    }
    if (tgEnabled && !tgChatId.trim()) {
      showStatus('Пожалуйста, подключите Telegram или выключите уведомления.', 'error');
      return;
    }

    // Save and update
    localStorage.setItem('dr_tg_enabled', String(tgEnabled));
    localStorage.setItem('dr_tg_chat_id', tgChatId.trim());
    
    onSaveSettings(nameInput.trim(), tgEnabled, '', tgChatId.trim());
    showStatus('Все изменения сохранены!', 'success');
    
    // Close modal after successful save after a tiny delay
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleToggleBell = () => {
    const nextVal = !tgEnabled;
    setTgEnabled(nextVal);
    if (nextVal && !tgChatId) {
      showStatus('Уведомления включены! Подключите Telegram бота ниже.', 'info');
    } else {
      showStatus(
        nextVal 
          ? 'Уведомления успешно включены!' 
          : 'Уведомления временно приостановлены.', 
        'info'
      );
    }
  };

  // Test connection handler using the secure server-side proxy
  const handleTestConnection = async () => {
    if (!tgChatId.trim()) {
      showStatus('Пожалуйста, сначала привяжите Telegram бота!', 'error');
      return;
    }

    setIsSending(true);
    setStatusMessage({ text: 'Отправка тестового сообщения...', type: 'info' });
    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: nameInput.trim(),
          tgBotToken: '', // Server uses TELEGRAM_BOT_TOKEN from .env automatically
          tgChatId: tgChatId.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при отправке.');
      }
      showStatus('Тестовое сообщение отправлено! Проверьте ваш Telegram.', 'success');
    } catch (error: any) {
      showStatus(`Ошибка: ${error.message || error}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Send status update manually using secure server-side proxy
  const handleSendManualReminder = async () => {
    if (!tgChatId.trim()) {
      showStatus('Пожалуйста, сначала привяжите Telegram бота!', 'error');
      return;
    }

    setIsSending(true);
    setStatusMessage({ text: 'Анализ интервалов и отправка...', type: 'info' });
    try {
      const response = await fetch('/api/telegram/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: nameInput.trim(),
          tgBotToken: '',
          tgChatId: tgChatId.trim(),
          studyingLessons: studyingLessons
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при отправке.');
      }
      showStatus(
        data.sentCount === 0 
          ? 'Проверка пройдена: нет уроков для повторения.' 
          : `Успешно отправлено! Повторений: ${data.sentCount}`, 
         'success'
      );
    } catch (error: any) {
      showStatus(`Ошибка отправки: ${error.message || error}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSending(true);
    setStatusMessage({ text: 'Отключение Telegram бота...', type: 'info' });
    try {
      const response = await fetch(`/api/profile/${userId}/disconnect`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Не удалось отключить бота на сервере');
      }
      
      // Clear client state
      setTgChatId('');
      localStorage.setItem('dr_tg_chat_id', '');
      localStorage.setItem('dr_tg_enabled', 'false');
      setTgEnabled(false);
      
      showStatus('Бот отключен. Теперь можно подключить другой аккаунт!', 'success');
    } catch (error: any) {
      showStatus(`Ошибка при отключении: ${error.message || error}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Determine bot username to link to
  const botToLink = globalBotUsername || "userinfobot";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#505143]/40 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative flex h-[82vh] w-full max-w-md flex-col rounded-3xl bg-[#d5ccab] p-6 shadow-2xl overflow-hidden border border-[#878568]/20"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#878568]/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#505143] text-[#d5ccab]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[2.4vh] font-semibold text-[#505143]">Профиль ученика</h2>
              <p className="text-[1.4vh] text-[#878568]">Персонализация и напоминания</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/40 text-[#505143] hover:bg-white/70 active:scale-95 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1.5 scrollbar-thin">
          {/* Status Message Overlay */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-3.5 rounded-2xl text-[1.5vh] flex items-start gap-3 shadow-md border ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : statusMessage.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
                ) : statusMessage.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                )}
                <span className="leading-tight">{statusMessage.text}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSaveAll} className="space-y-5">
            {/* Block 1: Edit Name */}
            <div className="bg-white/40 rounded-2xl p-4 border border-[#878568]/5 space-y-2">
              <label className="text-[1.5vh] font-semibold text-[#505143]">Имя ученика</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ваше имя"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#878568]/15 bg-white/70 text-[1.7vh] text-[#505143] placeholder:text-[#a3a289] outline-none focus:border-[#505143] transition-all"
              />
            </div>

            {/* Block 2: Telegram Settings */}
            <div className="bg-white/40 rounded-2xl p-4 border border-[#878568]/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[1.5vh] font-semibold text-[#505143]">Уведомления в Telegram</span>
                  <span className="text-[1.25vh] text-[#878568]">Повторение по интервалам</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleBell}
                  className={`relative flex items-center justify-center rounded-xl p-2.5 transition-all active:scale-95 ${
                    tgEnabled 
                      ? 'bg-emerald-100 text-emerald-800 font-semibold' 
                      : 'bg-[#878568]/10 text-[#878568]'
                  }`}
                >
                  {tgEnabled ? (
                    <span className="flex items-center gap-1.5 text-[1.4vh]">
                      <Bell className="h-4 w-4" /> Включены
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[1.4vh]">
                      <BellOff className="h-4 w-4" /> Выключены
                    </span>
                  )}
                </button>
              </div>

              <AnimatePresence>
                {tgEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3.5 overflow-hidden pt-1"
                  >
                    {tgChatId ? (
                      /* Success state: already linked */
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-[1.45vh] text-emerald-800 space-y-1.5 flex flex-col items-center text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-1">
                          <Check className="h-5 w-5 animate-pulse" />
                        </div>
                        <span className="font-bold text-[1.6vh]">Бот успешно подключен! 🎉</span>
                        <p className="text-[1.3vh] text-emerald-700 max-w-xs leading-relaxed">
                          Бот привязан к вашему аккаунту. Вы будете получать моментальные сообщения на телефон, когда уроки созреют для повторения!
                        </p>
                        
                        {/* Validation actions row */}
                        <div className="grid grid-cols-2 gap-2 pt-2.5 w-full">
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={handleTestConnection}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100/50 active:scale-98 border border-emerald-200 rounded-xl text-[1.3vh] text-emerald-800 font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
                            title="Проверить доставку сообщений ботом"
                          >
                            <Send className="h-3.5 w-3.5" /> Проверить связь
                          </button>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={handleSendManualReminder}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-[1.3vh] font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
                            title="Получить карточки к повторению прямо сейчас"
                          >
                            <Check className="h-3.5 w-3.5" /> Напомнить сейчас
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isSending}
                          onClick={handleDisconnect}
                          className="text-[1.25vh] text-red-600 underline hover:text-red-700 mt-3.5 cursor-pointer font-medium transition-all disabled:opacity-50"
                        >
                          Привязать другой аккаунт / Сбросить
                        </button>
                      </div>
                    ) : (
                      /* Invitation state: click to connect in 1 click */
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-[1.4vh] text-emerald-800 space-y-2 flex flex-col items-stretch">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Подключение в 1 клик</span>
                        </div>
                        <p className="leading-relaxed text-[1.35vh] text-emerald-700">
                          Нажмите зелёную кнопку ниже, чтобы открыть Telegram, и затем нажмите кнопку <b>Запустить (Старт)</b> в боте. Привязка произойдёт полностью автоматически!
                        </p>
                        
                        <a
                          href={`https://t.me/${botToLink}?start=${userId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-[1.5vh] font-bold transition-all shadow-md text-center"
                        >
                          Запустить бота @{botToLink}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>

                        <div className="flex items-center justify-center gap-2 text-[1.25vh] text-[#878568] pt-1">
                          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                          <span>Ожидаем нажатия кнопки «Старт» в боте...</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Block 3: Informational note */}
            <div className="bg-[#878568]/10 rounded-2xl p-3.5 text-[1.35vh] text-[#505143]/95 leading-relaxed space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-[#505143]">
                <Info className="h-3.5 w-3.5" />
                <span>Автоматический фоновый контроль</span>
              </div>
              <p>
                Сервер непрерывно проверяет вашу кривую забывания. Как только уроки потребуют повторения, бот пришлет вежливое напоминание прямо в ваш Telegram-чат!
              </p>
            </div>

            {/* Block 4: Unified Save Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#505143] hover:bg-[#3f4035] text-[#d5ccab] rounded-xl text-[1.6vh] font-bold transition-all shadow-md cursor-pointer active:scale-[0.99]"
            >
              <Save className="h-4 w-4" /> Сохранить профиль
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
