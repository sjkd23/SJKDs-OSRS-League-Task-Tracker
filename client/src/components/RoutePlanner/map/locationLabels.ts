export type MapLabelTier = 'major' | 'minor' | 'micro';

export interface MapLocationLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  plane: number;
  minZoom: number;
  maxZoom?: number;
  tier: MapLabelTier;
}

// Curated place labels to keep the map readable while improving orientation.
export const MAP_LOCATION_LABELS: MapLocationLabel[] = [
  // Broad regions (appear first, then fade out as city-level labels appear)
  { id: 'misthalin', name: 'Misthalin', x: 3210, y: 3330, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'asgarnia', name: 'Asgarnia', x: 2970, y: 3360, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'kandarin', name: 'Kandarin', x: 2685, y: 3410, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'morytania', name: 'Morytania', x: 3510, y: 3360, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'wilderness', name: 'Wilderness', x: 3130, y: 3730, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'desert', name: 'Kharidian Desert', x: 3348, y: 3022, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'fremennik', name: 'Fremennik Province', x: 2675, y: 3665, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'tirannwn', name: 'Tirannwn', x: 2275, y: 3268, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'karamja', name: 'Karamja', x: 2900, y: 3025, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'kourend', name: 'Great Kourend', x: 1638, y: 3675, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },

  // Towns and notable places
  { id: 'lumbridge', name: 'Lumbridge', x: 3222, y: 3218, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'varrock', name: 'Varrock', x: 3210, y: 3424, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'grand-exchange', name: 'Grand Exchange', x: 3164, y: 3487, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'falador', name: 'Falador', x: 2964, y: 3380, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'draynor', name: 'Draynor Village', x: 3093, y: 3245, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'alkharid', name: 'Al Kharid', x: 3293, y: 3176, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'edgeville', name: 'Edgeville', x: 3094, y: 3490, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'barb-village', name: 'Barbarian Village', x: 3081, y: 3423, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'seers', name: "Seers' Village", x: 2727, y: 3490, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'catherby', name: 'Catherby', x: 2808, y: 3442, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'ardougne', name: 'Ardougne', x: 2660, y: 3300, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'yanille', name: 'Yanille', x: 2605, y: 3095, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'taverley', name: 'Taverley', x: 2894, y: 3455, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'burthorpe', name: 'Burthorpe', x: 2898, y: 3546, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'port-sarim', name: 'Port Sarim', x: 3011, y: 3194, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'rimmington', name: 'Rimmington', x: 2958, y: 3223, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'canifis', name: 'Canifis', x: 3498, y: 3484, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'mortton', name: "Mort'ton", x: 3490, y: 3288, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'ferox', name: 'Ferox Enclave', x: 3150, y: 3636, plane: 0, minZoom: 8, tier: 'micro' },

  // Desert and western/elf areas
  { id: 'pollnivneach', name: 'Pollnivneach', x: 3358, y: 2967, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'nardah', name: 'Nardah', x: 3414, y: 2918, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'sophanem', name: 'Sophanem', x: 3298, y: 2782, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'shantay', name: 'Shantay Pass', x: 3306, y: 3120, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'lletya', name: 'Lletya', x: 2330, y: 3172, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'prif', name: 'Prifddinas', x: 3230, y: 6085, plane: 0, minZoom: 7, tier: 'minor' },

  // Zeah / Kourend
  { id: 'hosidius', name: 'Hosidius', x: 1746, y: 3538, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'piscarilius', name: 'Port Piscarilius', x: 1803, y: 3715, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'shayzien', name: 'Shayzien', x: 1496, y: 3642, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'lovakengj', name: 'Lovakengj', x: 1500, y: 3740, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'arceuus', name: 'Arceuus', x: 1700, y: 3860, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'karuulm', name: 'Mount Karuulm', x: 1320, y: 3800, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'wintertodt', name: 'Wintertodt Camp', x: 1630, y: 3945, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'fossil-island', name: 'Fossil Island', x: 3720, y: 3810, plane: 0, minZoom: 7, tier: 'minor' },

  // Varlamore (broad regions first, then settlement / landmark labels)
  { id: 'varlamore', name: 'Varlamore', x: 1635, y: 3105, plane: 0, minZoom: 5, maxZoom: 7, tier: 'major' },
  { id: 'civitas-illa-fortis', name: 'Civitas illa Fortis', x: 1708, y: 3138, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'cam-torum', name: 'Cam Torum', x: 1576, y: 2998, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'twilight-temple', name: 'Twilight Temple', x: 1772, y: 3286, plane: 0, minZoom: 7, tier: 'minor' },
  { id: 'tlati-rainforest', name: 'Tlati Rainforest', x: 1470, y: 3110, plane: 0, minZoom: 6, maxZoom: 8, tier: 'major' },
  { id: 'hailstorm-mountains', name: 'Hailstorm Mountains', x: 1522, y: 3242, plane: 0, minZoom: 6, maxZoom: 8, tier: 'major' },
  { id: 'avium-savannah', name: 'Avium Savannah', x: 1802, y: 3038, plane: 0, minZoom: 6, maxZoom: 8, tier: 'major' },
  { id: 'aldarin', name: 'Aldarin', x: 1912, y: 3140, plane: 0, minZoom: 7, tier: 'minor' },

  { id: 'sunset-coast', name: 'Sunset Coast', x: 1460, y: 2945, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'locus-oasis', name: 'Locus Oasis', x: 1690, y: 2905, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'hunter-guild', name: 'Hunter Guild', x: 1800, y: 3032, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'stonecutter-outpost', name: 'Stonecutter Outpost', x: 1550, y: 2972, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'villa-lucens', name: 'Villa Lucens', x: 1880, y: 3200, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'mistrock', name: 'Mistrock', x: 1938, y: 3006, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'moonrise-brewery', name: 'Moonrise Brewery and Winery', x: 1746, y: 3076, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'darkmoon-ravine', name: 'Darkmoon Ravine', x: 1834, y: 2938, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'alchemical-society', name: 'Alchemical Society', x: 1728, y: 3146, plane: 0, minZoom: 9, tier: 'micro' },
  { id: 'ralos-rise', name: "Ralos' Rise", x: 1716, y: 3220, plane: 0, minZoom: 9, tier: 'micro' },
  { id: 'the-teomat', name: 'The Teomat', x: 1758, y: 3192, plane: 0, minZoom: 9, tier: 'micro' },
  { id: 'mons-gratia', name: 'Mons Gratia', x: 1608, y: 3278, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'quetzacalli-gorge', name: 'Quetzacalli Gorge', x: 1512, y: 3050, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'proudspire', name: 'The Proudspire', x: 1494, y: 3362, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'darkfrost', name: 'The Darkfrost', x: 1388, y: 3336, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'river-varla', name: 'River Varla', x: 1698, y: 3050, plane: 0, minZoom: 8, tier: 'micro' },
  { id: 'river-ortus', name: 'River Ortus', x: 1840, y: 3228, plane: 0, minZoom: 8, tier: 'micro' },

  // Selective Civitas internals only (avoid over-dense city text clutter).
  { id: 'fortis-colosseum', name: 'Fortis Colosseum', x: 1678, y: 3118, plane: 0, minZoom: 9, tier: 'micro' },
  { id: 'sunrise-palace', name: 'Sunrise Palace', x: 1730, y: 3154, plane: 0, minZoom: 9, tier: 'micro' },
];