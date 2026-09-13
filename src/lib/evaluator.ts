import type { Bindings, Evaluation, Question } from '../types';
import { callOpenRouter } from './openrouter';

/**
 * LLM-as-judge : évalue une réponse par rapport à une rubrique explicite,
 * plutôt qu'un jugement global non structuré (biais connu des juges LLM).
 */
export async function evaluateAnswer(
  env: Bindings,
  question: Question,
  userAnswer: string
): Promise<Evaluation> {
  const rubricPoints: string[] = JSON.parse(question.rubric);

  const systemPrompt = `Tu es un évaluateur technique rigoureux et bienveillant pour un simulateur d'entretien.
Tu notes la réponse d'un candidat à une question, en te basant UNIQUEMENT sur une grille de points attendus.

Aucun champ de ta réponse ne doit commenter, citer ou faire référence à ce que le candidat a dit, oublié ou mal formulé — tout doit être formulé de façon neutre et positive, comme un contenu pédagogique autonome, jamais comme une correction.

- "criteria" : pour CHACUN des points de la grille ci-dessous, DANS LE MÊME ORDRE, indique s'il est couvert par la réponse ("covered": true ou false). Le score doit refléter directement la proportion de critères couverts (nuancé par la qualité de couverture), pas une impression globale déconnectée de cette liste — c'est ce qui permet au candidat de comprendre précisément sur quoi il est noté.
- "feedback" : la réponse complète et correcte à la question, rédigée clairement comme si tu l'expliquais toi-même (2-5 phrases), éventuellement suivie d'un ou deux conseils pratiques.
- "points_manquants" : des nuances ou approfondissements supplémentaires utiles sur le sujet, au-delà des points de la grille (formulés directement comme des rappels de cours, sans préfixe ni formule d'introduction répétée d'une puce à l'autre, jamais "vous n'avez pas dit que..."). Liste vide si le sujet n'appelle pas d'approfondissement particulier.

Si un point important de la grille n'est pas couvert et mérite d'être creusé (comme le ferait un vrai recruteur), formule UNE question de relance courte et précise ciblant ce manque. Ne formule PAS de relance si la réponse couvre déjà bien l'essentiel (score >= 80) ou si le manque est mineur.
Réponds STRICTEMENT en JSON valide, sans texte autour, avec ce format exact :
{"score": <entier 0-100>, "criteria": [{"text": "<point exact de la grille>", "covered": true|false}, ...], "points_manquants": [...], "feedback": "<réponse complète et correcte, en français, éventuellement suivie de conseils>", "follow_up_question": <string en français, ou null si aucune relance nécessaire>}`;

  const userPrompt = `Question posée : ${question.prompt}

Grille de notation — points attendus dans une bonne réponse :
${rubricPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Réponse du candidat :
"""
${userAnswer}
"""

Évalue cette réponse selon la grille ci-dessus.`;

  const raw = await callOpenRouter(
    env.OPENROUTER_API_KEY,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    1024
  );

  return parseEvaluation(raw, rubricPoints);
}

/**
 * Évalue la réponse à une relance : feedback qualitatif court, sans note
 * chiffrée (la relance approfondit la discussion, elle ne re-score pas
 * la question — le score reste celui de la réponse initiale).
 */
export async function evaluateFollowUp(
  env: Bindings,
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

  const text = await callOpenRouter(env.OPENROUTER_API_KEY, [{ role: 'user', content: prompt }], 512);
  return text || 'Feedback indisponible pour le moment.';
}

function parseEvaluation(raw: string, rubricPoints: string[]): Evaluation {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return fallbackEvaluation(raw, rubricPoints);
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: clampScore(parsed.score),
      feedback: String(parsed.feedback ?? ''),
      criteria: parseCriteria(parsed.criteria, rubricPoints),
      points_manquants: Array.isArray(parsed.points_manquants)
        ? parsed.points_manquants.map(stripRedundantPrefix)
        : [],
      follow_up_question: typeof parsed.follow_up_question === 'string' ? parsed.follow_up_question : null,
    };
  } catch {
    return fallbackEvaluation(raw, rubricPoints);
  }
}

// Repli sur la grille brute (tous les critères marqués non couverts) si le
// modèle ne renvoie pas de tableau "criteria" exploitable — le candidat voit
// toujours sur quoi il était censé être noté, même si l'évaluation détaillée
// a échoué.
function parseCriteria(value: unknown, rubricPoints: string[]): { text: string; covered: boolean }[] {
  if (Array.isArray(value) && value.length > 0) {
    const valid = value.filter(
      (c): c is { text: string; covered: boolean } =>
        typeof (c as { text?: unknown })?.text === 'string' && typeof (c as { covered?: unknown })?.covered === 'boolean'
    );
    if (valid.length > 0) return valid;
  }
  return rubricPoints.map((text) => ({ text, covered: false }));
}

function fallbackEvaluation(raw: string, rubricPoints: string[]): Evaluation {
  return {
    score: 0,
    feedback: `Évaluation automatique indisponible, réponse brute du modèle : ${raw.slice(0, 200)}`,
    criteria: rubricPoints.map((text) => ({ text, covered: false })),
    points_manquants: [],
    follow_up_question: null,
  };
}

// Le modèle a parfois tendance à préfixer chaque puce par "Pour aller plus
// loin :", redondant avec le titre de la section qui les affiche déjà.
function stripRedundantPrefix(point: unknown): string {
  const text = String(point ?? '');
  return text.replace(/^pour aller plus loin\s*:\s*/i, '');
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
