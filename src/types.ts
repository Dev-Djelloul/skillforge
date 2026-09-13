export type Bindings = {
  DB: D1Database;
  AI: Ai;
  QUESTIONS_INDEX: VectorizeIndex;
  REINDEX_SECRET: string;
  OPENROUTER_API_KEY: string;
};

export interface Question {
  id: number;
  category_id: number;
  difficulty: number;
  prompt: string;
  rubric: string; // JSON stringifié : string[]
  hint: string | null;
  resources: string | null; // JSON stringifié : Resource[]
  glossary?: string | null; // JSON stringifié : GlossaryTerm[]
}

export interface Resource {
  type: 'article' | 'video' | 'w3schools';
  title: string;
  url: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
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
  follow_up_question: string | null;
  follow_up_answer: string | null;
  follow_up_feedback: string | null;
  criteria: string | null; // JSON stringifié : EvaluationCriterion[]
}

export interface EvaluationCriterion {
  text: string;
  covered: boolean;
}

export interface Evaluation {
  score: number; // 0-100
  feedback: string;
  criteria: EvaluationCriterion[];
  points_manquants: string[];
  follow_up_question: string | null;
}
