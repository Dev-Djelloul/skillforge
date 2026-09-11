# SkillForge

Agent IA d'entraînement aux entretiens techniques — IA/ML, gestion de projet digital, développement web et culture des métiers du numérique.

Construit sur **Cloudflare Workers**, avec **D1** pour l'état des sessions et **Workers AI** pour l'évaluation des réponses (LLM-as-judge sur rubrique explicite) et la génération de plans de révision personnalisés.

## Roadmap

- **V1** (en cours) — entretien texte, banque de questions statique et diversifiée, évaluation LLM par rubrique, bilan de fin de session avec plan de révision.
- **V2** — sélection adaptative des questions via Vectorize (similarité sémantique avec les lacunes détectées), suivi de la progression dans le temps.
- **V3** — mode voix (speech-to-text / text-to-speech), comptes utilisateurs, ouverture au public.

## Démarrer en local

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

## Créer la base D1 distante (première fois)

```bash
npx wrangler d1 create skillforge-db
# copier le database_id renvoyé dans wrangler.toml
npm run db:migrate:remote
npm run db:seed:remote
```

## API (V1)

| Route | Méthode | Description |
|---|---|---|
| `/api/sessions` | POST | Démarre une session, tire 6 questions |
| `/api/sessions/:id` | GET | État complet d'une session |
| `/api/sessions/:id/answer` | POST | Soumet une réponse `{ question_id, answer }`, retourne l'évaluation |
| `/api/sessions/:id/complete` | POST | Clôture la session, retourne le bilan par catégorie + plan de révision |

## Structure

```
src/
  index.ts          Worker principal (routes Hono)
  types.ts          Types partagés
  lib/evaluator.ts  LLM-as-judge (évaluation par rubrique)
  lib/planner.ts    Génération du plan de révision
  db/schema.sql     Schéma D1
  db/seed.sql       Banque de questions initiale (24 questions, 4 catégories, 3 niveaux)
```