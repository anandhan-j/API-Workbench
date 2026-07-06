import type { ReactNode } from 'react';

/**
 * A tiny dependency-free syntax highlighter for the handful of languages the
 * docs use (ts/js/json/bash/yaml/http). Tokenizes with a per-language regex
 * union and renders spans with Tailwind classes that adapt to the theme.
 */

type TokenKind = 'comment' | 'string' | 'keyword' | 'literal' | 'fn' | 'type' | 'prop' | 'punct' | 'plain';

const KIND_CLASS: Record<TokenKind, string> = {
  comment: 'text-zinc-400 dark:text-zinc-500 italic',
  string: 'text-emerald-600 dark:text-emerald-400',
  keyword: 'text-violet-600 dark:text-violet-400',
  literal: 'text-amber-600 dark:text-amber-400',
  fn: 'text-blue-600 dark:text-sky-400',
  type: 'text-teal-600 dark:text-teal-300',
  prop: 'text-zinc-700 dark:text-zinc-300',
  punct: 'text-zinc-400 dark:text-zinc-500',
  plain: 'text-zinc-700 dark:text-zinc-300',
};

const TS_KEYWORDS =
  /\b(?:import|export|from|const|let|var|function|async|await|return|if|else|for|while|switch|case|break|continue|new|class|extends|implements|interface|type|enum|namespace|declare|readonly|public|private|protected|static|try|catch|finally|throw|typeof|instanceof|in|of|as|satisfies|default|void|delete|yield|abstract|keyof|infer|is)\b/;

interface Rule {
  kind: TokenKind;
  re: RegExp;
}

const RULES: Record<string, Rule[]> = {
  ts: [
    { kind: 'comment', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\// },
    { kind: 'string', re: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/ },
    { kind: 'keyword', re: TS_KEYWORDS },
    { kind: 'literal', re: /\b(?:true|false|null|undefined|NaN|Infinity|this|super)\b|\b\d[\d_]*(?:\.\d+)?\b/ },
    { kind: 'type', re: /\b[A-Z][A-Za-z0-9_]*\b/ },
    { kind: 'fn', re: /\b[a-z_$][A-Za-z0-9_$]*(?=\s*\()/ },
    { kind: 'punct', re: /[{}[\]();,.:<>=+\-*/!?&|]+/ },
  ],
  json: [
    { kind: 'prop', re: /"(?:\\.|[^"\\])*"(?=\s*:)/ },
    { kind: 'string', re: /"(?:\\.|[^"\\])*"/ },
    { kind: 'literal', re: /\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { kind: 'punct', re: /[{}[\]:,]/ },
  ],
  bash: [
    { kind: 'comment', re: /#[^\n]*/ },
    { kind: 'string', re: /"(?:\\.|[^"\\])*"|'[^']*'/ },
    { kind: 'keyword', re: /^\s*(?:npm|npx|node|git|cd|mkdir|curl|brew|winget|sudo|apt|dpkg|chmod|tar|unzip|echo|cat|export)\b/m },
    { kind: 'literal', re: /\s--?[A-Za-z][\w-]*/ },
    { kind: 'fn', re: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/ },
  ],
  yaml: [
    { kind: 'comment', re: /#[^\n]*/ },
    { kind: 'prop', re: /^[ \t-]*[\w."'/-]+(?=\s*:)/m },
    { kind: 'string', re: /"(?:\\.|[^"\\])*"|'[^']*'/ },
    { kind: 'literal', re: /\b(?:true|false|null|on|off)\b|\b\d+(?:\.\d+)?\b/ },
    { kind: 'punct', re: /[:{}[\],&*-]/ },
  ],
  http: [
    { kind: 'keyword', re: /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/m },
    { kind: 'prop', re: /^[A-Za-z-]+(?=:)/m },
    { kind: 'string', re: /\{\{[^}]+\}\}/ },
    { kind: 'literal', re: /\bHTTP\/[\d.]+\b|\b\d{3}\b/ },
  ],
};

const ALIASES: Record<string, string> = {
  typescript: 'ts',
  tsx: 'ts',
  js: 'ts',
  javascript: 'ts',
  jsonc: 'json',
  sh: 'bash',
  shell: 'bash',
  powershell: 'bash',
  yml: 'yaml',
  text: 'plain',
  txt: 'plain',
};

export function highlight(code: string, lang: string): ReactNode[] {
  const rules = RULES[ALIASES[lang] ?? lang];
  if (!rules) return [code];

  const union = new RegExp(rules.map((r) => `(${r.re.source})`).join('|'), 'gm');
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(union)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push(code.slice(last, idx));
    const groupIdx = match.slice(1).findIndex((g) => g !== undefined);
    const kind = rules[groupIdx]?.kind ?? 'plain';
    out.push(
      <span key={key++} className={KIND_CLASS[kind]}>
        {match[0]}
      </span>
    );
    last = idx + match[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
