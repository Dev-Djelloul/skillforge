import type { Bindings, Question, SkillScore } from '../types';
import { embedText } from './embeddings';

export interface CategoryRow {
  id: number;
  slug: string;
  label: string;
}

const QUESTIONS_PER_SESSION = 6;

/**
 * Poids de tirage par catégorie : plus le score moyen est faible, plus la
 * catégorie est favorisée. Une catégorie jamais pratiquée reçoit un poids
 * neutre (ni évitée, ni sur-représentée) pour continuer à explorer.
 */
function categoryWeight(score: SkillScore | undefined): number {
  if (!score || score.attempts === 0) return 2;
  return Math.max(1, Math.round((100 - score.avg_score) / 20) + 1);
}

/** Difficulté ciblée en fonction du niveau observé sur la catégorie. */
function targetDifficulty(score: SkillScore | undefined): number {
  if (!score || score.attempts === 0) return 1 + Math.round(Math.random());
  if (score.avg_score < 50) return 1;
  if (score.avg_score < 75) return 2;
  return 3;
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Trouve, parmi les réponses passées de l'utilisateur dans une catégorie,
 * la question la moins bien notée — sert de point de départ pour retrouver
 * des questions sémantiquement proches via Vectorize (renforcement ciblé).
 */
async function worstAnsweredQuestion(
  db: Bindings['DB'],
  userId: string,
  categoryId: number
): Promise<Question | null> {
  return db
    .prepare(
      `SELECT q.id, q.category_id, q.difficulty, q.prompt, q.rubric, q.hint, q.resources
       FROM session_items si
       JOIN sessions s ON s.id = si.session_id
       JOIN questions q ON q.id = si.question_id
       WHERE s.user_id = ? AND q.category_id = ? AND si.score IS NOT NULL
       ORDER BY si.score ASC
       LIMIT 1`
    )
    .bind(userId, categoryId)
    .first<Question>();
}

/**
 * Cherche, via Vectorize, une question de la même catégorie sémantiquement
 * proche d'une question de référence (typiquement la moins bien réussie),
 * en excluant les questions déjà sélectionnées pour la session en cours.
 */
async function findSimilarQuestion(
  env: Bindings,
  referenceQuestion: Question,
  categoryId: number,
  excludeIds: Set<number>
): Promise<number | null> {
  try {
    const vector = await embedText(env.AI, referenceQuestion.prompt);
    const matches = await env.QUESTIONS_INDEX.query(vector, {
      topK: 8,
      filter: { category_id: categoryId },
      returnMetadata: 'none',
    });

    for (const match of matches.matches) {
      const questionId = Number(match.id);
      if (questionId !== referenceQuestion.id && !excludeIds.has(questionId)) {
        return questionId;
      }
    }
  } catch {
    // Vectorize indisponible ou index pas encore peuplé : on retombe
    // silencieusement sur le tirage aléatoire, jamais bloquant pour l'utilisateur.
  }
  return null;
}

async function randomQuestionInCategory(
  db: Bindings['DB'],
  categoryId: number,
  difficulty: number,
  excludeIds: Set<number>
): Promise<number | null> {
  const excluded = excludeIds.size > 0 ? [...excludeIds] : [-1];
  const placeholders = excluded.map(() => '?').join(',');

  const row = await db
    .prepare(
      `SELECT id FROM questions
       WHERE category_id = ? AND difficulty = ? AND id NOT IN (${placeholders})
       ORDER BY RANDOM() LIMIT 1`
    )
    .bind(categoryId, difficulty, ...excluded)
    .first<{ id: number }>();

  if (row) return row.id;

  // Repli : n'importe quelle difficulté de la catégorie si le niveau ciblé est épuisé.
  const fallback = await db
    .prepare(
      `SELECT id FROM questions
       WHERE category_id = ? AND id NOT IN (${placeholders})
       ORDER BY RANDOM() LIMIT 1`
    )
    .bind(categoryId, ...excluded)
    .first<{ id: number }>();

  return fallback?.id ?? null;
}

/**
 * Sélectionne un jeu de questions pour une session :
 * - sans historique (utilisateur anonyme sans client_id, ou premières sessions) :
 *   tirage aléatoire équilibré entre catégories, comme en V1 ;
 * - avec historique : les catégories faibles sont favorisées (poids inverse au
 *   score moyen), la difficulté ciblée suit le niveau observé, et pour les
 *   catégories déjà pratiquées on tente d'abord une question sémantiquement
 *   proche de la moins bien réussie (renforcement ciblé via Vectorize) avant
 *   de retomber sur un tirage aléatoire dans la catégorie/difficulté visée.
 */
export async function selectAdaptiveQuestions(
  env: Bindings,
  categories: CategoryRow[],
  userId: string | null
): Promise<number[]> {
  const scores = userId
    ? (
        await env.DB.prepare(`SELECT * FROM skill_scores WHERE user_id = ?`).bind(userId).all<SkillScore>()
      ).results
    : [];
  const scoreByCategory = new Map(scores.map((s) => [s.category_id, s]));

  const selected: number[] = [];
  const excludeIds = new Set<number>();

  for (let i = 0; i < QUESTIONS_PER_SESSION; i++) {
    const weights = categories.map((cat) => categoryWeight(scoreByCategory.get(cat.id)));
    const category = weightedPick(categories, weights);
    const score = scoreByCategory.get(category.id);
    const difficulty = targetDifficulty(score);

    let questionId: number | null = null;

    if (userId && score && score.attempts > 0) {
      const reference = await worstAnsweredQuestion(env.DB, userId, category.id);
      if (reference) {
        questionId = await findSimilarQuestion(env, reference, category.id, excludeIds);
      }
    }

    if (!questionId) {
      questionId = await randomQuestionInCategory(env.DB, category.id, difficulty, excludeIds);
    }

    if (questionId) {
      selected.push(questionId);
      excludeIds.add(questionId);
    }
  }

  return selected;
}
