import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * CSS-drawn application mockups — realistic placeholder "screenshots" rendered
 * entirely with markup so they stay crisp at any size and theme. Swap any
 * <AppMockup> for a real <img> capture later without touching page layout.
 */

export type MockupKind =
  | 'requests'
  | 'workflow'
  | 'plugins'
  | 'settings'
  | 'terminal'
  | 'variables'
  | 'diff'
  | 'themes';

type Tone = 'dark' | 'light';

interface Palette {
  frame: string;
  header: string;
  bg: string;
  panel: string;
  border: string;
  text: string;
  subtext: string;
  input: string;
  hover: string;
}

const PALETTES: Record<Tone, Palette> = {
  dark: {
    frame: 'border-zinc-700/70 bg-[#101014]',
    header: 'border-zinc-800 bg-[#16161c]',
    bg: 'bg-[#101014]',
    panel: 'bg-[#16161c]',
    border: 'border-zinc-800',
    text: 'text-zinc-200',
    subtext: 'text-zinc-500',
    input: 'bg-[#1d1d25] border-zinc-700/60',
    hover: 'bg-zinc-800/60',
  },
  light: {
    frame: 'border-zinc-300 bg-white',
    header: 'border-zinc-200 bg-zinc-50',
    bg: 'bg-white',
    panel: 'bg-zinc-50',
    border: 'border-zinc-200',
    text: 'text-zinc-800',
    subtext: 'text-zinc-400',
    input: 'bg-white border-zinc-300',
    hover: 'bg-zinc-100',
  },
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-500',
  POST: 'text-amber-500',
  PUT: 'text-sky-500',
  DELETE: 'text-red-500',
  GRPC: 'text-fuchsia-500',
  WS: 'text-cyan-500',
};

function WindowFrame({ tone, title, children, className }: { tone: Tone; title: string; children: ReactNode; className?: string }) {
  const p = PALETTES[tone];
  return (
    <div className={cn('overflow-hidden rounded-xl border shadow-2xl', p.frame, className)}>
      <div className={cn('flex items-center gap-2 border-b px-3 py-2', p.header)}>
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
          <i className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
        </span>
        <span className={cn('mx-auto flex items-center gap-1.5 text-[10px] font-medium', PALETTES[tone].subtext)}>
          <svg width="10" height="10" viewBox="0 0 64 64" aria-hidden>
            <rect x="4" y="4" width="56" height="56" rx="14" fill="#6366f1" />
          </svg>
          {title} — API Workbench
        </span>
        <span className="w-10" aria-hidden />
      </div>
      {children}
    </div>
  );
}

function TreeRow({ p, method, label, depth = 0, active = false }: { p: Palette; method?: string; label: string; depth?: number; active?: boolean }) {
  return (
    <div
      className={cn('flex items-center gap-1.5 rounded px-1.5 py-[3px] text-[9px]', active && p.hover)}
      style={{ marginLeft: depth * 10 }}
    >
      {method ? (
        <span className={cn('w-7 shrink-0 font-mono font-bold', METHOD_COLORS[method] ?? 'text-zinc-400')}>{method}</span>
      ) : (
        <span className={p.subtext}>▸</span>
      )}
      <span className={cn('truncate', method ? p.subtext : cn('font-medium', p.text))}>{label}</span>
    </div>
  );
}

function RequestsMock({ p }: { p: Palette }) {
  return (
    <div className={cn('flex h-full text-[9px]', p.bg)}>
      <div className={cn('hidden w-[27%] shrink-0 flex-col gap-0.5 border-r p-2 sm:flex', p.border, p.panel)}>
        <div className={cn('mb-1.5 rounded border px-1.5 py-1', p.input, p.subtext)}>⌕ Search collections…</div>
        <TreeRow p={p} label="Payments API" />
        <TreeRow p={p} method="GET" label="/v1/charges" depth={1} />
        <TreeRow p={p} method="POST" label="/v1/charges" depth={1} active />
        <TreeRow p={p} method="GET" label="/v1/charges/{id}" depth={1} />
        <TreeRow p={p} label="Customers" depth={1} />
        <TreeRow p={p} method="GET" label="/v1/customers" depth={2} />
        <TreeRow p={p} method="DELETE" label="/v1/customers/{id}" depth={2} />
        <TreeRow p={p} label="Orders API" />
        <TreeRow p={p} method="WS" label="live order feed" depth={1} />
        <TreeRow p={p} method="GRPC" label="Inventory.Check" depth={1} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn('flex items-center gap-1.5 border-b p-2', p.border)}>
          <span className="rounded bg-amber-500/15 px-1.5 py-1 font-mono font-bold text-amber-500">POST</span>
          <span className={cn('flex-1 truncate rounded border px-2 py-1 font-mono', p.input, p.text)}>
            {'{{baseUrl}}'}/v1/charges
          </span>
          <span className="rounded bg-gradient-to-r from-brand-600 to-brand-500 px-2.5 py-1 font-semibold text-white">Send</span>
        </div>
        <div className={cn('flex gap-3 border-b px-3 pt-1.5', p.border)}>
          {['Params', 'Headers', 'Body', 'Auth', 'Tests'].map((t, i) => (
            <span key={t} className={cn('pb-1.5', i === 2 ? 'border-b-2 border-brand-500 font-semibold text-brand-500' : p.subtext)}>
              {t}
            </span>
          ))}
        </div>
        <div className={cn('flex-1 p-3 font-mono leading-4', p.subtext)}>
          <div>{'{'}</div>
          <div className="pl-3">
            <span className="text-sky-500">"amount"</span>: <span className="text-amber-500">4200</span>,
          </div>
          <div className="pl-3">
            <span className="text-sky-500">"currency"</span>: <span className="text-emerald-500">"usd"</span>,
          </div>
          <div className="pl-3">
            <span className="text-sky-500">"customer"</span>: <span className="text-emerald-500">"{'{{customerId}}'}"</span>
          </div>
          <div>{'}'}</div>
        </div>
        <div className={cn('border-t', p.border, p.panel)}>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono font-bold text-emerald-500">201 Created</span>
            <span className={p.subtext}>142 ms · 1.2 KB</span>
          </div>
          <div className={cn('px-3 pb-2 font-mono leading-4', p.subtext)}>
            <div>
              {'{ '}
              <span className="text-sky-500">"id"</span>: <span className="text-emerald-500">"ch_3Nq…"</span>,{' '}
              <span className="text-sky-500">"status"</span>: <span className="text-emerald-500">"succeeded"</span>
              {' }'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowNode({ p, x, y, icon, label, tone: nodeTone }: { p: Palette; x: string; y: string; icon: string; label: string; tone?: string }) {
  return (
    <div
      className={cn('absolute flex w-[27%] items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-lg', p.input)}
      style={{ left: x, top: y }}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] text-white',
          nodeTone ?? 'bg-brand-500'
        )}
      >
        {icon}
      </span>
      <span className={cn('truncate text-[8.5px] font-medium', p.text)}>{label}</span>
    </div>
  );
}

function WorkflowMock({ p }: { p: Palette }) {
  return (
    <div className={cn('relative h-full', p.bg)}>
      <div
        className="absolute inset-0 opacity-60"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(120,120,140,0.18) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
        aria-hidden
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M 28 22 C 34 22, 32 38, 40 38" vectorEffect="non-scaling-stroke" className="fill-none stroke-brand-500/70" strokeWidth="1.5" />
        <path d="M 62 40 C 70 40, 66 22, 74 22" vectorEffect="non-scaling-stroke" className="fill-none stroke-brand-500/70" strokeWidth="1.5" />
        <path d="M 62 44 C 70 46, 66 66, 74 66" vectorEffect="non-scaling-stroke" className="fill-none stroke-cyan-500/70" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M 16 26 C 16 50, 22 74, 38 78" vectorEffect="non-scaling-stroke" className="fill-none stroke-zinc-500/50" strokeWidth="1.5" />
      </svg>
      <WorkflowNode p={p} x="4%" y="16%" icon="▶" label="Trigger · Manual run" tone="bg-emerald-500" />
      <WorkflowNode p={p} x="38%" y="32%" icon="↗" label="POST /auth/token" />
      <WorkflowNode p={p} x="72%" y="16%" icon="⑃" label="If status == 200" tone="bg-amber-500" />
      <WorkflowNode p={p} x="72%" y="60%" icon="✎" label="Set {{authToken}}" tone="bg-cyan-600" />
      <WorkflowNode p={p} x="36%" y="72%" icon="∞" label="Loop · each order" tone="bg-fuchsia-500" />
      <div className={cn('absolute bottom-2 right-2 h-12 w-16 rounded border p-1', p.input)} aria-hidden>
        <div className="h-full w-full rounded-sm bg-brand-500/10" />
      </div>
      <div className={cn('absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px]', p.input, p.subtext)}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Run passed · 8 steps · 1.4 s
      </div>
    </div>
  );
}

function PluginsMock({ p }: { p: Palette }) {
  const rows = [
    { name: 'CSV Importer', id: 'com.acme.csv-importer', caps: ['importer'], on: true },
    { name: 'Header Token Auth', id: 'com.acme.header-token', caps: ['auth provider'], on: true },
    { name: 'UUID Node', id: 'com.acme.uuid-node', caps: ['workflow node'], on: true },
    { name: 'Interactive Echo', id: 'com.acme.echo', caps: ['request type', 'network'], on: false },
  ];
  return (
    <div className={cn('flex h-full flex-col text-[9px]', p.bg)}>
      <div className={cn('flex items-center justify-between border-b p-2.5', p.border)}>
        <span className={cn('text-[10px] font-semibold', p.text)}>Plugin Manager</span>
        <span className="rounded bg-gradient-to-r from-brand-600 to-brand-500 px-2 py-1 font-semibold text-white">Install from file…</span>
      </div>
      <div className="flex-1 space-y-1.5 p-2.5">
        {rows.map((r) => (
          <div key={r.id} className={cn('flex items-center gap-2 rounded-lg border p-2', p.input)}>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-accent-500 text-[10px] text-white">
              ◆
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate font-semibold', p.text)}>{r.name}</span>
              <span className={cn('block truncate font-mono', p.subtext)}>{r.id} · v1.0.0</span>
            </span>
            <span className="hidden gap-1 md:flex">
              {r.caps.map((c) => (
                <span key={c} className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-brand-500">
                  {c}
                </span>
              ))}
            </span>
            <span className={cn('relative h-3.5 w-6 rounded-full', r.on ? 'bg-brand-500' : 'bg-zinc-500/40')} aria-hidden>
              <i className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white', r.on ? 'right-0.5' : 'left-0.5')} />
            </span>
          </div>
        ))}
      </div>
      <div className={cn('border-t p-2', p.border, p.panel)}>
        <span className={p.subtext}>⚠ Interactive Echo requests capability: network — awaiting your approval</span>
      </div>
    </div>
  );
}

function SettingsMock({ p }: { p: Palette }) {
  return (
    <div className={cn('flex h-full text-[9px]', p.bg)}>
      <div className={cn('hidden w-[26%] shrink-0 flex-col gap-1 border-r p-2 sm:flex', p.border, p.panel)}>
        {['General', 'Appearance', 'Editor', 'Network', 'Shortcuts', 'Data & Backup', 'Plugins', 'About'].map((s, i) => (
          <span key={s} className={cn('rounded px-2 py-1', i === 1 ? cn(p.hover, 'font-semibold text-brand-500') : p.subtext)}>
            {s}
          </span>
        ))}
      </div>
      <div className="flex-1 space-y-3 p-3">
        <div>
          <span className={cn('mb-1.5 block font-semibold', p.text)}>Theme</span>
          <div className="flex gap-2">
            {[
              { label: 'Dark', cls: 'bg-[#111116]', active: true },
              { label: 'Light', cls: 'bg-zinc-100', active: false },
              { label: 'System', cls: 'bg-gradient-to-r from-[#111116] to-zinc-100', active: false },
            ].map((t) => (
              <span
                key={t.label}
                className={cn('flex-1 rounded-lg border p-1.5', t.active ? 'border-brand-500 ring-1 ring-brand-500/40' : p.border)}
              >
                <i className={cn('block h-7 rounded', t.cls)} />
                <i className={cn('mt-1 block text-center text-[8px] not-italic', p.subtext)}>{t.label}</i>
              </span>
            ))}
          </div>
        </div>
        {[
          ['Auto-save requests', true],
          ['Send anonymous crash reports', false],
          ['Follow redirects by default', true],
        ].map(([label, on]) => (
          <div key={String(label)} className={cn('flex items-center justify-between rounded-lg border p-2', p.input)}>
            <span className={p.text}>{label as string}</span>
            <span className={cn('relative h-3.5 w-6 rounded-full', on ? 'bg-brand-500' : 'bg-zinc-500/40')} aria-hidden>
              <i className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white', on ? 'right-0.5' : 'left-0.5')} />
            </span>
          </div>
        ))}
        <div>
          <span className={cn('mb-1 block font-semibold', p.text)}>Request timeout</span>
          <span className={cn('block rounded border px-2 py-1 font-mono', p.input, p.subtext)}>30 000 ms</span>
        </div>
      </div>
    </div>
  );
}

function TerminalMock({ p }: { p: Palette }) {
  const lines: Array<[string, string]> = [
    ['12:04:11', 'workflow "Nightly smoke suite" started (24 steps)'],
    ['12:04:11', 'POST /auth/token → 200 OK (89 ms)'],
    ['12:04:12', 'set runtime.authToken = eyJhbGciOi…'],
    ['12:04:12', 'GET /v1/orders?page=1 → 200 OK (134 ms)'],
    ['12:04:13', 'assert status == 200 ✓ · assert body.items.length > 0 ✓'],
    ['12:04:13', 'loop: 18 items → sub-workflow "verify-order"'],
    ['12:04:15', 'WARN retry 1/3: GET /v1/inventory (ETIMEDOUT)'],
    ['12:04:16', 'GET /v1/inventory → 200 OK (2 012 ms)'],
    ['12:04:18', 'run finished: 24 passed · 0 failed · 6.8 s'],
  ];
  return (
    <div className={cn('flex h-full flex-col', p.bg)}>
      <div className={cn('flex gap-3 border-b px-3 pt-2 text-[9px]', p.border)}>
        {['Run Log', 'Console', 'Network'].map((t, i) => (
          <span key={t} className={cn('pb-1.5', i === 0 ? 'border-b-2 border-brand-500 font-semibold text-brand-500' : p.subtext)}>
            {t}
          </span>
        ))}
      </div>
      <div className="flex-1 space-y-1 overflow-hidden p-3 font-mono text-[8.5px] leading-4">
        {lines.map(([ts, msg], i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-zinc-500/70">{ts}</span>
            <span className={msg.startsWith('WARN') ? 'text-amber-500' : msg.includes('finished') ? 'text-emerald-500' : p.subtext}>
              {msg}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-brand-500">❯</span>
          <span className={cn('h-3 w-1.5 animate-pulse', 'bg-brand-500/80')} aria-hidden />
        </div>
      </div>
    </div>
  );
}

function VariablesMock({ p }: { p: Palette }) {
  const rows = [
    ['baseUrl', 'https://api.staging.example.com', 'workspace', false],
    ['apiKey', '•••••••••••••••••', 'workspace', true],
    ['customerId', 'cus_9f2k41', 'collection', false],
    ['authToken', '•••••••••••••••••', 'runtime', true],
    ['retryLimit', '3', 'global', false],
  ] as const;
  return (
    <div className={cn('flex h-full flex-col text-[9px]', p.bg)}>
      <div className={cn('flex items-center justify-between border-b p-2.5', p.border)}>
        <span className={cn('text-[10px] font-semibold', p.text)}>Variables · staging</span>
        <span className={cn('rounded border px-2 py-1', p.input, p.subtext)}>Scope: All ▾</span>
      </div>
      <div className="flex-1 p-2.5">
        <div className={cn('grid grid-cols-[1fr_1.6fr_auto] gap-2 border-b pb-1.5 font-semibold', p.border, p.subtext)}>
          <span>NAME</span>
          <span>VALUE</span>
          <span>SCOPE</span>
        </div>
        {rows.map(([name, value, scope, secret]) => (
          <div key={name} className={cn('grid grid-cols-[1fr_1.6fr_auto] items-center gap-2 border-b py-1.5', p.border)}>
            <span className={cn('flex items-center gap-1 font-mono', p.text)}>
              {secret && <span className="text-amber-500">🔒</span>}
              {name}
            </span>
            <span className={cn('truncate font-mono', p.subtext)}>{value}</span>
            <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-brand-500">{scope}</span>
          </div>
        ))}
        <div className={cn('mt-2 rounded-lg border border-dashed p-2 text-center', p.border, p.subtext)}>
          Secrets are encrypted with the OS keychain and never leave the main process
        </div>
      </div>
    </div>
  );
}

function DiffMock({ p }: { p: Palette }) {
  return (
    <div className={cn('flex h-full flex-col text-[9px]', p.bg)}>
      <div className={cn('flex items-center justify-between border-b p-2.5', p.border)}>
        <span className={cn('text-[10px] font-semibold', p.text)}>OpenAPI Sync · payments-v1.4.yaml</span>
        <span className="flex gap-1.5">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500">+4 added</span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-500">2 changed</span>
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-500">−1 removed</span>
        </span>
      </div>
      <div className="flex-1 space-y-0.5 p-2.5 font-mono leading-4">
        <div className={p.subtext}>  paths:</div>
        <div className="rounded bg-emerald-500/10 px-1 text-emerald-500">+ /v1/refunds: post — Create refund</div>
        <div className="rounded bg-emerald-500/10 px-1 text-emerald-500">+ /v1/refunds/{'{id}'}: get — Retrieve refund</div>
        <div className={cn('px-1', p.subtext)}>  /v1/charges: post — Create charge</div>
        <div className="rounded bg-amber-500/10 px-1 text-amber-500">~ /v1/charges/{'{id}'}: get — new query param `expand`</div>
        <div className="rounded bg-red-500/10 px-1 text-red-500">− /v1/legacy/tokens: post — Deprecated endpoint</div>
        <div className={cn('px-1', p.subtext)}>  /v1/customers: get — List customers</div>
      </div>
      <div className={cn('flex items-center justify-between border-t p-2', p.border, p.panel)}>
        <span className={p.subtext}>Manual edits on 3 requests will be preserved</span>
        <span className="flex gap-1.5">
          <span className={cn('rounded border px-2 py-1', p.input, p.subtext)}>Review conflicts</span>
          <span className="rounded bg-gradient-to-r from-brand-600 to-brand-500 px-2 py-1 font-semibold text-white">Merge safely</span>
        </span>
      </div>
    </div>
  );
}

function ThemesMock({ p }: { p: Palette }) {
  return (
    <div className={cn('flex h-full text-[9px]', p.bg)}>
      {(['dark', 'light'] as Tone[]).map((tone) => {
        const q = PALETTES[tone];
        return (
          <div key={tone} className={cn('flex flex-1 flex-col', q.bg, tone === 'dark' ? '' : 'border-l', p.border)}>
            <div className={cn('border-b px-2.5 py-1.5 font-semibold', q.border, q.text)}>
              {tone === 'dark' ? 'Dark theme' : 'Light theme'}
            </div>
            <div className="flex-1 space-y-1.5 p-2.5">
              <div className={cn('flex items-center gap-1.5 rounded border px-1.5 py-1', q.input)}>
                <span className="font-mono font-bold text-emerald-500">GET</span>
                <span className={cn('truncate font-mono', q.subtext)}>/v1/customers</span>
              </div>
              <div className={cn('rounded border p-1.5 font-mono leading-4', q.input, q.subtext)}>
                <span className="text-sky-500">"status"</span>: <span className="text-emerald-500">"active"</span>
              </div>
              <div className="flex gap-1">
                <span className="h-4 flex-1 rounded bg-brand-500/80" />
                <span className="h-4 flex-1 rounded bg-accent-500/80" />
                <span className="h-4 flex-1 rounded bg-fuchsia-500/70" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const BODIES: Record<MockupKind, (p: Palette) => ReactNode> = {
  requests: (p) => <RequestsMock p={p} />,
  workflow: (p) => <WorkflowMock p={p} />,
  plugins: (p) => <PluginsMock p={p} />,
  settings: (p) => <SettingsMock p={p} />,
  terminal: (p) => <TerminalMock p={p} />,
  variables: (p) => <VariablesMock p={p} />,
  diff: (p) => <DiffMock p={p} />,
  themes: (p) => <ThemesMock p={p} />,
};

export const MOCKUP_TITLES: Record<MockupKind, string> = {
  requests: 'Request Editor',
  workflow: 'Workflow Designer',
  plugins: 'Plugin Manager',
  settings: 'Settings',
  terminal: 'Run Log',
  variables: 'Variables & Secrets',
  diff: 'OpenAPI Sync',
  themes: 'Themes',
};

interface AppMockupProps {
  kind: MockupKind;
  tone?: Tone;
  className?: string;
  /** Aspect ratio class, defaults to a laptop-ish 16/10. */
  aspect?: string;
}

/** A full application window mockup of the given screen. */
export function AppMockup({ kind, tone = 'dark', className, aspect = 'aspect-[16/10]' }: AppMockupProps) {
  const p = PALETTES[tone];
  return (
    <WindowFrame tone={tone} title={MOCKUP_TITLES[kind]} className={className}>
      <div className={cn(aspect, 'select-none')}>{BODIES[kind](p)}</div>
    </WindowFrame>
  );
}
