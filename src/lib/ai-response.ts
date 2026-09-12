/**
 * Les modèles Workers AI ne renvoient pas tous exactement la même forme
 * (`{ response: string }` la plupart du temps, mais certains modèles
 * renvoient un tableau ou une structure de type chat completion) —
 * extraction robuste plutôt qu'un accès direct qui casse silencieusement
 * selon le modèle utilisé.
 */
export function extractResponseText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.response === 'string') return r.response;
    if (Array.isArray(r.response)) return r.response.join('');
    const choices = r.choices;
    if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
      const message = (choices[0] as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string') return content;
      }
    }
  }
  return '';
}
