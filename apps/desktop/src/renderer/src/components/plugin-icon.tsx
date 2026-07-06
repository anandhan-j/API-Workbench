import {
  Braces,
  Cloud,
  Cpu,
  Database,
  Download,
  FileText,
  Globe,
  Hash,
  Key,
  Lock,
  Mail,
  MessageSquare,
  Plug,
  Puzzle,
  Shuffle,
  Terminal,
  Timer,
  Upload,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Renders a plugin contribution's declared icon. Contributions carry an icon
 * *name* (never code — the renderer executes nothing from a plugin), resolved
 * here against a fixed allowlist of lucide icons. Unknown or missing names
 * fall back to the generic Puzzle.
 */
const ICONS: Record<string, LucideIcon> = {
  hash: Hash,
  globe: Globe,
  database: Database,
  zap: Zap,
  key: Key,
  lock: Lock,
  upload: Upload,
  download: Download,
  'file-text': FileText,
  braces: Braces,
  plug: Plug,
  'wand-2': Wand2,
  timer: Timer,
  shuffle: Shuffle,
  mail: Mail,
  'message-square': MessageSquare,
  cloud: Cloud,
  terminal: Terminal,
  cpu: Cpu,
  puzzle: Puzzle,
};

/** The lucide component for a contribution icon name (fallback: Puzzle). */
export function pluginIconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Puzzle;
}

export interface PluginIconProps {
  /** Contribution icon name (allowlisted lucide name). */
  icon?: string;
  size?: number;
  className?: string;
}

export function PluginIcon({ icon, size = 14, className }: PluginIconProps): JSX.Element {
  const Icon = pluginIconFor(icon);
  return <Icon size={size} className={className} />;
}
