import type { Bindings, Evaluation, Question } from '../types';
import { extractResponseText } from './ai-response';

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
Si un point important de la grille n'est pas couvert et mérite d'être creusé (comme le ferait un vrai recruteur), formule UNE question de relance courte et précise ciblant ce manque. Ne formule PAS de relance si la réponse couvre déjà bien l'essentiel (score >= 80) ou si le manque est mineur.
Réponds STRICTEMENT en JSON valide, sans texte autour, avec ce format exact :
{"score": <entier 0-100>, "points_couverts": [...], "points_manquants": [...], "feedback": "<2-3 phrases constructives en français>", "follow_up_question": <string en français, ou null si aucune relance nécessaire>}`;

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

  return parseEvaluation(extractResponseText(result));
}

/**
 * Évalue la réponse à une relance : feedback qualitatif court, sans note
 * chiffrée (la relance approfondit la discussion, elle ne re-score pas
 * la question — le score reste celui de la réponse initiale).
 */
export async function evaluateFollowUp(
  ai: Bindings['AI'],
  originalQuestion: string,
  followUpQuestion: string,
  followUpAnswer: string
): Promise<string> {
  const prompt = `Dans un entretien technique simulé, la question initiale était :
"${originalQuestion}"

Le recruteur a posé cette relance pour creuser un point manquant :
"${followUpQuestion}"

Réponse du candidat à la relance :
"""
${followUpAnswer}
"""

Donne un feedback court (2-3 phrases, en français, ton direct et constructif) sur cette réponse à la relance — sans note chiffrée, juste un avis qualitatif.`;

  const result = await ai.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractResponseText(result);
  return text || 'Feedback indisponible pour le moment.';
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
      follow_up_question: typeof parsed.follow_up_question === 'string' ? parsed.follow_up_question : null,
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
    follow_up_question: null,
  };
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
