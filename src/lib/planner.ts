import type { Bindings } from '../types';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface CategoryBreakdown {
  category: string;
  avg_score: number;
  attempts: number;
}

/**
 * Génère un plan de révision personnalisé à partir des scores par catégorie
 * d'une session terminée. Volontairement simple en V1 (pas de mémoire long
 * terme entre sessions) — la V2 croisera l'historique complet via D1.
 */
export async function generateRevisionPlan(
  ai: Bindings['AI'],
  breakdown: CategoryBreakdown[]
): Promise<string> {
  const summary = breakdown
    .map((b) => `- ${b.category} : score moyen ${b.avg_score}/100 sur ${b.attempts} question(s)`)
    .join('\n');

  const prompt = `Voici le bilan d'un candidat après une session d'entretien technique simulé :
${summary}

Rédige un plan de révision court (5 à 8 lignes, en français, ton direct et motivant) qui :
1. Identifie les 1 à 2 domaines prioritaires à retravailler
2. Propose une action concrète par domaine prioritaire (ressource, exercice, type de révision)
3. Termine sur un point fort à conserver`;

  const result = await ai.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
  });

  return (result as { response?: string }).response ?? 'Plan de révision indisponible pour le moment.';
}
