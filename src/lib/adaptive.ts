import type { Bindings, Question } from '../types';
import { embedText } from './embeddings';
import { generateAndStoreQuestion } from './question-generator';
import { computeSkillScores, type CategoryScore } from './skill-scores';

export interface CategoryRow {
  id: number;
  slug: string;
  label: string;
}

const QUESTIONS_PER_SESSION = 6;
const QUESTIONS_PER_FULL_SESSION = 12;

// Toutes les questions sont générées fraîchement par l'IA plutôt que tirées
// de la banque existante — elles y sont aussitôt ajoutées, donc la banque
// grossit à chaque session au lieu de rester figée. Si la génération échoue
// pour un slot (API indisponible, réponse malformée), on retombe sur la
// banque existante pour ce slot précis — jamais de session bloquée.
const AI_GENERATED_SLOTS = new Set([0, 1, 2, 3, 4, 5]);

/**
 * Poids de tirage par catégorie : plus le score moyen est faible, plus la
 * catégorie est favorisée. Une catégorie jamais pratiquée reçoit un poids
 * neutre (ni évitée, ni sur-représentée) pour continuer à explorer.
 */
function categoryWeight(score: CategoryScore | undefined): number {
  if (!score || score.attempts === 0) return 2;
  return Math.max(1, Math.round((100 - score.avg_score) / 20) + 1);
}

/** Difficulté ciblée en fonction du niveau observé sur la catégorie. */
function targetDifficulty(score: CategoryScore | undefined): number {
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
  excludeIds: Set<number>,
  forcedDifficulty?: number
): Promise<number | null> {
  try {
    const vector = await embedText(env.AI, referenceQuestion.prompt);
    const filter: Record<string, number> = { category_id: categoryId };
    if (forcedDifficulty) filter.difficulty = forcedDifficulty;
    const matches = await env.QUESTIONS_INDEX.query(vector, {
      topK: 8,
      filter,
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
 * - chaque question est générée fraîchement par l'IA (voir AI_GENERATED_SLOTS)
 *   et aussitôt ajoutée à la banque ;
 * - si la génération échoue pour un slot, repli sur la banque existante :
 *   sans historique (utilisateur anonyme sans client_id, ou premières
 *   sessions), tirage aléatoire équilibré entre catégories, comme en V1 ;
 *   avec historique, les catégories faibles sont favorisées (poids inverse
 *   au score moyen), la difficulté ciblée suit le niveau observé, et pour
 *   les catégories déjà pratiquées on tente d'abord une question
 *   sémantiquement proche de la moins bien réussie (renforcement ciblé via
 *   Vectorize) avant de retomber sur un tirage aléatoire dans la
 *   catégorie/difficulté visée.
 */
export interface SelectedQuestion {
  id: number;
  isNew: boolean; // vient d'être généré par IA pour cette session précise
}

export async function selectAdaptiveQuestions(
  env: Bindings,
  categories: CategoryRow[],
  userId: string | null,
  forcedDifficulty?: number,
  full = false,
  candidateContext?: string
): Promise<SelectedQuestion[]> {
  const questionsPerSession = full ? QUESTIONS_PER_FULL_SESSION : QUESTIONS_PER_SESSION;
  const scores = userId ? await computeSkillScores(env.DB, userId) : [];
  const scoreByCategory = new Map(scores.map((s) => [s.category_id, s]));

  // Choix de la catégorie/difficulté de chaque slot d'abord (rapide, pas
  // d'appel réseau), puis toutes les générations IA sont lancées EN
  // PARALLÈLE : elles sont indépendantes les unes des autres, et les
  // enchaîner séquentiellement multipliait le temps d'attente au démarrage
  // d'une session par le nombre de questions (2-5s x 6, voire x 12 en mode
  // entretien complet).
  const slots = Array.from({ length: questionsPerSession }, () => {
    const weights = categories.map((cat) => categoryWeight(scoreByCategory.get(cat.id)));
    const category = weightedPick(categories, weights);
    const score = scoreByCategory.get(category.id);
    const difficulty = forcedDifficulty ?? targetDifficulty(score);
    return { category, score, difficulty };
  });

  const generatedIds = await Promise.all(
    slots.map((slot, i) =>
      AI_GENERATED_SLOTS.has(i)
        ? generateAndStoreQuestion(env, slot.category.id, slot.category.label, slot.difficulty, candidateContext)
        : Promise.resolve(null)
    )
  );

  const selected: SelectedQuestion[] = [];
  const excludeIds = new Set<number>();

  for (let i = 0; i < slots.length; i++) {
    const { category, score, difficulty } = slots[i];
    let questionId: number | null = generatedIds[i];
    const isNew = questionId !== null;

    if (!questionId && userId && score && score.attempts > 0) {
      const reference = await worstAnsweredQuestion(env.DB, userId, category.id);
      if (reference) {
        questionId = await findSimilarQuestion(env, reference, category.id, excludeIds, forcedDifficulty);
      }
    }

    if (!questionId) {
      questionId = await randomQuestionInCategory(env.DB, category.id, difficulty, excludeIds);
    }

    if (questionId) {
      selected.push({ id: questionId, isNew });
      excludeIds.add(questionId);
    }
  }

  return selected;
}
