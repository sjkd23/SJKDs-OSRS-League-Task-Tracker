const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Programming/OSRS/SJKD\'s League Task Tracker/client/public/data/LEAGUE_5.full.json'));
let badSpaces = [];
for (const task of data) {
  if (task.nameParts) {
    let nameStr = task.nameParts.map(p => p.text).join('');
    if (nameStr.includes('  ')) badSpaces.push({name: task.name, issue: 'nameParts', parts: task.nameParts});
  }
  if (task.descriptionParts) {
    let descStr = task.descriptionParts.map(p => p.text).join('');
    if (descStr.includes('  ')) badSpaces.push({name: task.name, issue: 'descriptionParts', parts: task.descriptionParts});
  }
}
console.log(JSON.stringify(badSpaces.slice(0, 5), null, 2));
