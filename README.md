# SkillForge

Simulateur d'entretien technique piloté par IA — IA/ML, gestion de projet digital, développement web et culture des métiers du numérique.

Construit entièrement sur l'écosystème **Cloudflare** : **Workers** (API Hono), **D1** (sessions, questions, historique), **Vectorize** (sélection adaptative par similarité sémantique) et **Pages** (frontend). La génération de texte (évaluation, relances, questions, lexique, plan de révision) passe par **OpenRouter** ; **Workers AI** est conservé uniquement pour les embeddings utilisés par Vectorize.

Aucun compte utilisateur : chaque navigateur a un identifiant anonyme persistant (`client_id` en `localStorage`), qui permet de suivre la progression et l'historique sans inscription — au prix de ne pas suivre un candidat d'un appareil à l'autre (voir Roadmap).

## Fonctionnalités

**Session d'entretien**
- Questions générées par IA à chaque session (pas de question figée), aussitôt ajoutées à la banque — elle grossit organiquement au lieu de rester statique.
- Sélection adaptative : catégories faibles favorisées, difficulté ajustée au niveau observé, renforcement ciblé via recherche de similarité Vectorize sur les points faibles.
- Mode "entretien complet" (12 questions sur toutes les familles) en plus du mode standard (6 questions, familles au choix).
- Personnalisation par contexte : offre d'emploi ou CV collé, pris en compte dans la génération des questions.
- Timer par question, indice à la demande, lexique généré par IA et mis en cache par question.
- Relance du recruteur sur les points insuffisamment couverts, avec feedback qualitatif dédié.
- Dictée vocale de la réponse (Web Speech API du navigateur, aucun coût serveur).

**Évaluation**
- LLM-as-judge sur rubrique explicite : la note ne se base que sur des points attendus définis à l'avance.
- Feedback pédagogique neutre (réponse complète + conseils), jamais formulé comme une correction des erreurs du candidat.
- Ressources "pour aller plus loin" sous forme de liens de recherche (Wikipédia, YouTube) — jamais d'URL inventée.

**Progression et historique**
- Bilan de fin de session (score par catégorie + plan de révision personnalisé), export PDF.
- "Mes progrès" : score global, famille la plus faible mise en avant, régularité (sessions au total / 30 derniers jours), graphique d'évolution dans le temps — tout recalculé à la volée à partir des sessions existantes.
- Historique des sessions avec détail par question et suppression individuelle.
- Reprise d'une session interrompue (moins de 24h) au lieu de forcer un nouveau départ.
- Partage d'une session en lecture seule via lien public, sans compte requis.

## Démarrer en local

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Frontend (répertoire `frontend/`) :

```bash
cd frontend
npm install
npm run dev
```

## Créer la base D1 distante (première fois)

```bash
npx wrangler d1 create skillforge-db
# copier le database_id renvoyé dans wrangler.toml
npm run db:migrate:remote
npm run db:seed:remote
```

## Secrets requis (Worker)

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put REINDEX_SECRET
```

## Déploiement

```bash
# Backend
npx wrangler deploy

# Frontend
cd frontend && npm run build
npx wrangler pages deploy dist --project-name=skillforge
```

## API

| Route | Méthode | Description |
|---|---|---|
| `/api/sessions` | POST | Démarre une session (`client_id`, `category_slugs`, `difficulty`, `full`, `context` optionnels) |
| `/api/sessions/resumable/:client_id` | GET | Session interrompue la plus récente (< 24h) à proposer en reprise |
| `/api/sessions/:id` | GET | État complet d'une session (questions, réponses, scores) |
| `/api/sessions/:id` | DELETE | Supprime une session de l'historique (vérifie le `client_id` propriétaire) |
| `/api/sessions/:id/answer` | POST | Soumet une réponse, retourne l'évaluation LLM-as-judge + ressources |
| `/api/sessions/:id/followup` | POST | Soumet une réponse à la relance du recruteur |
| `/api/sessions/:id/complete` | POST | Clôture la session, retourne le bilan par catégorie + plan de révision |
| `/api/questions/:id/hint` | GET | Indice de la question, à la demande |
| `/api/questions/:id/glossary` | GET | Lexique généré par IA pour la question, mis en cache |
| `/api/progress/:client_id` | GET | Scores par catégorie + compteurs de sessions |
| `/api/progress/:client_id/timeline` | GET | Évolution du score par catégorie, session après session |
| `/api/history/:client_id` | GET | Liste des sessions d'un candidat |
| `/api/admin/reindex-questions` | POST | Réindexe la banque dans Vectorize (protégé par `REINDEX_SECRET`) |

## Structure

```
src/
  index.ts                     Worker principal (routes Hono)
  types.ts                     Types partagés
  lib/openrouter.ts            Client OpenRouter (génération de texte)
  lib/evaluator.ts             LLM-as-judge (évaluation par rubrique + relance)
  lib/planner.ts                Génération du plan de révision
  lib/question-generator.ts    Génération de questions IA + ressources associées
  lib/glossary-generator.ts    Génération du lexique par question
  lib/adaptive.ts               Sélection adaptative des questions
  lib/skill-scores.ts           Calcul des scores par catégorie à la volée
  lib/embeddings.ts             Embeddings Workers AI pour Vectorize
  db/schema.sql                 Schéma D1
  db/seed*.sql, migrate-*.sql   Seed initial et migrations
frontend/
  src/main.ts                   Rendu et logique de l'app (vanilla TS, pas de framework)
  src/api.ts                    Client de l'API Worker
  src/style.css                 Charte graphique SkillForge
```

## Roadmap

**Fait** — V1 (entretien texte, banque statique, évaluation par rubrique) et V2 (sélection adaptative Vectorize, génération IA continue des questions, progression dans le temps, personnalisation par contexte, dictée vocale, reprise de session, partage) sont en production.

**V3 — pistes envisagées, à prioriser ensemble :**
- **Comptes utilisateurs** : suivre un candidat d'un appareil à l'autre (actuellement limité au navigateur via `localStorage`) — le vrai manque structurel de la V2.
- **Mode voix complet** : lecture de la question à voix haute (text-to-speech) en complément de la dictée déjà en place, pour un entretien mains libres de bout en bout.
- **Modération de la banque IA** : la banque grossit automatiquement à chaque session — un outil de relecture/désactivation des questions générées serait utile avant une ouverture publique large.
- **Maîtrise des coûts OpenRouter** : suivi d'usage et garde-fous (quota par `client_id`, alerte de dépassement) avant une montée en charge.
- **Tests automatisés** : aucune suite de tests aujourd'hui — au minimum les fonctions pures (`lib/`) et un test d'intégration par route critique.
- **Ouverture au public** : au-delà des correctifs ci-dessus, gestion de la charge (rate limiting), CGU, et page d'accueil publique distincte de l'outil d'entraînement personnel.
