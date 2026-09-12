// URL du Worker : surchargée en build via VITE_API_URL, sinon le déploiement de dev.
const API_URL = import.meta.env.VITE_API_URL ?? 'https://skillforge.djelloulabid75.workers.dev';

const CLIENT_ID_KEY = 'skillforge_client_id';

/**
 * Identifiant anonyme mais persistant (pas de compte utilisateur en V2),
 * stocké côté navigateur. Permet au backend de suivre les scores par
 * catégorie d'une session à l'autre et d'adapter la sélection des questions.
 */
function getClientId(): string {
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

export function startSession(): Promise<StartSessionResponse> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ client_id: getClientId() }),
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

export function completeSession(sessionId: string): Promise<CompleteSessionResponse> {
  return request(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
}

export function getHint(questionId: number): Promise<{ hint: string | null }> {
  return request(`/api/questions/${questionId}/hint`);
}
