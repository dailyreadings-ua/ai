import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection,
  updateDoc
} from "firebase/firestore";

// Read Firebase config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig = {};
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.error("Failed to read firebase-applet-config.json", err);
}

// Initialize Firebase client SDK in Node
const firebaseApp = initializeApp(firebaseConfig);
const db = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore(firebaseApp, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(firebaseApp);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Sync user profile and progress
  app.post("/api/sync", async (req, res) => {
    try {
      const { userId, username, tgEnabled, tgBotToken, tgChatId, studyingLessons, notifiedPhases } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      const existingData = userSnap.exists() ? userSnap.data() : {};

      // Merge data
      const updateData = {
        userId,
        username: username || existingData.username || "",
        tgEnabled: tgEnabled !== undefined ? tgEnabled : (existingData.tgEnabled ?? false),
        tgBotToken: tgBotToken !== undefined ? tgBotToken : (existingData.tgBotToken || ""),
        tgChatId: tgChatId !== undefined ? tgChatId : (existingData.tgChatId || ""),
        studyingLessons: studyingLessons || existingData.studyingLessons || [],
        notifiedPhases: notifiedPhases || existingData.notifiedPhases || {},
        updatedAt: new Date().toISOString()
      };

      await setDoc(userRef, updateData, { merge: true });
      res.json({ success: true, data: updateData });
    } catch (error: any) {
      console.error("Error in /api/sync:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // API Route: Fetch user profile
  app.get("/api/profile/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        res.json({ success: true, data: userSnap.data() });
      } else {
        res.json({ success: false, message: "User not found" });
      }
    } catch (error: any) {
      console.error("Error in /api/profile:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // API Route: Disconnect Telegram bot
  app.post("/api/profile/:userId/disconnect", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const userRef = doc(db, "users", userId);
      await setDoc(userRef, {
        tgChatId: "",
        tgEnabled: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error in /api/profile/disconnect:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // API Route: Fetch app configuration for clients and debug webhook status
  app.get("/api/config", async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.APP_URL;
    let webhookStatus = "Unknown";
    let telegramWebhookInfo = null;

    if (token) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const data = await response.json();
        if (response.ok && data.ok) {
          telegramWebhookInfo = data.result;
          webhookStatus = data.result.url ? `Registered: ${data.result.url}` : "Not registered";
        } else {
          webhookStatus = `Failed to get webhook info: ${JSON.stringify(data)}`;
        }
      } catch (err: any) {
        webhookStatus = `Error calling Telegram: ${err.message || err}`;
      }
    } else {
      webhookStatus = "Missing TELEGRAM_BOT_TOKEN";
    }

    res.json({
      hasGlobalBot: !!token,
      globalBotUsername: process.env.TELEGRAM_BOT_USERNAME || "",
      webhookStatus,
      telegramWebhookInfo,
      appUrl: appUrl || "Not defined"
    });
  });

  // API Route: Telegram Webhook for automatic bot binding and ID sending
  app.post("/api/telegram/webhook", async (req, res) => {
    const logFile = path.join(process.cwd(), "server_logs.txt");
    const log = (msg: string) => {
      console.log(msg);
      fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
    };

    try {
      log(`[Webhook] Received webhook request: ${JSON.stringify(req.body)}`);
      const { message } = req.body;
      if (!message || !message.text) {
        return res.sendStatus(200);
      }

      const chatId = message.chat.id.toString();
      const text = message.text.trim();

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        log(`[Webhook] Start command parts: ${JSON.stringify(parts)}`);
        if (parts.length > 1) {
          const userId = parts[1].trim();
          log(`[Webhook] Binding userId: ${userId} to chatId: ${chatId}`);
          
          // Fetch user doc from Firestore
          const userRef = doc(db, "users", userId);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            log(`[Webhook] Found user: ${userData.username || "unknown"}. Updating Firestore.`);
            
            // Save Telegram ID and automatically enable notifications
            await setDoc(userRef, {
              tgChatId: chatId,
              tgEnabled: true,
              updatedAt: new Date().toISOString()
            }, { merge: true });

            const welcomeMsg = `🎉 <b>Привет, ${userData.username || "ученик"}!</b>\n\nТвой аккаунт успешно привязан к приложению! 🥳\n\nТеперь фоновая служба будет автоматически присылать тебе напоминания о том, что очередной урок пора повторить по кривой забывания.\n\nЖелаем тебе отличных результатов! 📚🎓`;

            const activeBotToken = process.env.TELEGRAM_BOT_TOKEN;
            await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: welcomeMsg,
                parse_mode: 'HTML',
              }),
            });
            log("[Webhook] Sent welcome message to Telegram successfully.");
          } else {
            log(`[Webhook] User with ID ${userId} not found in Firestore.`);
            const replyMsg = `❌ <b>Ошибка привязки</b>\n\nПрофиль не найден. Пожалуйста, откройте настройки профиля в приложении и нажмите на ссылку подключения бота заново!`;
            const activeBotToken = process.env.TELEGRAM_BOT_TOKEN;
            await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: replyMsg,
                parse_mode: 'HTML',
              }),
            });
          }
        } else {
          log(`[Webhook] Direct start (no args) from chatId: ${chatId}`);
          // Direct start without arguments
          const replyMsg = `👋 <b>Привет!</b>\n\nЯ бот для напоминаний о повторении уроков по кривой забывания.\n\nТвой Telegram ID (Chat ID): <code>${chatId}</code>\n\nТы можешь скопировать этот ID и вставить его в настройках своего профиля в приложении, либо просто нажать кнопку <b>«Подключить в 1 клик»</b> прямо в приложении для автоматической привязки!`;
          const activeBotToken = process.env.TELEGRAM_BOT_TOKEN;
          await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyMsg,
              parse_mode: 'HTML',
            }),
          });
        }
      }

      res.sendStatus(200);
    } catch (err: any) {
      log(`[Webhook ERROR] ${err.message || err}`);
      res.sendStatus(200); // Always send 200 to Telegram
    }
  });

  // API Route: Send a test Telegram message
  app.post("/api/telegram/test", async (req, res) => {
    try {
      const { username, tgBotToken, tgChatId } = req.body;
      const activeBotToken = tgBotToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!activeBotToken) {
        return res.status(400).json({ error: "Токен бота не настроен. Пожалуйста, укажите токен или настройте его в .env" });
      }
      if (!tgChatId) {
        return res.status(400).json({ error: "Укажите ваш Chat ID!" });
      }

      const messageText = `🧪 <b>Привет, ${username || "ученик"}!</b>\n\nЭто тестовое сообщение от твоего бота.\nПодключение настроено успешно! Теперь ты будешь получать напоминания о повторении.`;

      const url = `https://api.telegram.org/bot${activeBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        return res.status(400).json({ error: resData.description || "Не удалось отправить сообщение. Проверьте токен и ID." });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error in /api/telegram/test:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // API Route: Send manual reminder
  app.post("/api/telegram/remind", async (req, res) => {
    try {
      const { username, tgBotToken, tgChatId, studyingLessons } = req.body;
      const activeBotToken = tgBotToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!activeBotToken) {
        return res.status(400).json({ error: "Токен бота не настроен." });
      }
      if (!tgChatId) {
        return res.status(400).json({ error: "Укажите ваш Chat ID!" });
      }

      // Check due lessons from parameters
      const now = Date.now();
      const dueLessons = (studyingLessons || []).filter((lesson: any) => {
        // If lesson status is active or expired, we send it
        const start = new Date(lesson.startDate).getTime();
        return now >= start;
      });

      let messageText = "";
      if (dueLessons.length === 0) {
        messageText = `📍 <b>Отличные новости, ${username || "ученик"}!</b>\n\nВсе ваши уроки полностью усвоены на текущий момент. Новых этапов для повторения пока нет. Так держать!`;
      } else {
        const listText = dueLessons
          .map((l: any, idx: number) => `${idx + 1}. <b>Часть ${l.part}</b>, урок ${l.lessonIndex + 1}: <i>«${l.title}»</i> (Фаза ${l.phase + 1})`)
          .join('\n');

        messageText = `📚 <b>Привет, ${username || "ученик"}!</b>\n\nПора закрепить пройденный материал. Наступило время повторения для следующих уроков:\n\n${listText}\n\n👉 Зайдите в приложение, чтобы пройти карточки интервального повторения!`;
      }

      const url = `https://api.telegram.org/bot${activeBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        return res.status(400).json({ error: resData.description || "Не удалось отправить сообщение." });
      }

      res.json({ success: true, sentCount: dueLessons.length });
    } catch (error: any) {
      console.error("Error in /api/telegram/remind:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // Background check interval (every 60 seconds)
  setInterval(async () => {
    try {
      // Fetch all users
      const usersCol = collection(db, "users");
      const usersSnap = await getDocs(usersCol);

      const now = Date.now();

      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const { userId, username, tgEnabled, tgBotToken, tgChatId, studyingLessons, notifiedPhases = {} } = userData;

        const activeBotToken = tgBotToken || process.env.TELEGRAM_BOT_TOKEN;

        if (!tgEnabled || !activeBotToken || !tgChatId || !studyingLessons || studyingLessons.length === 0) {
          continue;
        }

        // Find due lessons
        const dueLessons = studyingLessons.filter((lesson: any) => {
          const start = new Date(lesson.startDate).getTime();
          return now >= start;
        });

        if (dueLessons.length === 0) {
          continue;
        }

        // Filter those we haven't notified for their current phase yet
        const newlyDueLessons = dueLessons.filter((lesson: any) => {
          const key = `${lesson.part}_${lesson.lessonIndex}`;
          const lastNotifiedPhase = notifiedPhases[key];
          return lastNotifiedPhase === undefined || lastNotifiedPhase < lesson.phase;
        });

        if (newlyDueLessons.length === 0) {
          continue;
        }

        // Format and send message
        const listText = newlyDueLessons
          .map((l: any, idx: number) => `${idx + 1}. <b>Часть ${l.part}</b>, урок ${l.lessonIndex + 1}: <i>«${l.title}»</i> (Фаза ${l.phase + 1})`)
          .join('\n');

        const messageText = `📚 <b>Привет, ${username || "ученик"}!</b>\n\nПоявились новые уроки для повторения по кривой забывания (отправлено фоновой службой):\n\n${listText}\n\n👉 Зайдите в приложение, чтобы закрепить материал!`;

        try {
          const url = `https://api.telegram.org/bot${activeBotToken}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              text: messageText,
              parse_mode: 'HTML',
            }),
          });

          const resData = await response.json();
          if (response.ok && resData.ok) {
            console.log(`[Background Notify] Notification sent successfully to user ${userId} (${username})`);
            
            // Update notified phases in firestore
            const updatedNotifiedPhases = { ...notifiedPhases };
            newlyDueLessons.forEach((l: any) => {
              const key = `${l.part}_${l.lessonIndex}`;
              updatedNotifiedPhases[key] = l.phase;
            });

            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, { notifiedPhases: updatedNotifiedPhases });
          } else {
            console.error(`[Background Notify] Failed to send Telegram notification to user ${userId}:`, resData);
          }
        } catch (err) {
          console.error(`[Background Notify] Error sending Telegram message for user ${userId}:`, err);
        }
      }
    } catch (err) {
      console.error("[Background Notify Worker] Error in background interval checker:", err);
    }
  }, 60000); // 60 seconds

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    const logFile = path.join(process.cwd(), "server_logs.txt");
    const log = (msg: string) => {
      console.log(msg);
      fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
    };

    log(`Server running on http://localhost:${PORT}`);
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    log(`TELEGRAM_BOT_TOKEN: ${token ? "Present" : "Missing"}`);

    if (token) {
      // 1. Delete webhook to ensure getUpdates is allowed
      try {
        const deleteRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
        const deleteData: any = await deleteRes.json();
        log(`[Telegram Polling] Webhook deleted successfully: ${JSON.stringify(deleteData)}`);
      } catch (err: any) {
        log(`[Telegram Polling] Error deleting webhook: ${err.message || err}`);
      }

      // 2. Start Polling Loop
      log("[Telegram Polling] Starting background polling loop (every 2 seconds)...");
      let tgUpdateOffset = 0;

      setInterval(async () => {
        try {
          const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${tgUpdateOffset}&limit=10&timeout=0`;
          const response = await fetch(url);
          if (!response.ok) return;

          const data: any = await response.json();
          if (data.ok && data.result && data.result.length > 0) {
            for (const update of data.result) {
              tgUpdateOffset = update.update_id + 1;

              const message = update.message;
              if (!message || !message.text) continue;

              const chatId = message.chat.id.toString();
              const text = message.text.trim();

              log(`[Polling] Received message from chatId ${chatId}: "${text}"`);

              if (text.startsWith("/start")) {
                const parts = text.split(" ");
                if (parts.length > 1) {
                  const userId = parts[1].trim();
                  log(`[Polling] Start command with payload. Binding userId: ${userId} to chatId: ${chatId}`);

                  // Fetch user doc from Firestore
                  const userRef = doc(db, "users", userId);
                  const userSnap = await getDoc(userRef);

                  if (userSnap.exists()) {
                    const userData = userSnap.data();
                    log(`[Polling] User found: ${userData.username || "student"}. Saving Telegram details.`);

                    // Save Telegram ID and enable notifications
                    await setDoc(userRef, {
                      tgChatId: chatId,
                      tgEnabled: true,
                      updatedAt: new Date().toISOString()
                    }, { merge: true });

                    const welcomeMsg = `🎉 <b>Привет, ${userData.username || "ученик"}!</b>\n\nТвой аккаунт успешно привязан к приложению! 🥳\n\nТеперь фоновая служба будет автоматически присылать тебе напоминания о том, что очередной урок пора повторить по кривой забывания.\n\nЖелаем тебе отличных результатов! 📚🎓`;

                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: chatId,
                        text: welcomeMsg,
                        parse_mode: 'HTML',
                      }),
                    });
                    log(`[Polling] Sent success message to chatId: ${chatId}`);
                  } else {
                    log(`[Polling] User doc with ID ${userId} not found in Firestore.`);
                    const replyMsg = `❌ <b>Ошибка привязки</b>\n\nПрофиль не найден. Пожалуйста, откройте настройки профиля в приложении и нажмите на ссылку подключения бота заново!`;
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: chatId,
                        text: replyMsg,
                        parse_mode: 'HTML',
                      }),
                    });
                  }
                } else {
                  log(`[Polling] Direct start command (no args) from chatId: ${chatId}`);
                  const replyMsg = `👋 <b>Привет!</b>\n\nЯ бот для напоминаний о повторении уроков по кривой забывания.\n\nТвой Telegram ID (Chat ID): <code>${chatId}</code>\n\nТы можешь скопировать этот ID и вставить его в настройках своего профиля в приложении, либо просто нажать кнопку <b>«Подключить в 1 клик»</b> прямо в приложении для автоматической привязки!`;
                  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: chatId,
                      text: replyMsg,
                      parse_mode: 'HTML',
                    }),
                  });
                }
              }
            }
          }
        } catch (err: any) {
          log(`[Polling Loop Error] ${err.message || err}`);
        }
      }, 2000);

    } else {
      log("[Telegram Polling] Skipped background polling (missing TELEGRAM_BOT_TOKEN).");
    }
  });
}

startServer();
