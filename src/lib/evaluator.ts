import type { Bindings, Evaluation, Question } from '../types';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * LLM-as-judge : évalue une réponse par rapport à une rubrique explicite,
 * plutôt qu'un jugement global non structuré (biais connu des juges LLM).
 */
export async function evaluateAnswer(
  ai: Bindings['AI'],
  question: Question,
  userAnswer: string
): Promise<Evaluation> {
  const rubricPoints: string[] = JSON.parse(question.rubric);

  const systemPrompt = `Tu es un évaluateur technique rigoureux et bienveillant pour un simulateur d'entretien.
Tu notes la réponse d'un candidat à une question, en te basant UNIQUEMENT sur une grille de points attendus.
Réponds STRICTEMENT en JSON valide, sans texte autour, avec ce format exact :
{"score": <entier 0-100>, "points_couverts": [...], "points_manquants": [...], "feedback": "<2-3 phrases constructives en français>"}`;

  const userPrompt = `Question posée : ${question.prompt}

Points attendus dans une bonne réponse :
${rubricPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Réponse du candidat :
"""
${userAnswer}
"""

Évalue cette réponse selon la grille ci-dessus.`;

  const result = await ai.run(MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = (result as { response?: string }).response ?? '';
  return parseEvaluation(raw);
}

function parseEvaluation(raw: string): Evaluation {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return fallbackEvaluation(raw);
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: clampScore(parsed.score),
      feedback: String(parsed.feedback ?? ''),
      points_couverts: Array.isArray(parsed.points_couverts) ? parsed.points_couverts : [],
      points_manquants: Array.isArray(parsed.points_manquants) ? parsed.points_manquants : [],
    };
  } catch {
    return fallbackEvaluation(raw);
  }
}

function fallbackEvaluation(raw: string): Evaluation {
  return {
    score: 0,
    feedback: `Évaluation automatique indisponible, réponse brute du modèle : ${raw.slice(0, 200)}`,
    points_couverts: [],
    points_manquants: [],
  };
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
