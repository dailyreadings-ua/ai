export interface Verse {
  text: string;
  book: string;
  chapter: string;
  verse: string;
  id: string;
  reason: string[];
}

export interface Lesson {
  chapter: number;
  texts: number[];
}

export interface StudyingLesson {
  lessonIndex: number;
  part: number;
  title: string;
  phase: number;
  startDate: string;
  expiryDate: string;
}

export interface CardGameSettings {
  what: 'both_address_first' | 'only_address_by_text' | 'both_text_first' | 'only_text_by_address';
  retryMode: 'until_learned' | 'twice' | 'once' | 'none';
  countMode: 'all' | 'limit' | 'bad_only';
  maxCardsLimit: number | '';
}

// Структура твоих JSON файлов
export type FundData = [Verse[][] | Verse[], string[], Lesson[]];

export interface UserData {
  username: string | null;
}

export type ViewState = 'DASHBOARD' | 'FUNDAMENTALS_HOME' | 'FUNDAMENTALS_PARTS' | 'LESSON_LIST' | 'STUDY' | 'CARDS_DASHBOARD' | 'MATCH_DASHBOARD';

export interface LessonProgress {
  book: number;
  chapter: number;
  verse: number;
  text: number;
  expl: number;
}

export interface PhaseInfo {
  phase: number;
}

export type PercentageData = (LessonProgress | PhaseInfo)[];

export interface AppState {
  view: ViewState;
  selectedPart: number | null; // 1 или 2
}
