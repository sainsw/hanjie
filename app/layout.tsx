import type { Metadata, Viewport } from 'next';
import { Shippori_Mincho_B1, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';

const mincho = Shippori_Mincho_B1({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-mincho',
  display: 'swap',
});

const gothic = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-gothic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hanjie · Fuji at first light',
  description:
    'A hand-inked nonogram. Read the numbers, fill the grid, and a picture comes out of it.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ead9' },
    { media: '(prefers-color-scheme: dark)', color: '#14161b' },
  ],
};

// Picks the theme before first paint so a night-mode reload never flashes white.
const themeBoot = `try{var t=localStorage.getItem('hanjie:theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='day'}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" data-theme="day" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: tiny pre-paint theme boot */}
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${mincho.variable} ${gothic.variable}`}>
        {children}
      </body>
    </html>
  );
}
