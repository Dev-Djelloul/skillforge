import {
  startSession,
  submitAnswer,
  completeSession,
  getHint,
  type StartSessionResponse,
  type AnswerResponse,
  type CompleteSessionResponse,
} from './api';
import { findRelevantTerms } from './glossary';

const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="42" width="30" height="10" rx="2" fill="currentColor"/>
  <rect x="10" y="28" width="22" height="10" rx="2" fill="#B3401A"/>
  <rect x="10" y="14" width="14" height="10" rx="2" fill="currentColor"/>
  <path d="M40 18 L47 8 L44 18 L52 14 L42 24 Z" fill="#FFB020"/>
</svg>`;

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Niveau 1 · Facile',
  2: 'Niveau 2 · Intermédiaire',
  3: 'Niveau 3 · Avancé',
};

type Screen = 'start' | 'question' | 'feedback' | 'results' | 'error';

interface AppState {
  screen: Screen;
  session: StartSessionResponse | null;
  currentIndex: number;
  hint: string | null;
  hintLoading: boolean;
  lastAnswer: AnswerResponse | null;
  results: CompleteSessionResponse | null;
  errorMessage: string | null;
  busy: boolean;
}

const state: AppState = {
  screen: 'start',
  session: null,
  currentIndex: 0,
  hint: null,
  hintLoading: false,
  lastAnswer: null,
  results: null,
  errorMessage: null,
  busy: false,
};

const app = document.getElementById('app')!;

function topBar(): string {
  return `
    <div class="top-bar">
      <div class="logo">${LOGO_SVG}<span>Skill<span class="accent">Forge</span></span></div>
    </div>
  `;
}

function difficultyBadge(level: number): string {
  return `<div class="badge badge-${level}"><div class="dot"></div>${DIFFICULTY_LABEL[level] ?? 'Niveau'}</div>`;
}

function renderStart(): string {
  return `
    ${topBar()}
    <div class="hero">
      <h1>Préparez votre prochain entretien technique</h1>
      <p>SkillForge simule un entretien réaliste en IA/ML, gestion de projet digital et développement web, avec un feedback immédiat pour progresser à chaque session.</p>
      <div class="families">
        <div class="card">IA & Machine Learning<span>Prompt, RAG, agents, évaluation</span></div>
        <div class="card">Gestion de projet digital<span>Agilité, arbitrages, risques</span></div>
        <div class="card">Développement web<span>Architecture, API, sécurité</span></div>
        <div class="card">Culture numérique<span>UX, produit, transformation</span></div>
      </div>
      <button class="btn-primary" id="start-btn" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Préparation de la session…' : 'Commencer l’entretien'}
      </button>
      ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ''}
    </div>
  `;
}

function renderGlossaryPanel(prompt: string, categorySlug: string): string {
  const terms = findRelevantTerms(prompt, categorySlug);
  if (terms.length === 0) {
    return `
      <aside class="glossary-panel">
        <div class="glossary-title">Lexique</div>
        <p class="glossary-empty">Aucun terme référencé pour cette question.</p>
      </aside>
    `;
  }

  return `
    <aside class="glossary-panel">
      <div class="glossary-title">Lexique</div>
      <dl class="glossary-list">
        ${terms
          .map(
            (t) => `
              <div class="glossary-entry">
                <dt>${escapeHtml(t.term)}</dt>
                <dd>${escapeHtml(t.definition)}</dd>
              </div>
            `
          )
          .join('')}
      </dl>
    </aside>
  `;
}

function renderQuestion(): string {
  const session = state.session!;
  const q = session.questions[state.currentIndex];
  const progress = Math.round((state.currentIndex / session.questions.length) * 100);

  return `
    <div class="page-split">
      <div class="page-split-main">
        ${topBar()}

        <div class="question-block">
          <div class="session-header">
            <span>Question ${state.currentIndex + 1} / ${session.questions.length}</span>
            <span class="muted">${progress}%</span>
          </div>
          <div class="progress-bar"><div style="width:${progress}%"></div></div>

          <div class="question-meta">${difficultyBadge(q.difficulty)}</div>
          <h2>${escapeHtml(q.prompt)}</h2>

          ${
            state.hint
              ? `<div class="hint-box">💡 ${escapeHtml(state.hint)}</div>`
              : `<button class="hint-toggle" id="hint-btn" ${state.hintLoading ? 'disabled' : ''}>
                  ${state.hintLoading ? 'Chargement de l’indice…' : 'Afficher un indice'}
                </button>`
          }

          <textarea id="answer-input" placeholder="Rédigez votre réponse ici — vous pouvez utiliser la méthode STAR pour structurer votre réponse..."></textarea>

          ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ''}

          <div class="actions-row">
            <span></span>
            <button class="btn-primary" id="submit-btn" ${state.busy ? 'disabled' : ''}>
              ${state.busy ? 'Évaluation en cours…' : 'Valider la réponse'}
            </button>
          </div>
        </div>
      </div>

      ${renderGlossaryPanel(q.prompt, q.category_slug)}
    </div>
  `;
}

function renderFeedback(): string {
  const session = state.session!;
  const answer = state.lastAnswer!;
  const isLast = state.currentIndex === session.questions.length - 1;
  const { evaluation, resources } = answer;

  return `
    ${topBar()}
    <div class="card feedback-card">
      <div class="score-line">
        <span class="value">${evaluation.score}</span>
        <span class="denom">/ 100</span>
      </div>
      <p style="margin:0; font-size:14px; line-height:1.6; color:var(--color-text-muted);">${escapeHtml(evaluation.feedback)}</p>

      ${
        evaluation.points_couverts.length
          ? `<div><strong style="font-size:13px;">Points couverts</strong><ul style="margin:8px 0 0; padding-left:18px; font-size:13px; color:var(--color-text-muted);">${evaluation.points_couverts.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        evaluation.points_manquants.length
          ? `<div><strong style="font-size:13px;">Axes à approfondir</strong><ul style="margin:8px 0 0; padding-left:18px; font-size:13px; color:var(--color-text-muted);">${evaluation.points_manquants.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
          : ''
      }

      ${
        resources.length
          ? `<div class="resources">
              <strong style="font-size:13px;">Pour aller plus loin</strong>
              ${resources.map((r) => `<a href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer">${r.type === 'video' ? '▶️' : '📄'} ${escapeHtml(r.title)}</a>`).join('')}
            </div>`
          : ''
      }

      <button class="btn-primary" id="next-btn">
        ${isLast ? 'Voir mes résultats' : 'Question suivante'}
      </button>
    </div>
  `;
}

function renderResults(): string {
  const results = state.results!;
  const overall = Math.round(
    results.breakdown.reduce((sum, b) => sum + b.avg_score, 0) / results.breakdown.length
  );

  return `
    ${topBar()}
    <div class="card results-summary">
      <span style="font-size:12px; color:var(--color-text-subtle); text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">Score final</span>
      <div><span class="value">${overall}</span><span style="font-size:16px; color:var(--color-text-muted);"> / 100</span></div>
    </div>

    <div class="card" style="margin-top:20px; display:flex; flex-direction:column; gap:14px;">
      <strong style="font-size:14px;">Répartition par catégorie</strong>
      ${results.breakdown
        .map((b) => {
          const pct = Math.round(b.avg_score);
          const color = pct >= 75 ? 'var(--color-level-1)' : pct >= 50 ? 'var(--color-level-2)' : 'var(--color-level-3)';
          return `
            <div class="breakdown-row">
              <div class="labels"><span>${escapeHtml(b.category)}</span><span>${pct}%</span></div>
              <div class="mini-bar"><div style="width:${pct}%; background:${color};"></div></div>
            </div>
          `;
        })
        .join('')}
    </div>

    <div class="card" style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
      <strong style="font-size:14px;">Plan de révision personnalisé</strong>
      <p style="margin:0; font-size:13px; line-height:1.6; color:var(--color-text-muted); white-space:pre-line;">${escapeHtml(results.revision_plan)}</p>
    </div>

    <div class="actions-row" style="margin-top:24px;">
      <span></span>
      <button class="btn-primary" id="restart-btn">Nouvelle session</button>
    </div>
  `;
}

function renderError(): string {
  return `
    ${topBar()}
    <div class="error-box">${escapeHtml(state.errorMessage ?? 'Une erreur est survenue.')}</div>
    <button class="btn-secondary" id="retry-btn" style="margin-top:16px;">Réessayer</button>
  `;
}

function render(): void {
  let html: string;
  switch (state.screen) {
    case 'start':
      html = renderStart();
      break;
    case 'question':
      html = renderQuestion();
      break;
    case 'feedback':
      html = renderFeedback();
      break;
    case 'results':
      html = renderResults();
      break;
    default:
      html = renderError();
  }
  app.innerHTML = html;
  attachHandlers();
}

function attachHandlers(): void {
  document.getElementById('start-btn')?.addEventListener('click', onStart);
  document.getElementById('hint-btn')?.addEventListener('click', onHint);
  document.getElementById('submit-btn')?.addEventListener('click', onSubmit);
  document.getElementById('next-btn')?.addEventListener('click', onNext);
  document.getElementById('restart-btn')?.addEventListener('click', onRestart);
  document.getElementById('retry-btn')?.addEventListener('click', onRestart);
}

async function onStart(): Promise<void> {
  state.busy = true;
  state.errorMessage = null;
  render();
  try {
    state.session = await startSession();
    state.currentIndex = 0;
    state.hint = null;
    state.screen = 'question';
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de démarrer la session.';
  } finally {
    state.busy = false;
    render();
  }
}

async function onHint(): Promise<void> {
  const session = state.session!;
  const q = session.questions[state.currentIndex];
  state.hintLoading = true;
  render();
  try {
    const { hint } = await getHint(q.question_id);
    state.hint = hint ?? 'Aucun indice disponible pour cette question.';
  } catch {
    state.hint = 'Impossible de charger l’indice pour le moment.';
  } finally {
    state.hintLoading = false;
    render();
  }
}

async function onSubmit(): Promise<void> {
  const session = state.session!;
  const q = session.questions[state.currentIndex];
  const textarea = document.getElementById('answer-input') as HTMLTextAreaElement | null;
  const answerText = textarea?.value.trim() ?? '';

  if (!answerText) {
    state.errorMessage = 'Rédigez une réponse avant de valider.';
    render();
    return;
  }

  state.busy = true;
  state.errorMessage = null;
  render();
  try {
    state.lastAnswer = await submitAnswer(session.session_id, q.question_id, answerText);
    state.screen = 'feedback';
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible d’évaluer la réponse.';
  } finally {
    state.busy = false;
    render();
  }
}

async function onNext(): Promise<void> {
  const session = state.session!;
  const isLast = state.currentIndex === session.questions.length - 1;

  if (!isLast) {
    state.currentIndex += 1;
    state.hint = null;
    state.lastAnswer = null;
    state.screen = 'question';
    render();
    return;
  }

  state.busy = true;
  render();
  try {
    state.results = await completeSession(session.session_id);
    state.screen = 'results';
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de clôturer la session.';
    state.screen = 'error';
  } finally {
    state.busy = false;
    render();
  }
}

function onRestart(): void {
  state.screen = 'start';
  state.session = null;
  state.currentIndex = 0;
  state.hint = null;
  state.lastAnswer = null;
  state.results = null;
  state.errorMessage = null;
  render();
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

render();
