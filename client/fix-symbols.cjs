const fs = require('fs');
let txt = fs.readFileSync('src/components/RoutePlanner/RoutePlannerPanel.tsx', 'utf8');

// The problematic garbled texts:
txt = txt.replace(/Load â–¾/g, 'Load ▾');
txt = txt.replace(/â†“ Jump to/g, '↓ Jump to');
txt = txt.replace(/â”€/g, '─');
txt = txt.replace(/â€”/g, '—');
txt = txt.replace(/âœ•/g, '✕');
txt = txt.replace(/âœ“/g, '✓');
txt = txt.replace(/Â·/g, '·');
txt = txt.replace(/â€¦/g, '…');

fs.writeFileSync('src/components/RoutePlanner/RoutePlannerPanel.tsx', txt, 'utf8');
console.log('Fixed RoutePlannerPanel.tsx encoding issues.');
