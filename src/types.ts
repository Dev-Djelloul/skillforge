export type Bindings = {
  DB: D1Database;
  AI: Ai;
};

export interface Question {
  id: number;
  category_id: number;
  difficulty: number;
  prompt: string;
  rubric: string; // JSON stringifié : string[]
}

export interface SessionItem {
  id: number;
  session_id: string;
  question_id: number;
  position: number;
  user_answer: string | null;
  score: number | null;
  feedback: string | null;
  answered_at: string | null;
}

export interface Evaluation {
  score: number; // 0-100
  feedback: string;
  points_couverts: string[];
  points_manquants: string[];
}
