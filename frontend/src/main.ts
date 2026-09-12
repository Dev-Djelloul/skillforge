import {
  startSession,
  submitAnswer,
  submitFollowUp,
  completeSession,
  getHint,
  getProgress,
  getHistory,
  getSessionDetail,
  type StartSessionResponse,
  type AnswerResponse,
  type CompleteSessionResponse,
  type ProgressResponse,
  type HistoryResponse,
  type SessionDetailResponse,
  type Resource,
  type SessionSetup,
} from './api';
import { findRelevantTerms } from './glossary';

const CATEGORIES = [
  { slug: 'ia-ml', label: 'IA & Machine Learning' },
  { slug: 'gestion-projet', label: 'Gestion de projet digital' },
  { slug: 'dev-web', label: 'Développement web' },
  { slug: 'culture-num', label: 'Culture métiers du numérique' },
];

const TIME_BY_DIFFICULTY: Record<number, number> = { 1: 180, 2: 300, 3: 480 };

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

type Screen = 'start' | 'setup' | 'question' | 'feedback' | 'results' | 'error' | 'progress' | 'history' | 'session-detail';

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
  progressData: ProgressResponse | null;
  historyData: HistoryResponse | null;
  sessionDetail: SessionDetailResponse | null;
  setupCategories: Set<string>;
  setupDifficulty: number | null;
  timeRemaining: number;
  followUpAnswered: boolean;
  followUpFeedback: string | null;
  followUpBusy: boolean;
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
  progressData: null,
  historyData: null,
  sessionDetail: null,
  setupCategories: new Set(CATEGORIES.map((c) => c.slug)),
  setupDifficulty: null,
  timeRemaining: 0,
  followUpAnswered: false,
  followUpFeedback: null,
  followUpBusy: false,
};

let timerHandle: ReturnType<typeof setInterval> | null = null;

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function stopTimer(): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

function startQuestionTimer(difficulty: number): void {
  stopTimer();
  state.timeRemaining = TIME_BY_DIFFICULTY[difficulty] ?? 300;
  timerHandle = setInterval(() => {
    state.timeRemaining -= 1;
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = formatTime(state.timeRemaining);
      el.classList.toggle('timer-low', state.timeRemaining <= 30);
    }
    if (state.timeRemaining <= 0) {
      stopTimer();
    }
  }, 1000);
}

const app = document.getElementById('app')!;

function topBar(showNav = true): string {
  return `
    <div class="top-bar">
      <div class="logo" id="logo-home">${LOGO_SVG}<span>Skill<span class="accent">Forge</span></span></div>
      ${
        showNav
          ? `<nav class="top-nav">
              <button class="nav-link" id="nav-progress-btn">Mes progrès</button>
              <button class="nav-link" id="nav-history-btn">Historique</button>
            </nav>`
          : ''
      }
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
      <button class="btn-primary" id="goto-setup-btn">Commencer l’entretien</button>
      ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ''}
    </div>
  `;
}

function renderSetup(): string {
  return `
    ${topBar(false)}
    <div class="hero" style="padding-top:24px; padding-bottom:16px;">
      <h1 style="font-size:28px;">Personnalise ta session</h1>
      <p>Choisis les familles à pratiquer et le niveau de difficulté — ou laisse la sélection adaptative faire le tri pour toi.</p>
    </div>

    <div class="card" style="display:flex; flex-direction:column; gap:14px;">
      <strong style="font-size:13px;">Familles de questions</strong>
      <div class="setup-categories">
        ${CATEGORIES.map(
          (c) => `
            <label class="setup-checkbox">
              <input type="checkbox" data-category="${escapeAttr(c.slug)}" ${state.setupCategories.has(c.slug) ? 'checked' : ''} />
              <span>${escapeHtml(c.label)}</span>
            </label>
          `
        ).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:16px; display:flex; flex-direction:column; gap:14px;">
      <strong style="font-size:13px;">Niveau de difficulté</strong>
      <div class="setup-categories">
        <label class="setup-checkbox">
          <input type="radio" name="difficulty" value="" ${state.setupDifficulty === null ? 'checked' : ''} />
          <span>Adaptatif (recommandé)</span>
        </label>
        ${[1, 2, 3]
          .map(
            (d) => `
              <label class="setup-checkbox">
                <input type="radio" name="difficulty" value="${d}" ${state.setupDifficulty === d ? 'checked' : ''} />
                <span>${DIFFICULTY_LABEL[d]}</span>
              </label>
            `
          )
          .join('')}
      </div>
    </div>

    ${state.errorMessage ? `<div class="error-box" style="margin-top:16px;">${escapeHtml(state.errorMessage)}</div>` : ''}

    <div class="actions-row" style="margin-top:24px;">
      <button class="btn-secondary" id="back-to-start-btn">← Retour</button>
      <button class="btn-primary" id="confirm-setup-btn" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Préparation de la session…' : 'Lancer la session'}
      </button>
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
        ${topBar(false)}

        <div class="question-block">
          <div class="session-header">
            <span>Question ${state.currentIndex + 1} / ${session.questions.length}</span>
            <span class="timer-badge" id="timer-display">${formatTime(state.timeRemaining)}</span>
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

const VIDEO_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0033"/>
  <path d="M10 9l6 3-6 3V9z" fill="#FFFFFF"/>
</svg>`;

const RECRUITER_ICON_HTML = `<img src="/img/icons8-recruitment-96.png" alt="" width="20" height="20" class="followup-icon" />`;

function faviconUrl(pageUrl: string): string {
  try {
    const domain = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  } catch {
    return '';
  }
}

function renderResourceCard(r: Resource): string {
  const isVideo = r.type === 'video';
  const preview = isVideo
    ? `<div class="resource-icon resource-icon-video">${VIDEO_ICON_SVG}</div>`
    : `<img class="resource-icon" src="${escapeAttr(faviconUrl(r.url))}" alt="" width="20" height="20" />`;

  return `
    <a class="resource-card" href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer">
      ${preview}
      <div class="resource-text">
        <div class="resource-title">${escapeHtml(r.title)}</div>
        <div class="resource-type">${isVideo ? 'Rechercher des vidéos' : 'Article'}</div>
      </div>
    </a>
  `;
}

function renderFeedback(): string {
  const session = state.session!;
  const answer = state.lastAnswer!;
  const isLast = state.currentIndex === session.questions.length - 1;
  const { evaluation, resources } = answer;

  return `
    ${topBar(false)}
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
              ${resources.map(renderResourceCard).join('')}
            </div>`
          : ''
      }

      ${renderFollowUpSection(evaluation.follow_up_question)}

      <button class="btn-primary" id="next-btn">
        ${isLast ? 'Voir mes résultats' : 'Question suivante'}
      </button>
    </div>
  `;
}

function renderFollowUpSection(followUpQuestion: string | null): string {
  if (!followUpQuestion) return '';

  if (state.followUpFeedback) {
    return `
      <div class="followup-box">
        <div class="followup-question">${RECRUITER_ICON_HTML}<span>${escapeHtml(followUpQuestion)}</span></div>
        <p class="followup-feedback">${escapeHtml(state.followUpFeedback)}</p>
      </div>
    `;
  }

  return `
    <div class="followup-box">
      <div class="followup-question">${RECRUITER_ICON_HTML}<span>Relance du recruteur : ${escapeHtml(followUpQuestion)}</span></div>
      <textarea id="followup-input" placeholder="Répondez à la relance (facultatif)..."></textarea>
      <div class="actions-row">
        <span></span>
        <button class="btn-secondary" id="submit-followup-btn" ${state.followUpBusy ? 'disabled' : ''}>
          ${state.followUpBusy ? 'Envoi…' : 'Répondre à la relance'}
        </button>
      </div>
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
      <button class="btn-secondary no-print" id="export-pdf-btn">Télécharger mon bilan (PDF)</button>
      <button class="btn-primary no-print" id="restart-btn">Nouvelle session</button>
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

function formatDate(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderProgress(): string {
  const data = state.progressData;
  const categories = data?.categories ?? [];

  return `
    ${topBar()}
    <div class="hero" style="padding-top:24px; padding-bottom:24px;">
      <h1 style="font-size:28px;">Mes progrès</h1>
      <p>Score moyen par famille de questions, sur l'ensemble de vos sessions.</p>
    </div>

    ${
      categories.length === 0
        ? `<div class="card"><p style="margin:0; font-size:14px; color:var(--color-text-muted);">Aucune donnée pour l'instant — termine une première session pour voir apparaître ta progression ici.</p></div>`
        : `<div class="card" style="display:flex; flex-direction:column; gap:18px;">
            ${categories
              .map((c) => {
                const pct = Math.round(c.avg_score);
                const color = pct >= 75 ? 'var(--color-level-1)' : pct >= 50 ? 'var(--color-level-2)' : 'var(--color-level-3)';
                return `
                  <div class="breakdown-row">
                    <div class="labels">
                      <span>${escapeHtml(c.category_label)}</span>
                      <span>${pct}% · ${c.attempts} question${c.attempts > 1 ? 's' : ''}</span>
                    </div>
                    <div class="mini-bar"><div style="width:${pct}%; background:${color};"></div></div>
                  </div>
                `;
              })
              .join('')}
          </div>`
    }

    <div class="actions-row" style="margin-top:24px;">
      <span></span>
      <button class="btn-primary" id="goto-setup-btn">Commencer une session</button>
    </div>
  `;
}

function renderHistory(): string {
  const sessions = state.historyData?.sessions ?? [];

  return `
    ${topBar()}
    <div class="hero" style="padding-top:24px; padding-bottom:24px;">
      <h1 style="font-size:28px;">Historique des sessions</h1>
      <p>Retrouve le détail de tes sessions précédentes.</p>
    </div>

    ${
      sessions.length === 0
        ? `<div class="card"><p style="margin:0; font-size:14px; color:var(--color-text-muted);">Aucune session pour l'instant.</p></div>`
        : `<div style="display:flex; flex-direction:column; gap:10px;">
            ${sessions
              .map((s) => {
                const scoreLabel = s.avg_score !== null ? `${Math.round(s.avg_score)}/100` : '—';
                const statusLabel = s.status === 'completed' ? 'Terminée' : 'Interrompue';
                return `
                  <button class="card session-row" data-session-id="${escapeAttr(s.id)}" style="text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; width:100%; font-family:inherit;">
                    <div>
                      <div style="font-size:13px; font-weight:600; color:var(--color-text);">${formatDate(s.started_at)}</div>
                      <div style="font-size:12px; color:var(--color-text-subtle); margin-top:2px;">${statusLabel} · ${s.answered_count} réponse${s.answered_count > 1 ? 's' : ''}</div>
                    </div>
                    <div class="disp" style="font-size:20px; font-weight:700; color:var(--color-accent);">${scoreLabel}</div>
                  </button>
                `;
              })
              .join('')}
          </div>`
    }
  `;
}

function renderSessionDetail(): string {
  const detail = state.sessionDetail;
  if (!detail) return `${topBar()}<div class="loading">Chargement…</div>`;

  return `
    ${topBar()}
    <div class="hero" style="padding-top:24px; padding-bottom:16px;">
      <button class="btn-ghost" id="back-to-history-btn" style="padding:8px 16px; font-size:12px;">← Retour à l'historique</button>
      <h1 style="font-size:24px; margin-top:8px;">Session du ${formatDate(detail.session.started_at)}</h1>
    </div>

    <div style="display:flex; flex-direction:column; gap:14px;">
      ${detail.items
        .map(
          (item, i) => `
            <div class="card" style="display:flex; flex-direction:column; gap:10px;">
              <div class="question-meta">${difficultyBadge(item.difficulty)}</div>
              <div style="font-size:14px; font-weight:600;">Q${i + 1}. ${escapeHtml(item.prompt)}</div>
              ${item.user_answer ? `<p style="margin:0; font-size:13px; color:var(--color-text-muted); white-space:pre-line;">${escapeHtml(item.user_answer)}</p>` : `<p style="margin:0; font-size:13px; color:var(--color-text-subtle); font-style:italic;">Non répondue</p>`}
              ${
                item.score !== null
                  ? `<div class="score-line"><span class="value" style="font-size:24px;">${item.score}</span><span class="denom">/ 100</span></div>
                     ${item.feedback ? `<p style="margin:0; font-size:12px; color:var(--color-text-muted);">${escapeHtml(item.feedback)}</p>` : ''}`
                  : ''
              }
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function render(): void {
  let html: string;
  switch (state.screen) {
    case 'start':
      html = renderStart();
      break;
    case 'setup':
      html = renderSetup();
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
    case 'progress':
      html = renderProgress();
      break;
    case 'history':
      html = renderHistory();
      break;
    case 'session-detail':
      html = renderSessionDetail();
      break;
    default:
      html = renderError();
  }
  app.innerHTML = html;
  attachHandlers();
}

function attachHandlers(): void {
  document.getElementById('goto-setup-btn')?.addEventListener('click', onGoToSetup);
  document.getElementById('back-to-start-btn')?.addEventListener('click', onRestart);
  document.getElementById('confirm-setup-btn')?.addEventListener('click', onConfirmSetup);
  document.getElementById('hint-btn')?.addEventListener('click', onHint);
  document.getElementById('submit-btn')?.addEventListener('click', onSubmit);
  document.getElementById('submit-followup-btn')?.addEventListener('click', onSubmitFollowUp);
  document.getElementById('next-btn')?.addEventListener('click', onNext);
  document.getElementById('restart-btn')?.addEventListener('click', onRestart);
  document.getElementById('retry-btn')?.addEventListener('click', onRestart);
  document.getElementById('export-pdf-btn')?.addEventListener('click', () => window.print());
  document.getElementById('logo-home')?.addEventListener('click', onRestart);
  document.getElementById('nav-progress-btn')?.addEventListener('click', onNavProgress);
  document.getElementById('nav-history-btn')?.addEventListener('click', onNavHistory);
  document.getElementById('back-to-history-btn')?.addEventListener('click', onNavHistory);
  document.querySelectorAll<HTMLButtonElement>('.session-row').forEach((row) => {
    row.addEventListener('click', () => onViewSessionDetail(row.dataset.sessionId!));
  });
  document.querySelectorAll<HTMLInputElement>('.setup-categories input[data-category]').forEach((input) => {
    input.addEventListener('change', () => {
      const slug = input.dataset.category!;
      if (input.checked) state.setupCategories.add(slug);
      else state.setupCategories.delete(slug);
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[name="difficulty"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.setupDifficulty = input.value ? Number(input.value) : null;
    });
  });

  if (state.screen !== 'question') {
    stopTimer();
  }
}

function onGoToSetup(): void {
  state.screen = 'setup';
  state.errorMessage = null;
  render();
}

async function onConfirmSetup(): Promise<void> {
  const setup: SessionSetup = {
    categorySlugs: [...state.setupCategories],
    difficulty: state.setupDifficulty,
  };

  state.busy = true;
  state.errorMessage = null;
  render();
  try {
    state.session = await startSession(setup);
    state.currentIndex = 0;
    state.hint = null;
    state.screen = 'question';
    state.timeRemaining = TIME_BY_DIFFICULTY[state.session.questions[0].difficulty] ?? 300;
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de démarrer la session.';
    state.screen = 'setup';
  } finally {
    state.busy = false;
    render();
    if (state.screen === 'question') {
      startQuestionTimer(state.session!.questions[0].difficulty);
    }
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
    state.followUpAnswered = false;
    state.followUpFeedback = null;
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible d’évaluer la réponse.';
  } finally {
    state.busy = false;
    render();
  }
}

async function onSubmitFollowUp(): Promise<void> {
  const session = state.session!;
  const q = session.questions[state.currentIndex];
  const followUpQuestion = state.lastAnswer!.evaluation.follow_up_question!;
  const textarea = document.getElementById('followup-input') as HTMLTextAreaElement | null;
  const answerText = textarea?.value.trim() ?? '';

  if (!answerText) return;

  state.followUpBusy = true;
  render();
  try {
    const { feedback } = await submitFollowUp(session.session_id, q.question_id, followUpQuestion, answerText);
    state.followUpFeedback = feedback;
    state.followUpAnswered = true;
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible d’envoyer la relance.';
  } finally {
    state.followUpBusy = false;
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
    state.followUpAnswered = false;
    state.followUpFeedback = null;
    state.screen = 'question';
    const nextQuestion = session.questions[state.currentIndex];
    state.timeRemaining = TIME_BY_DIFFICULTY[nextQuestion.difficulty] ?? 300;
    render();
    startQuestionTimer(nextQuestion.difficulty);
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

async function onNavProgress(): Promise<void> {
  state.screen = 'progress';
  state.errorMessage = null;
  render();
  try {
    state.progressData = await getProgress();
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de charger la progression.';
  } finally {
    render();
  }
}

async function onNavHistory(): Promise<void> {
  state.screen = 'history';
  state.errorMessage = null;
  render();
  try {
    state.historyData = await getHistory();
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de charger l’historique.';
  } finally {
    render();
  }
}

async function onViewSessionDetail(sessionId: string): Promise<void> {
  state.screen = 'session-detail';
  state.sessionDetail = null;
  render();
  try {
    state.sessionDetail = await getSessionDetail(sessionId);
  } catch (err) {
    state.errorMessage = err instanceof Error ? err.message : 'Impossible de charger cette session.';
    state.screen = 'error';
  } finally {
    render();
  }
}

function onRestart(): void {
  stopTimer();
  state.screen = 'start';
  state.session = null;
  state.currentIndex = 0;
  state.hint = null;
  state.lastAnswer = null;
  state.results = null;
  state.errorMessage = null;
  state.setupCategories = new Set(CATEGORIES.map((c) => c.slug));
  state.setupDifficulty = null;
  state.followUpAnswered = false;
  state.followUpFeedback = null;
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
