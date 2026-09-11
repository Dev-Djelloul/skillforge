import { Hono } from 'hono';
import type { Bindings, Question, Resource, SessionItem } from './types';
import { evaluateAnswer } from './lib/evaluator';
import { generateRevisionPlan, type CategoryBreakdown } from './lib/planner';

const app = new Hono<{ Bindings: Bindings }>();

const QUESTIONS_PER_SESSION = 6;

app.get('/', (c) => c.json({ name: 'SkillForge API', status: 'ok' }));

// Démarre une nouvelle session : tire un jeu de questions diversifié
// (une répartition équilibrée entre catégories, tirage aléatoire en V1 —
// la sélection adaptative par compétence arrive en V2 avec Vectorize).
app.post('/api/sessions', async (c) => {
  const sessionId = crypto.randomUUID();

  const questions = await c.env.DB.prepare(
    `SELECT id, category_id, difficulty, prompt, rubric
     FROM questions
     ORDER BY RANDOM()
     LIMIT ?`
  )
    .bind(QUESTIONS_PER_SESSION)
    .all<Question>();

  if (!questions.results.length) {
    return c.json({ error: 'Aucune question disponible — la base a-t-elle été seedée ?' }, 500);
  }

  await c.env.DB.prepare(`INSERT INTO sessions (id, status) VALUES (?, 'in_progress')`)
    .bind(sessionId)
    .run();

  const inserts = questions.results.map((q, i) =>
    c.env.DB.prepare(
      `INSERT INTO session_items (session_id, question_id, position) VALUES (?, ?, ?)`
    ).bind(sessionId, q.id, i)
  );
  await c.env.DB.batch(inserts);

  return c.json({
    session_id: sessionId,
    questions: questions.results.map((q, i) => ({
      position: i,
      question_id: q.id,
      prompt: q.prompt,
      difficulty: q.difficulty,
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

  const resources: Resource[] = question.resources ? JSON.parse(question.resources) : [];

  return c.json({ evaluation, resources });
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

export default app;
