import type { AircraftCategory } from './types';

/**
 * ICAO type designator → render category. The category selects the 3D model and the 2D icon.
 * Legibility lives in the silhouette, so the buckets follow silhouette, not marketing class.
 */
const T: Record<AircraftCategory, string[]> = {
  'wide-body-jet': [
    'A306', 'A30B', 'A310', 'A332', 'A333', 'A337', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346', 'A359', 'A35K', 'A388', 'A3ST',
    'B741', 'B742', 'B743', 'B744', 'B748', 'B74S', 'B74R', 'B762', 'B763', 'B764', 'B772', 'B773', 'B77L', 'B77W', 'B778', 'B779',
    'B788', 'B789', 'B78X', 'MD11', 'DC10', 'IL96', 'IL86', 'IL76', 'C17', 'C5M', 'C5', 'A124', 'A225', 'K35R', 'KC46', 'E767', 'E3TF', 'E3CF',
  ],
  'narrow-body-jet': [
    'A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N', 'B712', 'B721', 'B722', 'B731', 'B732', 'B733', 'B734', 'B735', 'B736',
    'B737', 'B738', 'B739', 'B37M', 'B38M', 'B39M', 'B3XM', 'B752', 'B753', 'MD80', 'MD81', 'MD82', 'MD83', 'MD87', 'MD88', 'MD90',
    'DC91', 'DC93', 'DC94', 'DC95', 'T204', 'TU54', 'B703', 'B707', 'C919', 'BCS1', 'BCS3', 'A20N', 'P8', 'E737', 'B720', 'YK42',
  ],
  'regional-jet': [
    'CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'E135', 'E145', 'E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'E75L', 'E75S', 'SU95',
    'F70', 'F100', 'F28', 'RJ70', 'RJ85', 'RJ1H', 'B461', 'B462', 'B463', 'BA46', 'AN72', 'AN74', 'DC9', 'YK40', 'A148', 'A158', 'MRJ9', 'ARJ2',
  ],
  turboprop: [
    'AT43', 'AT44', 'AT45', 'AT46', 'AT72', 'AT73', 'AT75', 'AT76', 'DH8A', 'DH8B', 'DH8C', 'DH8D', 'DHC6', 'DHC7', 'DHC8', 'SF34', 'SB20',
    'JS31', 'JS32', 'JS41', 'E120', 'F50', 'F27', 'D328', 'B190', 'BE20', 'B350', 'BE9L', 'BE9T', 'BE99', 'BE10', 'BE30', 'PC12', 'PC6T', 'C208',
    'C212', 'CN35', 'C295', 'L410', 'AN26', 'AN24', 'AN12', 'AN32', 'AN30', 'P180', 'TBM7', 'TBM8', 'TBM9', 'TBM', 'KODI', 'C130', 'C30J', 'A400',
    'P3', 'E2', 'C27J', 'C160', 'SW3', 'SW4', 'MU2', 'PAY1', 'PAY2', 'PAY3', 'PAY4', 'P46T', 'M600', 'EPIC', 'DHC4', 'DHC5', 'DHC2', 'DHC3',
    'AT8T', 'ATP', 'L188', 'CVLT', 'CVLP', 'HERN', 'AC90', 'AC95', 'AC6T', 'PC7', 'PC9', 'PC21', 'T6', 'TEX2', 'TUCA', 'ZZZZ',
  ],
  'business-jet': [
    'GLF2', 'GLF3', 'GLF4', 'GLF5', 'GLF6', 'GL5T', 'GL7T', 'GLEX', 'GL6T', 'GA5C', 'GA6C', 'GA7C', 'G150', 'G280', 'GALX', 'G200', 'ASTR', 'WW24',
    'CL30', 'CL35', 'CL60', 'CL64', 'LJ23', 'LJ24', 'LJ25', 'LJ31', 'LJ35', 'LJ36', 'LJ40', 'LJ45', 'LJ55', 'LJ60', 'LJ70', 'LJ75', 'C500', 'C501', 'C510',
    'C525', 'C25A', 'C25B', 'C25C', 'C25M', 'C550', 'C551', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750', 'E50P', 'E55P', 'E545', 'E550',
    'E35L', 'F900', 'F2TH', 'F2EX', 'FA7X', 'FA8X', 'F9EX', 'F9LX', 'FA50', 'FA10', 'FA20', 'FA6X', 'H25A', 'H25B', 'H25C', 'HA4T', 'HDJT', 'PRM1',
    'PC24', 'EA50', 'SF50', 'BE40', 'G100', 'HS25', 'SBR1', 'SBR2', 'DA50', 'DA90', 'LJ28', 'CL10', 'MU30', 'B350', 'S601',
  ],
  helicopter: [
    'A109', 'A119', 'A139', 'A169', 'A189', 'AS32', 'AS3B', 'AS50', 'AS55', 'AS65', 'B06', 'B06T', 'B105', 'B212', 'B222', 'B230', 'B407', 'B412', 'B427',
    'B429', 'B430', 'B505', 'B47G', 'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'H500', 'H60', 'H64', 'R22', 'R44', 'R66', 'S61', 'S64', 'S76',
    'S92', 'UH1', 'UH1Y', 'MD52', 'MD60', 'AW09', 'EH10', 'LYNX', 'PUMA', 'NH90', 'CH47', 'H47', 'H53', 'H1', 'AS332', 'EC30', 'EXPL', 'GAZL', 'ALO2', 'ALO3',
    'S70', 'S65', 'B505', 'B429', 'H135', 'H145', 'H155', 'H160', 'H175', 'H225', 'EC65', 'SCOR', 'CABR', 'ENST', 'F280', 'H269', 'HUCO', 'BK17', 'B47J',
  ],
  'light-piston': [
    'C150', 'C152', 'C162', 'C170', 'C172', 'C175', 'C177', 'C180', 'C182', 'C185', 'C188', 'C190', 'C195', 'C206', 'C207', 'C210', 'P210', 'C303', 'C310',
    'C320', 'C335', 'C336', 'C337', 'C340', 'C401', 'C402', 'C404', 'C411', 'C414', 'C421', 'C425', 'C441', 'P28A', 'P28B', 'P28R', 'P28S', 'P28T', 'P28U',
    'P32R', 'P32T', 'PA11', 'PA12', 'PA14', 'PA15', 'PA16', 'PA17', 'PA18', 'PA20', 'PA22', 'PA23', 'PA24', 'PA25', 'PA27', 'PA30', 'PA31', 'PA32', 'PA34',
    'PA36', 'PA38', 'PA44', 'PA46', 'PA60', 'BE17', 'BE18', 'BE19', 'BE23', 'BE24', 'BE33', 'BE35', 'BE36', 'BE50', 'BE55', 'BE56', 'BE58', 'BE60', 'BE65',
    'BE76', 'BE77', 'BE80', 'BE95', 'SR20', 'SR22', 'S22T', 'DA20', 'DA40', 'DA42', 'DA62', 'DV20', 'M20P', 'M20T', 'M20', 'AA1', 'AA5', 'AC11', 'RV3',
    'RV4', 'RV6', 'RV7', 'RV8', 'RV9', 'RV10', 'RV12', 'RV14', 'CH7A', 'CH7B', 'CH60', 'CH70', 'CH75', 'CH80', 'J3', 'J4', 'J5', 'PTS1', 'PTS2', 'EXTR',
    'EA30', 'EA40', 'G115', 'G120', 'P208', 'TB9', 'TB10', 'TB20', 'TB21', 'TAMP', 'EV97', 'SLG2', 'SLG4', 'CTSW', 'CTLS', 'FDCT', 'TECN', 'P2006', 'P2008',
    'P2010', 'P2012', 'P92', 'P96', 'P68', 'GLID', 'ULAC', 'GYRO', 'BL8', 'BL17', 'DR40', 'DR30', 'DR22', 'DR10', 'RALL', 'S05R', 'S05F', 'TRIN', 'ZODI',
    'SAVG', 'STOL', 'CUBA', 'CUB2', 'LEG2', 'LNC2', 'LNC4', 'LNCE', 'COL3', 'COL4', 'NAVI', 'T34P', 'T34T', 'YK52', 'YK18', 'YK50', 'YK55', 'SU26', 'SU29', 'SU31',
    'CP10', 'CP30', 'ALTO', 'AT3P', 'AT3T', 'AN2', 'HUSK', 'A210', 'A22', 'PIVI', 'VL3', 'SHRK', 'WT9', 'BRAV', 'SIRA', 'SF25', 'SF28', 'SM92', 'AERO',
  ],
  generic: [],
};

const TYPE_TO_CATEGORY = new Map<string, AircraftCategory>();
for (const [cat, codes] of Object.entries(T) as [AircraftCategory, string[]][]) {
  for (const code of codes) if (!TYPE_TO_CATEGORY.has(code)) TYPE_TO_CATEGORY.set(code, cat);
}

/** ADS-B emitter category → the best silhouette guess when no type designator is known. */
const EMITTER_TO_CATEGORY: Record<string, AircraftCategory> = {
  A1: 'light-piston',      // light, < 15 500 lb
  A2: 'business-jet',      // small, 15 500–75 000 lb
  A3: 'narrow-body-jet',   // large, 75 000–300 000 lb
  A4: 'narrow-body-jet',   // high-vortex large (B757)
  A5: 'wide-body-jet',     // heavy, > 300 000 lb
  A6: 'business-jet',      // high performance (> 5 g, > 400 kt)
  A7: 'helicopter',        // rotorcraft
  B1: 'light-piston',      // glider / sailplane
  B4: 'light-piston',      // ultralight
};

const DESC_HINTS: [RegExp, AircraftCategory][] = [
  [/helic|rotor|gyro/i, 'helicopter'],
  [/turboprop|turbo prop|propjet/i, 'turboprop'],
  [/business|bizjet|corporate/i, 'business-jet'],
  [/regional|rj/i, 'regional-jet'],
  [/wide.?body|jumbo|heavy/i, 'wide-body-jet'],
  [/narrow|airliner/i, 'narrow-body-jet'],
  [/piston|single.?engine|light aircraft/i, 'light-piston'],
];

export function categoryForType(typeCode: string | null | undefined): AircraftCategory | null {
  if (!typeCode) return null;
  const k = typeCode.trim().toUpperCase();
  return TYPE_TO_CATEGORY.get(k) ?? null;
}

/**
 * Resolve the render category. Order: exact type designator → readsb type description heuristics
 * → ADS-B emitter category → 'generic'. Never null: a join miss renders the generic mesh, not nothing.
 */
export function resolveCategory(opts: {
  typeCode?: string | null;
  typeDescription?: string | null;
  emitterCategory?: string | null;
}): AircraftCategory {
  const byType = categoryForType(opts.typeCode);
  if (byType) return byType;
  if (opts.typeDescription) {
    for (const [re, cat] of DESC_HINTS) if (re.test(opts.typeDescription)) return cat;
  }
  if (opts.emitterCategory) {
    const c = EMITTER_TO_CATEGORY[opts.emitterCategory.toUpperCase()];
    if (c) return c;
  }
  return 'generic';
}

export const CATEGORY_LABEL: Record<AircraftCategory, string> = {
  'wide-body-jet': 'Wide-body jet',
  'narrow-body-jet': 'Narrow-body jet',
  'regional-jet': 'Regional jet',
  turboprop: 'Turboprop',
  'business-jet': 'Business jet',
  helicopter: 'Helicopter',
  'light-piston': 'Light piston',
  generic: 'Aircraft',
};

/** Real-world overall length in metres per category, used for minimum-legible-size scaling. */
export const CATEGORY_LENGTH_M: Record<AircraftCategory, number> = {
  'wide-body-jet': 68,
  'narrow-body-jet': 37,
  'regional-jet': 32,
  turboprop: 27,
  'business-jet': 20.4,
  helicopter: 11.4,
  'light-piston': 8.3,
  generic: 37,
};

/** Type designators uncommon enough to count as a "rare type" sighting. Extend freely. */
export const RARE_TYPES = new Set([
  'A388', 'A3ST', 'B748', 'B74S', 'A124', 'A225', 'C17', 'C5M', 'IL76', 'IL96', 'B703', 'DC10', 'MD11', 'CONC', 'B52', 'E3TF', 'E3CF', 'E767',
  'K35R', 'KC46', 'A400', 'C130', 'C30J', 'P8', 'P3', 'AN12', 'AN26', 'BE18', 'DC3', 'DC6', 'C46', 'CVLT', 'L188', 'B17', 'B25', 'B29', 'SPIT', 'HURI', 'LANC',
  'TU54', 'T204', 'IL62', 'IL18', 'A148', 'MRJ9', 'SU95', 'C919', 'ARJ2', 'BALL', 'AIRS', 'ZEPP', 'U2', 'SR71', 'F16', 'F15', 'F18', 'F35', 'EUFI', 'TOR', 'RAFL', 'GRIP',
]);

export function isRareType(typeCode: string | null | undefined): boolean {
  return !!typeCode && RARE_TYPES.has(typeCode.trim().toUpperCase());
}
