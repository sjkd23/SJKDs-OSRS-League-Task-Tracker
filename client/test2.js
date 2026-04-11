const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Programming/OSRS/SJKD\'s League Task Tracker/client/public/data/LEAGUE_5.full.json'));
let bad = [];
for (const task of data) {
  if (task.nameParts) {
    if (task.nameParts.some(p => p.text.includes('\n'))) bad.push(task.name);
  }
}
console.log('Count:', bad.length);
