const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Programming/OSRS/SJKD\'s League Task Tracker/client/public/data/LEAGUE_5.full.json'));
let hasDouble = [];
for (const task of data) {
  if (task.nameParts) {
    let name = task.nameParts.map(p => p.text).join('').replace(/\n/g, ' ');
    if (name.includes('  ')) hasDouble.push(name);
  }
}
console.log(hasDouble.slice(0, 10));
