import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ThemeProvider } from './lib/theme';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ScrollProgress } from './components/ScrollProgress';
import { BackToTop } from './components/BackToTop';
import { CommandPalette } from './components/CommandPalette';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

const Features = lazy(() => import('./pages/Features'));
const Workflow = lazy(() => import('./pages/Workflow'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const Examples = lazy(() => import('./pages/Examples'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Screenshots = lazy(() => import('./pages/Screenshots'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Faq = lazy(() => import('./pages/Faq'));
const Roadmap = lazy(() => import('./pages/Roadmap'));
const Contributing = lazy(() => import('./pages/Contributing'));
const Changelog = lazy(() => import('./pages/Changelog'));
const About = lazy(() => import('./pages/About'));
const License = lazy(() => import('./pages/License'));
const Contact = lazy(() => import('./pages/Contact'));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center pt-16" role="status" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [pathname, hash]);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  const reduced = useReducedMotion();
  // Docs pages animate internally per-article; group them under one key so the
  // sidebar doesn't remount between doc pages.
  const transitionKey = location.pathname.startsWith('/docs')
    ? '/docs'
    : location.pathname.startsWith('/plugins')
      ? '/plugins'
      : location.pathname;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={transitionKey}
        id="main"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: [0.2, 0.6, 0.3, 1] }}
      >
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/features" element={<Features />} />
            <Route path="/workflow" element={<Workflow />} />
            <Route path="/docs" element={<DocsPage basePath="/docs" />} />
            <Route path="/docs/:slug" element={<DocsPage basePath="/docs" />} />
            <Route path="/plugins" element={<DocsPage basePath="/plugins" />} />
            <Route path="/plugins/:slug" element={<DocsPage basePath="/plugins" />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/screenshots" element={<Screenshots />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/contributing" element={<Contributing />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/about" element={<About />} />
            <Route path="/license" element={<License />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.main>
    </AnimatePresence>
  );
}

function Shell() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-[100] rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <ScrollProgress />
      <Navbar onOpenSearch={() => setSearchOpen(true)} />
      <ScrollToTop />
      <div className="flex-1">
        <AnimatedRoutes />
      </div>
      <Footer />
      <BackToTop />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Shell />
      </BrowserRouter>
    </ThemeProvider>
  );
}
