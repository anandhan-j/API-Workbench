import { motion } from 'motion/react';
import { Compass, Home, Search } from 'lucide-react';
import { Seo } from '../lib/seo';
import { Button } from '../components/ui';

export default function NotFound() {
  return (
    <>
      <Seo title="404 — Page not found" description="This page does not exist." path="/404" />
      <div className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 pt-16 text-center">
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div aria-hidden className="absolute left-1/2 top-1/3 h-72 w-[520px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
        <motion.p
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-gradient relative font-mono text-[9rem] font-extrabold leading-none sm:text-[12rem]"
        >
          404
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="relative">
          <p className="rounded-full border border-red-400/40 bg-red-500/10 px-4 py-1.5 font-mono text-sm text-red-500">
            GET {typeof window !== 'undefined' ? window.location.pathname : '/…'} → 404 Not Found · 0 ms
          </p>
          <h1 className="mt-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">This endpoint doesn't exist</h1>
          <p className="mx-auto mt-2 max-w-md text-zinc-500 dark:text-zinc-400">
            The page may have moved during a docs reshuffle — or the URL has a typo. Try the search, or head back home.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button to="/">
              <Home size={16} /> Home
            </Button>
            <Button to="/docs" variant="secondary">
              <Compass size={16} /> Documentation
            </Button>
            <Button to="/gallery" variant="ghost">
              <Search size={16} /> Explore the gallery
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
