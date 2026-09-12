import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Question, Resource, SessionItem } from './types';
import { evaluateAnswer, evaluateFollowUp } from './lib/evaluator';
import { generateRevisionPlan, type CategoryBreakdown } from './lib/planner';
import { selectAdaptiveQuestions, type CategoryRow } from './lib/adaptive';
import { embedText, questionEmbeddingText } from './lib/embeddings';

const app = new Hono<{ Bindings: Bindings }>();

// Le frontend (Cloudflare Pages) est servi sur un domaine distinct du Worker.
app.use('/api/*', cors());

// Sans ce handler, une exception non attrapée (ex: erreur Workers AI) renvoie
// un 500 sans corps exploitable côté client — impossible à diagnostiquer.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'Erreur interne du serveur' }, 500);
});

app.get('/', (c) => c.json({ name: 'SkillForge API', status: 'ok' }));

// Démarre une nouvelle session : sélection adaptative des questions (V2).
// Un client_id optionnel (généré et conservé côté navigateur, pas de compte
// utilisateur en V2) permet de croiser l'historique de scores par catégorie
// (D1) et de retrouver des questions sémantiquement proches des points
// faibles (Vectorize). Sans historique, on retombe sur un tirage équilibré
// et aléatoire entre catégories, comme en V1.
app.post('/api/sessions', async (c) => {
  const body = await c.req
    .json<{ client_id?: string; category_slugs?: string[]; difficulty?: number }>()
    .catch(() => ({}) as { client_id?: string; category_slugs?: string[]; difficulty?: number });
  const userId = body.client_id ?? null;
  const sessionId = crypto.randomUUID();

  const allCategories = await c.env.DB.prepare(`SELECT id, slug, label FROM categories`).all<CategoryRow>();

  if (!allCategories.results.length) {
    return c.json({ error: 'Aucune catégorie disponible — la base a-t-elle été seedée ?' }, 500);
  }

  // Parcours choisi par le candidat (V2) : restreint aux familles cochées,
  // repli sur toutes les familles si rien n'est précisé ou si le filtre
  // ne correspond à aucune catégorie connue.
  const categories =
    body.category_slugs && body.category_slugs.length > 0
      ? allCategories.results.filter((cat) => body.category_slugs!.includes(cat.slug))
      : allCategories.results;
  const selectedCategories = categories.length > 0 ? categories : allCategories.results;

  const forcedDifficulty =
    body.difficulty && body.difficulty >= 1 && body.difficulty <= 3 ? body.difficulty : undefined;

  const questionIds = await selectAdaptiveQuestions(c.env, selectedCategories, userId, forcedDifficulty);

  if (!questionIds.length) {
    return c.json({ error: 'Aucune question disponible — la base a-t-elle été seedée ?' }, 500);
  }

  const placeholders = questionIds.map(() => '?').join(',');
  const questions = await c.env.DB.prepare(
    `SELECT q.id, q.category_id, q.difficulty, q.prompt, q.rubric, cat.slug AS category_slug
     FROM questions q
     JOIN categories cat ON cat.id = q.category_id
     WHERE q.id IN (${placeholders})`
  )
    .bind(...questionIds)
    .all<Question & { category_slug: string }>();

  // L'ordre du SELECT ... IN (...) n'est pas garanti : on réordonne selon
  // l'ordre de sélection adaptative (qui reflète le poids catégorie/difficulté).
  const byId = new Map(questions.results.map((q) => [q.id, q]));
  const orderedQuestions = questionIds.map((id) => byId.get(id)!).filter(Boolean);

  await c.env.DB.prepare(`INSERT INTO sessions (id, user_id, status) VALUES (?, ?, 'in_progress')`)
    .bind(sessionId, userId)
    .run();

  const inserts = orderedQuestions.map((q, i) =>
    c.env.DB.prepare(
      `INSERT INTO session_items (session_id, question_id, position) VALUES (?, ?, ?)`
    ).bind(sessionId, q.id, i)
  );
  await c.env.DB.batch(inserts);

  return c.json({
    session_id: sessionId,
    questions: orderedQuestions.map((q, i) => ({
      position: i,
      question_id: q.id,
      prompt: q.prompt,
      difficulty: q.difficulty,
      category_slug: q.category_slug,
    })),
  });
});

// Révèle l'indice d'une question, à la demande (jamais renvoyé avec la liste
// de questions de la session pour ne pas biaiser la réponse spontanée).
app.get('/api/questions/:id/hint', async (c) => {
  const questionId = c.req.param('id');

  const question = await c.env.DB.prepare(`SELECT hint FROM questions WHERE id = ?`)
    .bind(questionId)
    .first<{ hint: string | null }>();

  if (!question) {
    return c.json({ error: 'Question introuvable' }, 404);
  }

  return c.json({ hint: question.hint ?? null });
});

// Soumet une réponse à une question de la session et déclenche l'évaluation LLM-as-judge
app.post('/api/sessions/:id/answer', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json<{ question_id: number; answer: string }>();

  const question = await c.env.DB.prepare(
    `SELECT id, category_id, difficulty, prompt, rubric, hint, resources FROM questions WHERE id = ?`
  )
    .bind(body.question_id)
    .first<Question>();

  if (!question) {
    return c.json({ error: 'Question introuvable' }, 404);
  }

  const evaluation = await evaluateAnswer(c.env.AI, question, body.answer);

  await c.env.DB.prepare(
    `UPDATE session_items
     SET user_answer = ?, score = ?, feedback = ?, answered_at = datetime('now')
     WHERE session_id = ? AND question_id = ?`
  )
    .bind(body.answer, evaluation.score, evaluation.feedback, sessionId, body.question_id)
    .run();

  // Met à jour la moyenne glissante par catégorie, utilisée par la sélection
  // adaptative des prochaines sessions du même client_id.
  const session = await c.env.DB.prepare(`SELECT user_id FROM sessions WHERE id = ?`)
    .bind(sessionId)
    .first<{ user_id: string | null }>();

  if (session?.user_id) {
    const existing = await c.env.DB.prepare(
      `SELECT avg_score, attempts FROM skill_scores WHERE user_id = ? AND category_id = ?`
    )
      .bind(session.user_id, question.category_id)
      .first<{ avg_score: number; attempts: number }>();

    const attempts = (existing?.attempts ?? 0) + 1;
    const avgScore = existing
      ? (existing.avg_score * existing.attempts + evaluation.score) / attempts
      : evaluation.score;

    await c.env.DB.prepare(
      `INSERT INTO skill_scores (user_id, category_id, avg_score, attempts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, category_id) DO UPDATE SET avg_score = excluded.avg_score, attempts = excluded.attempts`
    )
      .bind(session.user_id, question.category_id, avgScore, attempts)
      .run();
  }

  const resources: Resource[] = question.resources ? JSON.parse(question.resources) : [];

  return c.json({ evaluation, resources });
});

// Soumet une réponse à la relance générée après la question principale.
// N'affecte pas le score déjà enregistré — sert à approfondir la
// discussion, pas à re-noter la question.
app.post('/api/sessions/:id/followup', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json<{ question_id: number; follow_up_question: string; answer: string }>();

  const question = await c.env.DB.prepare(`SELECT prompt FROM questions WHERE id = ?`)
    .bind(body.question_id)
    .first<{ prompt: string }>();

  if (!question) {
    return c.json({ error: 'Question introuvable' }, 404);
  }

  const feedback = await evaluateFollowUp(c.env.AI, question.prompt, body.follow_up_question, body.answer);

  await c.env.DB.prepare(
    `UPDATE session_items
     SET follow_up_question = ?, follow_up_answer = ?, follow_up_feedback = ?
     WHERE session_id = ? AND question_id = ?`
  )
    .bind(body.follow_up_question, body.answer, feedback, sessionId, body.question_id)
    .run();

  return c.json({ feedback });
});

// Clôture la session et génère le plan de révision personnalisé
app.post('/api/sessions/:id/complete', async (c) => {
  const sessionId = c.req.param('id');

  const breakdown = await c.env.DB.prepare(
    `SELECT cat.label AS category, AVG(si.score) AS avg_score, COUNT(*) AS attempts
     FROM session_items si
     JOIN questions q ON q.id = si.question_id
     JOIN categories cat ON cat.id = q.category_id
     WHERE si.session_id = ? AND si.score IS NOT NULL
     GROUP BY cat.id`
  )
    .bind(sessionId)
    .all<CategoryBreakdown>();

  if (!breakdown.results.length) {
    return c.json({ error: 'Aucune réponse évaluée pour cette session' }, 400);
  }

  const plan = await generateRevisionPlan(c.env.AI, breakdown.results);

  await c.env.DB.prepare(
    `UPDATE sessions SET status = 'completed', finished_at = datetime('now') WHERE id = ?`
  )
    .bind(sessionId)
    .run();

  return c.json({ breakdown: breakdown.results, revision_plan: plan });
});

// Récupère l'état complet d'une session (questions + réponses + scores)
app.get('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');

  const session = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`)
    .bind(sessionId)
    .first();

  if (!session) {
    return c.json({ error: 'Session introuvable' }, 404);
  }

  const items = await c.env.DB.prepare(
    `SELECT si.*, q.prompt, q.difficulty, q.hint, q.resources
     FROM session_items si
     JOIN questions q ON q.id = si.question_id
     WHERE si.session_id = ?
     ORDER BY si.position`
  )
    .bind(sessionId)
    .all<SessionItem & { prompt: string; difficulty: number; hint: string | null; resources: string | null }>();

  const itemsWithParsedResources = items.results.map((item) => ({
    ...item,
    resources: item.resources ? (JSON.parse(item.resources) as Resource[]) : [],
  }));

  return c.json({ session, items: itemsWithParsedResources });
});

// Progression d'un client_id (utilisateur anonyme mais persistant côté
// navigateur) par catégorie — sert de base à un futur écran de progression.
app.get('/api/progress/:client_id', async (c) => {
  const clientId = c.req.param('client_id');

  const scores = await c.env.DB.prepare(
    `SELECT cat.slug AS category_slug, cat.label AS category_label, s.avg_score, s.attempts
     FROM skill_scores s
     JOIN categories cat ON cat.id = s.category_id
     WHERE s.user_id = ?
     ORDER BY cat.id`
  )
    .bind(clientId)
    .all<{ category_slug: string; category_label: string; avg_score: number; attempts: number }>();

  return c.json({ client_id: clientId, categories: scores.results });
});

// Historique des sessions d'un client_id — une session terminée n'était
// jusqu'ici consultable que via son URL, perdue dès qu'on quittait la page.
app.get('/api/history/:client_id', async (c) => {
  const clientId = c.req.param('client_id');

  const sessions = await c.env.DB.prepare(
    `SELECT s.id, s.status, s.started_at, s.finished_at,
            AVG(si.score) AS avg_score, COUNT(si.score) AS answered_count
     FROM sessions s
     LEFT JOIN session_items si ON si.session_id = s.id AND si.score IS NOT NULL
     WHERE s.user_id = ?
     GROUP BY s.id
     ORDER BY s.started_at DESC
     LIMIT 30`
  )
    .bind(clientId)
    .all<{
      id: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      avg_score: number | null;
      answered_count: number;
    }>();

  return c.json({ client_id: clientId, sessions: sessions.results });
});

// Réindexe toutes les questions dans Vectorize (embeddings du texte de la
// question + de sa rubrique). À exécuter une fois après chaque changement de
// la banque de questions (nouveau seed, questions ajoutées/modifiées).
// Protégé par un secret partagé — jamais exposé au frontend.
app.post('/api/admin/reindex-questions', async (c) => {
  const providedSecret = c.req.header('x-reindex-secret');
  if (!c.env.REINDEX_SECRET || providedSecret !== c.env.REINDEX_SECRET) {
    return c.json({ error: 'Non autorisé' }, 401);
  }

  const questions = await c.env.DB.prepare(
    `SELECT id, category_id, difficulty, prompt, rubric FROM questions`
  ).all<Question>();

  const vectors = [];
  for (const q of questions.results) {
    const embedding = await embedText(c.env.AI, questionEmbeddingText(q.prompt, q.rubric));
    vectors.push({
      id: String(q.id),
      values: embedding,
      metadata: { category_id: q.category_id, difficulty: q.difficulty },
    });
  }

  await c.env.QUESTIONS_INDEX.upsert(vectors);

  return c.json({ indexed: vectors.length });
});

export default app;
