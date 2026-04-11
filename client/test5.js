const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Programming/OSRS/SJKD\'s League Task Tracker/client/public/data/LEAGUE_5.full.json'));
const ds = data.find(t => t.name.includes('Demon Slayer'));
console.log(JSON.stringify({ n: ds.nameParts, d: ds.descriptionParts }, null, 2));
