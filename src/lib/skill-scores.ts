import type { Bindings } from '../types';

export interface CategoryScore {
  category_id: number;
  avg_score: number;
  attempts: number;
}

/**
 * Score moyen et nombre de tentatives par catégorie, calculés à la volée à
 * partir des sessions réellement existantes plutôt que maintenus dans une
 * table à part (skill_scores, désormais abandonnée) — évite qu'une session
 * supprimée par l'utilisateur continue de peser sur "Mes progrès" ou sur la
 * sélection adaptative des questions.
 */
export async function computeSkillScores(db: Bindings['DB'], userId: string): Promise<CategoryScore[]> {
  const rows = await db
    .prepare(
      `SELECT q.category_id AS category_id, AVG(si.score) AS avg_score, COUNT(*) AS attempts
       FROM session_items si
       JOIN sessions s ON s.id = si.session_id
       JOIN questions q ON q.id = si.question_id
       WHERE s.user_id = ? AND si.score IS NOT NULL
       GROUP BY q.category_id`
    )
    .bind(userId)
    .all<CategoryScore>();

  return rows.results;
}
