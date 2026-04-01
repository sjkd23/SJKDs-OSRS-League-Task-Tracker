/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Body: IBM Plex Sans — crisp, neutral, matches wiki body text
        wiki: ['"IBM Plex Sans"', '"Segoe UI"', '"Arial"', 'sans-serif'],
        // Headings: PT Serif — encyclopedia-weight, classic wiki titles
        'wiki-heading': ['"PT Serif"', '"Georgia"', '"Times New Roman"', 'serif'],
      },
      fontSize: {
        'wiki-sm': ['0.8125rem', { lineHeight: '1.4' }],   // 13px
        'wiki-xs': ['0.75rem',   { lineHeight: '1.35' }],  // 12px
      },
      colors: {
        wiki: {
          // ── Page background ──────────────────────────────────────────
          bg:        '#c0a886',   // warm tan/sand
          'bg-dark': '#071022',   // deep navy

          // ── Article/content surface ──────────────────────────────────
          article:        '#e2dbc8',
          'article-dark': '#172136',

          // ── Secondary surface (filter strips, controls) ───────────────
          surface:        '#d8ccb4',
          'surface-dark': '#222e45',

          // ── Mid surface (table headers, active areas) ─────────────────
          mid:        '#d0bd97',
          'mid-dark': '#313e59',

          // ── Borders ───────────────────────────────────────────────────
          border:        '#94866d',
          'border-dark': '#596e96',

          // ── Primary text ──────────────────────────────────────────────
          text:        '#2c2208',
          'text-dark': '#dde3ef',

          // ── Muted / secondary text ────────────────────────────────────
          muted:        '#6b5e47',
          'muted-dark': '#8a9dbf',

          // ── Hyperlinks ────────────────────────────────────────────────
          // Warm amber/tan for light mode (OSRS Wiki beige palette);
          // wiki-style blue for dark mode (matches OSRS Wiki dark theme).
          link:             '#7a5500',
          'link-dark':      '#5b9bd5',
          'link-hover':     '#3d2a00',
          'link-hover-dark':'#7ab3e8',

          // ── Table (kept for wikitable CSS class compatibility) ─────────
          'table-header':      '#d0bd97',
          'table-header-dark': '#222e45',
          'table-bg':          '#e2dbc8',
          'table-bg-dark':     '#172136',
          'table-row-alt':     '#d8ccb4',
          'table-row-alt-dark':'#1e2b40',
        },
        difficulty: {
          easy:   '#2d6b2d',
          medium: '#a06800',
          hard:   '#b82a2a',
          elite:  '#6b2b9e',
          master: '#891a1a',
        },
      },
    },
  },
  plugins: [],
};
