import type { Bindings } from '../types';
import { callOpenRouter } from './openrouter';

export interface CategoryBreakdown {
  category: string;
  avg_score: number;
  attempts: number;
}

export interface RevisionPlanItem {
  category: string;
  priority: number; // 1 = à retravailler en premier
  score: number;
  summary: string;
  focus_topic: string;
  resource_url: string;
  exercise: string;
}

export interface RevisionPlan {
  items: RevisionPlanItem[];
  closing_note: string;
}

interface GeneratedItem {
  category: string;
  summary: string;
  focus_topic: string;
  exercise: string;
}

/**
 * Génère un plan de révision personnalisé à partir des scores par catégorie
 * d'une session terminée : une fiche par catégorie (résumé pédagogique,
 * ressource ciblée, exercice pratique), triées de la plus faible à la plus
 * solide. Sortie structurée en JSON plutôt qu'un texte libre en markdown —
 * plus fiable à afficher et à faire évoluer que du texte à parser.
 */
export async function generateRevisionPlan(env: Bindings, breakdown: CategoryBreakdown[]): Promise<RevisionPlan> {
  const sorted = [...breakdown].sort((a, b) => a.avg_score - b.avg_score);

  const summaryLines = sorted
    .map((b) => `- ${b.category} : score moyen ${Math.round(b.avg_score)}/100 sur ${b.attempts} question(s)`)
    .join('\n');

  const systemPrompt = `Tu conçois un plan de révision personnalisé pour un candidat après une session d'entretien technique simulé, à partir de son score par famille de compétences.
Pour CHAQUE famille listée par le candidat, dans le même ordre, fournis :
- "summary" : 2-3 phrases en français, ton direct et motivant, expliquant ce qu'il faut retravailler ou consolider dans cette famille précise (jamais de markdown, jamais d'astérisques, texte brut uniquement).
- "focus_topic" : UN sujet précis et concret (2-5 mots, en français) sur lequel concentrer la révision de cette famille — sert à générer un lien de recherche, pas une phrase.
- "exercise" : un exercice pratique concret à réaliser pour progresser sur cette famille (2-4 phrases, en français, actionnable dès maintenant, sans matériel particulier).
Réponds STRICTEMENT en JSON valide, sans texte autour :
{"items": [{"category": "<nom exact de la famille>", "summary": "...", "focus_topic": "...", "exercise": "..."}, ...], "closing_note": "<une phrase encourageante sur le point fort du candidat, en français, sans markdown>"}`;

  // Le plan de révision est un "plus" pédagogique, jamais une donnée
  // bloquante : si l'IA est indisponible (surcharge du plan gratuit...),
  // on retombe sur un plan minimal basé uniquement sur les scores plutôt
  // que de faire échouer toute la clôture de session — le candidat doit
  // toujours pouvoir voir son bilan.
  let raw = '';
  try {
    raw = await callOpenRouter(
      env.OPENROUTER_API_KEY,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Bilan du candidat :\n${summaryLines}` },
      ],
      1024
    );
  } catch {
    raw = '';
  }

  return parseRevisionPlan(raw, sorted);
}

function parseRevisionPlan(raw: string, sorted: CategoryBreakdown[]): RevisionPlan {
  const fallback: RevisionPlan = {
    items: sorted.map((b, i) => ({
      category: b.category,
      priority: i + 1,
      score: Math.round(b.avg_score),
      summary: 'Plan de révision indisponible pour le moment — reviens plus tard pour un plan détaillé.',
      focus_topic: b.category,
      resource_url: buildSearchUrl(b.category),
      exercise: '',
    })),
    closing_note: '',
  };

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.items)) return fallback;

    const validItems: GeneratedItem[] = parsed.items.filter((item: unknown): item is GeneratedItem => {
      const i = item as Partial<GeneratedItem>;
      return typeof i?.category === 'string' && typeof i?.summary === 'string';
    });
    const byCategory = new Map<string, GeneratedItem>(validItems.map((item) => [item.category, item]));

    const items: RevisionPlanItem[] = sorted.map((b, i) => {
      const generated = byCategory.get(b.category);
      const focusTopic = generated?.focus_topic?.trim() || b.category;
      return {
        category: b.category,
        priority: i + 1,
        score: Math.round(b.avg_score),
        summary: generated?.summary?.trim() || fallback.items[i].summary,
        focus_topic: focusTopic,
        resource_url: buildSearchUrl(focusTopic),
        exercise: generated?.exercise?.trim() || '',
      };
    });

    return {
      items,
      closing_note: typeof parsed.closing_note === 'string' ? parsed.closing_note.trim() : '',
    };
  } catch {
    return fallback;
  }
}

// Lien de recherche plutôt qu'une page précise inventée — même principe que
// pour les ressources des questions : jamais d'URL dont on ne peut garantir
// l'existence.
function buildSearchUrl(topic: string): string {
  return `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`;
}
