import { createServer, type Server } from 'node:http';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';

import { env } from './env.js';
import { formatCronSchedule } from './utils.js';
import { getSyncStatus, type SyncStatusSnapshot } from './status.js';
import { logger } from './logger.js';

const REFRESH_INTERVAL = 15000;

const pageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Actual Auto Sync · Status Dashboard</title>
    <meta name="description" content="Monitor scheduled syncs and the last run output from Actual Auto Sync." />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #030712;
        --surface: rgba(255, 255, 255, 0.05);
        --panel-border: rgba(255, 255, 255, 0.12);
        --panel-highlight: rgba(114, 248, 212, 0.18);
        --text: #f4f7ff;
        --muted: #a5b5cd;
        --accent: #72f8d4;
        --success: #8ef9b1;
        --warning: #ffb05c;
        --failure: #ff6b6b;
        --card-radius: 24px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: radial-gradient(circle at 20% 20%, rgba(114, 248, 212, 0.24), transparent 45%),
          radial-gradient(circle at 80% 0%, rgba(109, 213, 250, 0.2), transparent 45%), var(--bg);
        font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
        color: var(--text);
      }

      body::after {
        content: '';
        position: fixed;
        inset: 0;
        background: linear-gradient(135deg, rgba(114, 248, 212, 0.05), transparent 40%, rgba(71, 85, 105, 0.4));
        pointer-events: none;
      }

      .app-shell {
        position: relative;
        width: min(1100px, 100% - 3rem);
        margin: 0 auto;
        padding: 3rem 0 4rem;
        z-index: 1;
      }

      .hero {
        margin-bottom: 2.25rem;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.3em;
        font-size: 0.78rem;
        color: var(--muted);
        margin: 0 0 0.35rem;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.5rem, 4vw, 3.5rem);
        line-height: 1.15;
      }

      .subtitle {
        margin: 0.8rem 0 1.5rem;
        color: var(--muted);
        max-width: 680px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.55rem 1.25rem;
        border-radius: 999px;
        border: 1px solid transparent;
        font-weight: 600;
        letter-spacing: 0.04em;
        font-size: 0.85rem;
        transition: border 0.3s ease, background 0.3s ease;
      }

      .status-pill[data-state='running'] {
        background: rgba(114, 248, 212, 0.18);
        border-color: rgba(114, 248, 212, 0.6);
        color: var(--accent);
      }

      .status-pill[data-state='success'] {
        background: rgba(142, 249, 177, 0.2);
        border-color: rgba(142, 249, 177, 0.4);
        color: var(--success);
      }

      .status-pill[data-state='failure'] {
        background: rgba(255, 107, 107, 0.14);
        border-color: rgba(255, 107, 107, 0.5);
        color: var(--failure);
      }

      .status-pill[data-state='idle'] {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.12);
        color: var(--muted);
      }

      .status-pill[data-state='error'] {
        background: rgba(255, 99, 71, 0.15);
        border-color: rgba(255, 99, 71, 0.45);
        color: #ffb2b2;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.5rem;
      }

      .card {
        padding: 1.5rem;
        border-radius: var(--card-radius);
        border: 1px solid var(--panel-border);
        background: rgba(15, 23, 42, 0.6);
        backface-visibility: hidden;
        box-shadow: 0 20px 45px rgba(5, 7, 25, 0.35);
        position: relative;
        overflow: hidden;
        animation: floatCard 0.9s ease forwards;
        animation-fill-mode: both;
      }

      .card::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1px solid rgba(255, 255, 255, 0.02);
        pointer-events: none;
      }

      .card h2 {
        margin: 0.5rem 0;
        font-size: 1.5rem;
      }

      .mono {
        font-size: 0.85rem;
        font-family: 'Space Grotesk', 'JetBrains Mono', 'SFMono-Regular', monospace;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.8rem;
      }

      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        font-size: 0.85rem;
        color: var(--muted);
        flex-wrap: wrap;
      }

      .caption {
        margin: 0.3rem 0;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .muted-label {
        font-size: 0.75rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
      }

      .last-run-panel,
      .budgets-panel {
        margin-top: 1.5rem;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1.75rem;
        border-radius: var(--card-radius);
        box-shadow: 0 30px 55px rgba(3, 7, 18, 0.45);
        animation: floatCard 1.1s ease forwards;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-end;
      }

      .panel-header h3 {
        margin: 0;
        font-size: 1.3rem;
      }

      .last-run-grid {
        margin-top: 1.25rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
      }

      .grid-cell {
        background: rgba(255, 255, 255, 0.02);
        border-radius: 16px;
        padding: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .grid-cell strong {
        display: block;
        font-size: 1rem;
        margin-top: 0.45rem;
      }

      .chip-stack {
        margin-top: 1.25rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .sync-chip {
        padding: 0.6rem 1rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.04);
        font-size: 0.9rem;
        transition: transform 0.2s ease;
      }

      .sync-chip:hover {
        transform: translateY(-2px);
      }

      .sync-chip.placeholder {
        opacity: 0.6;
        border-style: dashed;
      }

      .error-line {
        margin-top: 1rem;
        border-radius: 14px;
        padding: 0.9rem 1rem;
        border: 1px solid rgba(255, 107, 107, 0.4);
        background: rgba(255, 107, 107, 0.1);
        color: #ffdbdb;
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .error-line.hidden {
        display: none;
      }

      @keyframes floatCard {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @media (max-width: 640px) {
        .app-shell {
          width: calc(100% - 1.5rem);
          padding: 2rem 0 3rem;
        }
        .panel-header {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation: none !important;
          transition: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="app-shell">
      <header class="hero">
        <p class="eyebrow">Actual Auto Sync</p>
        <h1>Status dashboard</h1>
        <p class="subtitle">
          A lightweight dashboard that shows when the cron next fires, which budgets are configured, and how the last run
          completed.
        </p>
        <div class="status-pill" data-last-status role="status" aria-live="polite">Loading latest status…</div>
      </header>
      <section class="grid">
        <article class="card">
          <p class="eyebrow">Schedule</p>
          <h2 data-cron-human>Loading cron…</h2>
          <p class="mono" data-cron-schedule>CRON · —</p>
          <div class="meta-row">
            <span>Timezone: <strong data-timezone>—</strong></span>
            <span>Run on start: <strong data-run-on-start>—</strong></span>
          </div>
        </article>
        <article class="card">
          <p class="eyebrow">Next run</p>
          <h2 data-next-run>Awaiting next run</h2>
          <p class="caption" data-next-run-human>—</p>
          <p class="caption"><span class="muted-label">Raw</span> <span data-next-run-raw>—</span></p>
        </article>
        <article class="card">
          <p class="eyebrow">Sync count</p>
          <h2><span data-last-count>0</span> runs</h2>
          <p class="caption">Each cron tick increments this tally.</p>
        </article>
      </section>
      <section class="last-run-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Last sync</p>
            <h3>Timing snapshot</h3>
          </div>
        </div>
        <div class="last-run-grid">
          <div class="grid-cell">
            <p class="eyebrow">Started</p>
            <strong data-last-start>Not run yet</strong>
          </div>
          <div class="grid-cell">
            <p class="eyebrow">Finished</p>
            <strong data-last-end>—</strong>
          </div>
          <div class="grid-cell">
            <p class="eyebrow">Duration</p>
            <strong data-last-duration>—</strong>
          </div>
        </div>
        <p class="error-line hidden" data-last-error-wrapper>
          <span class="eyebrow">Latest error</span>
          <span data-last-error>—</span>
        </p>
      </section>
      <section class="budgets-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Configured budgets</p>
            <p class="caption">Sync IDs derived from <code>ACTUAL_BUDGET_SYNC_IDS</code>.</p>
          </div>
        </div>
        <div class="chip-stack" data-sync-list>
          <span class="sync-chip placeholder">Loading configured budgets…</span>
        </div>
      </section>
    </div>
    <script type="module">
      const REFRESH_INTERVAL = 15000;
      const fallbackText = '—';
      const formatTimestamp = (value) => {
        if (!value) {
          return 'Not run yet';
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return fallbackText;
        }
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(parsed);
      };
      const setText = (selector, value) => {
        const element = document.querySelector(selector);
        if (element) {
          element.textContent = value ?? fallbackText;
        }
      };
      const renderSyncIds = (ids) => {
        const list = document.querySelector('[data-sync-list]');
        if (!list) {
          return;
        }
        list.innerHTML = '';
        if (!ids || ids.length === 0) {
          const placeholder = document.createElement('span');
          placeholder.className = 'sync-chip placeholder';
          placeholder.textContent = 'No sync IDs configured';
          list.appendChild(placeholder);
          return;
        }
        ids.forEach((id, index) => {
          const chip = document.createElement('span');
          chip.className = 'sync-chip';
          chip.textContent = id;
          chip.setAttribute('data-index', String(index + 1));
          list.appendChild(chip);
        });
      };
      const updateStatusBadge = (status) => {
        const badge = document.querySelector('[data-last-status]');
        if (!badge) {
          return;
        }
        if (status.isRunning) {
          badge.textContent = 'Currently running';
          badge.dataset.state = 'running';
        } else if (status.lastSyncResult === 'failure') {
          badge.textContent = 'Last run failed';
          badge.dataset.state = 'failure';
        } else if (status.lastSyncResult === 'success') {
          badge.textContent = 'Last run succeeded';
          badge.dataset.state = 'success';
        } else {
          badge.textContent = 'Awaiting first run';
          badge.dataset.state = 'idle';
        }
      };
      const toggleError = (message) => {
        const wrapper = document.querySelector('[data-last-error-wrapper]');
        const element = document.querySelector('[data-last-error]');
        if (!wrapper || !element) {
          return;
        }
        if (message) {
          element.textContent = message;
          wrapper.classList.remove('hidden');
        } else {
          wrapper.classList.add('hidden');
        }
      };
      const updateDashboard = (payload) => {
        setText('[data-cron-human]', payload.cronHuman);
        setText('[data-cron-schedule]', `CRON · ${payload.cronSchedule}`);
        setText('[data-timezone]', payload.timezone);
        setText('[data-run-on-start]', payload.runOnStart ? 'Yes' : 'No');
        setText('[data-next-run]', payload.nextRunHuman ?? 'Awaiting next run');
        setText('[data-next-run-human]', payload.nextRunHuman ?? 'Awaiting next run');
        setText('[data-next-run-raw]', payload.nextRun ?? '—');
        setText('[data-last-count]', String(payload.status.runCount ?? 0));
        setText('[data-last-start]', formatTimestamp(payload.status.lastSyncStart));
        setText('[data-last-end]', formatTimestamp(payload.status.lastSyncEnd));
        setText('[data-last-duration]', payload.status.lastSyncDuration ?? fallbackText);
        updateStatusBadge(payload.status);
        toggleError(payload.status.lastSyncError);
        renderSyncIds(payload.syncIds ?? []);
      };
      const refreshStatus = async () => {
        try {
          const response = await fetch('/api/status', { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Status request failed with ${response.status}`);
          }
          const payload = await response.json();
          updateDashboard(payload);
        } catch (error) {
          console.error(error);
          const badge = document.querySelector('[data-last-status]');
          if (badge) {
            badge.textContent = 'Unable to load status';
            badge.dataset.state = 'error';
          }
        }
      };
      window.addEventListener('DOMContentLoaded', () => {
        refreshStatus();
        setInterval(refreshStatus, REFRESH_INTERVAL);
      });
    </script>
  </body>
</html>`;

interface WebStatusPayload {
  cronSchedule: string;
  cronHuman: string;
  timezone: string;
  runOnStart: boolean;
  nextRun?: string;
  nextRunHuman?: string;
  syncIds: string[];
  status: SyncStatusSnapshot & {
    lastSyncDuration?: string;
  };
}

function computeDuration(start?: string, end?: string): string | undefined {
  if (!start || !end) {
    return undefined;
  }
  const startDate = DateTime.fromISO(start);
  const endDate = DateTime.fromISO(end);
  if (!startDate.isValid || !endDate.isValid) {
    return undefined;
  }
  const duration = endDate.diff(startDate, ['hours', 'minutes', 'seconds']);
  return duration.toHuman({ style: 'short', maximumFractionDigits: 0 });
}

function buildStatusPayload(cronJob: CronJob<() => void, null>): WebStatusPayload {
  const nextDate = cronJob.nextDate?.();
  const nextRunHuman = nextDate?.setZone(env.TIMEZONE).toLocaleString(DateTime.DATETIME_FULL);
  const statusSnapshot = getSyncStatus();
  return {
    cronSchedule: env.CRON_SCHEDULE,
    cronHuman: formatCronSchedule(env.CRON_SCHEDULE),
    timezone: env.TIMEZONE,
    runOnStart: env.RUN_ON_START,
    nextRun: nextDate?.toISO(),
    nextRunHuman,
    syncIds: env.ACTUAL_BUDGET_SYNC_IDS,
    status: {
      ...statusSnapshot,
      lastSyncDuration: computeDuration(statusSnapshot.lastSyncStart, statusSnapshot.lastSyncEnd),
    },
  };
}

export function startWebUi(cronJob: CronJob<() => void, null>): Server | undefined {
  if (!env.WEB_UI_ENABLED) {
    logger.info('Web UI is disabled via WEB_UI_ENABLED=false');
    return;
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${env.WEB_UI_HOST}:${env.WEB_UI_PORT}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const payload = buildStatusPayload(cronJob);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen(env.WEB_UI_PORT, env.WEB_UI_HOST, () => {
    logger.info(
      { port: env.WEB_UI_PORT, host: env.WEB_UI_HOST },
      'Web UI dashboard listening for status requests',
    );
  });

  server.on('error', (error) => {
    logger.error({ err: error }, 'Web UI server error');
  });

  return server;
}
