import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CodeBlock } from '../components/CodeBlock';
import { Callout } from '../components/Callout';
import { Tabs } from '../components/Tabs';
import { AppMockup } from '../components/Mockups';
import type { Block } from './types';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Renders inline markdown: `code`, **bold**, *italic*, [label](target). */
export function inline(text: string): ReactNode[] {
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const token = m[0];
    if (token.startsWith('`')) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const match = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (match) {
        const [, label, target] = match;
        out.push(
          target.startsWith('/') ? (
            <Link key={key++} to={target}>
              {label}
            </Link>
          ) : (
            <a key={key++} href={target} target="_blank" rel="noreferrer">
              {label}
            </a>
          )
        );
      }
    }
    last = idx + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((block, i) => {
    switch (block.kind) {
      case 'p':
        return <p key={i}>{inline(block.text)}</p>;
      case 'h2':
        return (
          <h2 key={i} id={slugify(block.text)}>
            {inline(block.text)}
          </h2>
        );
      case 'h3':
        return (
          <h3 key={i} id={slugify(block.text)}>
            {inline(block.text)}
          </h3>
        );
      case 'code':
        return <CodeBlock key={i} code={block.code} lang={block.lang} title={block.title} />;
      case 'callout':
        return (
          <Callout key={i} kind={block.tone} title={block.title}>
            <p>{inline(block.text)}</p>
          </Callout>
        );
      case 'ul':
        return (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        );
      case 'table':
        return (
          <div key={i} className="thin-scroll overflow-x-auto">
            <table>
              <thead>
                <tr>
                  {block.head.map((h, j) => (
                    <th key={j}>{inline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>{inline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'tabs':
        return (
          <Tabs
            key={i}
            items={block.tabs.map((t) => ({ label: t.label, content: <Fragment>{renderBlocks(t.blocks)}</Fragment> }))}
          />
        );
      case 'mockup':
        return (
          <figure key={i} className="my-6">
            <AppMockup kind={block.mockup} className="mx-auto max-w-2xl" />
            {block.caption && (
              <figcaption className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">{block.caption}</figcaption>
            )}
          </figure>
        );
    }
  });
}

/** Plain-text projection of a page's blocks, used to build the search index. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'p':
        case 'h2':
        case 'h3':
          return b.text;
        case 'callout':
          return `${b.title ?? ''} ${b.text}`;
        case 'ul':
        case 'ol':
          return b.items.join(' ');
        case 'table':
          return [...b.head, ...b.rows.flat()].join(' ');
        case 'code':
          return b.title ?? '';
        case 'tabs':
          return b.tabs.map((t) => `${t.label} ${blocksToText(t.blocks)}`).join(' ');
        case 'mockup':
          return b.caption ?? '';
      }
    })
    .join(' ');
}
