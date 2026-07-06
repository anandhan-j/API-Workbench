import { site } from '../lib/site';

export interface InstallMethod {
  platform: string;
  icon: string;
  primary: string;
  steps: Array<{ label: string; code?: string; lang?: string }>;
}

export const installMethods: InstallMethod[] = [
  {
    platform: 'Windows',
    icon: 'AppWindow',
    primary: 'Installer (.exe) or portable build',
    steps: [
      { label: 'Download API-Workbench-Setup-x64.exe from the latest GitHub release and run it.' },
      { label: 'Or install with winget once published:', code: 'winget install APIWorkbench.APIWorkbench', lang: 'bash' },
      { label: 'Portable: unzip the win-unpacked archive anywhere and run API Workbench.exe — settings stay in your user profile.' },
    ],
  },
  {
    platform: 'macOS',
    icon: 'Apple',
    primary: 'Universal .dmg (Apple Silicon + Intel)',
    steps: [
      { label: 'Download API-Workbench.dmg from the latest release, open it, and drag the app to Applications.' },
      { label: 'Or install with Homebrew once published:', code: 'brew install --cask api-workbench', lang: 'bash' },
    ],
  },
  {
    platform: 'Linux',
    icon: 'Terminal',
    primary: 'AppImage, .deb, or .rpm',
    steps: [
      { label: 'AppImage: download, make executable, run.', code: 'chmod +x API-Workbench-x86_64.AppImage\n./API-Workbench-x86_64.AppImage', lang: 'bash' },
      { label: 'Debian/Ubuntu:', code: 'sudo dpkg -i api-workbench_amd64.deb', lang: 'bash' },
      { label: 'Fedora/RHEL:', code: 'sudo rpm -i api-workbench.x86_64.rpm', lang: 'bash' },
    ],
  },
  {
    platform: 'From source',
    icon: 'GitFork',
    primary: 'Node 20+ · any platform',
    steps: [
      {
        label: 'Clone, install, and run in development mode:',
        code: `git clone ${site.repoUrl}.git\ncd API-Workbench\nnpm install\nnpm run dev`,
        lang: 'bash',
      },
      { label: 'Produce installers for your platform:', code: 'npm run dist', lang: 'bash' },
    ],
  },
];
