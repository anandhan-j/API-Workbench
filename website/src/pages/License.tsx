import { BadgeCheck, Ban, Scale, ShieldQuestion } from 'lucide-react';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Reveal, Stagger, StaggerItem } from '../components/Reveal';
import { CodeBlock } from '../components/CodeBlock';
import { Callout } from '../components/Callout';

const LICENSE_TEXT = `MIT License

Copyright (c) ${new Date().getFullYear()} ${site.author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const cards = [
  {
    icon: <BadgeCheck size={20} className="text-emerald-500" />,
    title: 'Permissions',
    tone: 'border-emerald-500/30',
    items: ['Commercial use', 'Modification', 'Distribution', 'Private use', 'Sublicensing'],
  },
  {
    icon: <Scale size={20} className="text-sky-500" />,
    title: 'Conditions',
    tone: 'border-sky-500/30',
    items: ['Include the copyright notice', 'Include the license text in copies or substantial portions'],
  },
  {
    icon: <Ban size={20} className="text-red-500" />,
    title: 'Limitations',
    tone: 'border-red-500/30',
    items: ['No warranty of any kind', 'No liability for the authors', 'No trademark rights granted'],
  },
];

export default function License() {
  return (
    <>
      <Seo title="License" description="API Workbench is MIT licensed — free for commercial use, modification, and distribution, with no warranty." path="/license" />
      <PageHeader eyebrow="Legal, minus the pain" title="MIT License" lede="One of the most permissive open-source licenses there is: do almost anything, just keep the notice and don't sue us." />

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <Stagger className="grid gap-5 md:grid-cols-3">
          {cards.map((card) => (
            <StaggerItem key={card.title} className="h-full">
              <div className={`h-full rounded-2xl border bg-white p-6 dark:bg-zinc-900/70 ${card.tone}`}>
                <p className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50">
                  {card.icon}
                  {card.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {card.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10">
          <Callout kind="note" title="What this means in practice">
            You can use API Workbench at work, ship it to clients, fork it into your own product, and even sell that product —
            as long as the MIT notice travels with the code. The only thing you give up is the right to hold the authors liable
            when something breaks.
          </Callout>
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <ShieldQuestion size={15} />
            Plugins you write are your own — the SDK contract does not impose any license on plugin code.
          </div>
        </Reveal>

        <Reveal className="mt-8">
          <CodeBlock code={LICENSE_TEXT} lang="text" title="LICENSE" />
        </Reveal>
      </div>
    </>
  );
}
