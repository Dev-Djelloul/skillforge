// URL du Worker : surchargée en build via VITE_API_URL, sinon le déploiement de dev.
const API_URL = import.meta.env.VITE_API_URL ?? 'https://skillforge.djelloulabid75.workers.dev';

const CLIENT_ID_KEY = 'skillforge_client_id';

/**
 * Identifiant anonyme mais persistant (pas de compte utilisateur en V2),
 * stocké côté navigateur. Permet au backend de suivre les scores par
 * catégorie d'une session à l'autre et d'adapter la sélection des questions.
 */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, generated);
    return generated;
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) : la
    // session reste anonyme et non adaptative pour cette visite.
    return crypto.randomUUID();
  }
}

export interface SessionQuestion {
  position: number;
  question_id: number;
  prompt: string;
  difficulty: number;
  category_slug: string;
  is_new: boolean;
}

export interface StartSessionResponse {
  session_id: string;
  questions: SessionQuestion[];
}

export interface Resource {
  type: 'article' | 'video';
  title: string;
  url: string;
}

export interface Evaluation {
  score: number;
  feedback: string;
  points_couverts: string[];
  points_manquants: string[];
  follow_up_question: string | null;
}

export interface AnswerResponse {
  evaluation: Evaluation;
  resources: Resource[];
}

export interface CategoryBreakdown {
  category: string;
  avg_score: number;
  attempts: number;
}

export interface CompleteSessionResponse {
  breakdown: CategoryBreakdown[];
  revision_plan: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SessionSetup {
  categorySlugs: string[]; // vide = toutes les familles
  difficulty: number | null; // null = adaptatif
  full?: boolean; // mode "entretien complet" : 12 questions, toutes familles
  context?: string; // offre d'emploi ou CV collé, pour des questions personnalisées
}

export function startSession(setup?: SessionSetup): Promise<StartSessionResponse> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      client_id: getClientId(),
      category_slugs: setup && setup.categorySlugs.length > 0 ? setup.categorySlugs : undefined,
      difficulty: setup?.difficulty ?? undefined,
      full: setup?.full ?? undefined,
      context: setup?.context && setup.context.trim() ? setup.context.trim() : undefined,
    }),
  });
}

export function submitAnswer(
  sessionId: string,
  questionId: number,
  answer: string
): Promise<AnswerResponse> {
  return request(`/api/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ question_id: questionId, answer }),
  });
}

export function submitFollowUp(
  sessionId: string,
  questionId: number,
  followUpQuestion: string,
  answer: string
): Promise<{ feedback: string }> {
  return request(`/api/sessions/${sessionId}/followup`, {
    method: 'POST',
    body: JSON.stringify({ question_id: questionId, follow_up_question: followUpQuestion, answer }),
  });
}

export function completeSession(sessionId: string): Promise<CompleteSessionResponse> {
  return request(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
}

export function getHint(questionId: number): Promise<{ hint: string | null }> {
  return request(`/api/questions/${questionId}/hint`);
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export function getGlossary(questionId: number): Promise<{ terms: GlossaryTerm[] }> {
  return request(`/api/questions/${questionId}/glossary`);
}

export interface ProgressCategory {
  category_slug: string;
  category_label: string;
  avg_score: number;
  attempts: number;
}

export interface ProgressResponse {
  client_id: string;
  categories: ProgressCategory[];
  total_sessions: number;
  sessions_last_30_days: number;
}

export function getProgress(): Promise<ProgressResponse> {
  return request(`/api/progress/${getClientId()}`);
}

export interface HistoryEntry {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  avg_score: number | null;
  answered_count: number;
}

export interface HistoryResponse {
  client_id: string;
  sessions: HistoryEntry[];
}

export function getHistory(): Promise<HistoryResponse> {
  return request(`/api/history/${getClientId()}`);
}

export interface TimelinePoint {
  started_at: string;
  category_slug: string;
  category_label: string;
  avg_score: number;
}

export interface TimelineResponse {
  client_id: string;
  points: TimelinePoint[];
}

export function getProgressTimeline(): Promise<TimelineResponse> {
  return request(`/api/progress/${getClientId()}/timeline`);
}

export interface SessionDetailItem {
  id: number;
  session_id: string;
  question_id: number;
  position: number;
  user_answer: string | null;
  score: number | null;
  feedback: string | null;
  answered_at: string | null;
  prompt: string;
  difficulty: number;
  hint: string | null;
  resources: Resource[];
}

export interface SessionDetailResponse {
  session: { id: string; status: string; started_at: string; finished_at: string | null };
  items: SessionDetailItem[];
}

export interface ResumableSession {
  session_id: string;
  questions: SessionQuestion[];
  answered_count: number;
}

export function getResumableSession(): Promise<{ session: ResumableSession | null }> {
  return request(`/api/sessions/resumable/${getClientId()}`);
}

export function getSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return request(`/api/sessions/${sessionId}`);
}

export function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  return request(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
    body: JSON.stringify({ client_id: getClientId() }),
  });
}
