import { MessageSquare } from 'lucide-react';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { Accordion } from '../components/Accordion';
import { Button } from '../components/ui';
import { faqItems } from '../data/faq';

export default function Faq() {
  return (
    <>
      <Seo title="FAQ" description="Frequently asked questions about API Workbench: pricing, data storage, platforms, OpenAPI sync, protocols, workflows, and plugin safety." path="/faq" />
      <PageHeader eyebrow="Questions & answers" title="Frequently asked questions" lede="Short, honest answers. If yours is missing, ask on GitHub Discussions." />

      <div className="mx-auto max-w-3xl px-6 pb-24">
        <Reveal>
          <Accordion items={faqItems.map((f) => ({ title: f.q, content: <p>{f.a}</p> }))} />
        </Reveal>

        <Reveal className="mt-12 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">Still curious?</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button href={site.discussionsUrl} variant="secondary">
              <MessageSquare size={16} /> Ask on Discussions
            </Button>
            <Button to="/docs">Read the docs</Button>
          </div>
        </Reveal>
      </div>
    </>
  );
}
