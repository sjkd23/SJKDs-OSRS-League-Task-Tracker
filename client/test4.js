const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Programming/OSRS/SJKD\'s League Task Tracker/client/public/data/LEAGUE_5.full.json'));
const ds = data.find(t => t.structId === 1993);
console.log(JSON.stringify(ds.descriptionParts, null, 2));
