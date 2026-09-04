/** ICAO 3-letter airline designators → operator name. Static table; callsign prefix decode only. No routes. */
export const AIRLINES: Record<string, string> = {
  AAL: 'American Airlines', ACA: 'Air Canada', AFR: 'Air France', AIC: 'Air India', ANA: 'All Nippon Airways', ASA: 'Alaska Airlines',
  AUA: 'Austrian Airlines', AZA: 'ITA Airways', BAW: 'British Airways', BCS: 'DHL (European Air Transport)', BEL: 'Brussels Airlines',
  BER: 'airBaltic', BTI: 'airBaltic', CAL: 'China Airlines', CCA: 'Air China', CES: 'China Eastern', CFE: 'BA CityFlyer', CPA: 'Cathay Pacific',
  CSN: 'China Southern', CTN: 'Croatia Airlines', DAL: 'Delta Air Lines', DLH: 'Lufthansa', EIN: 'Aer Lingus', EJU: 'easyJet Europe',
  EZY: 'easyJet', EZS: 'easyJet Switzerland', ETD: 'Etihad', ETH: 'Ethiopian Airlines', EVA: 'EVA Air', EWG: 'Eurowings', EXS: 'Jet2',
  FDX: 'FedEx Express', FIN: 'Finnair', FFT: 'Frontier Airlines', GEC: 'Lufthansa Cargo', GIA: 'Garuda Indonesia', GLO: 'GOL',
  HAL: 'Hawaiian Airlines', IBE: 'Iberia', IBK: 'Norwegian Air International', ICE: 'Icelandair', JAL: 'Japan Airlines', JBU: 'JetBlue',
  JST: 'Jetstar', KAL: 'Korean Air', KLM: 'KLM', LAN: 'LATAM Chile', LOT: 'LOT Polish Airlines', MAS: 'Malaysia Airlines', MSR: 'EgyptAir',
  NAX: 'Norwegian', NKS: 'Spirit Airlines', NOZ: 'Norwegian Air Sweden', OMA: 'Oman Air', PAL: 'Philippine Airlines', PGT: 'Pegasus',
  QFA: 'Qantas', QTR: 'Qatar Airways', RAM: 'Royal Air Maroc', ROT: 'TAROM', RYR: 'Ryanair', RUK: 'Ryanair UK', SAA: 'South African Airways',
  SAS: 'SAS', SIA: 'Singapore Airlines', SKW: 'SkyWest', SWA: 'Southwest Airlines', SWR: 'Swiss', TAP: 'TAP Air Portugal', THA: 'Thai Airways',
  THY: 'Turkish Airlines', TOM: 'TUI Airways', TFL: 'TUI fly Netherlands', TRA: 'Transavia', TVF: 'Transavia France', UAE: 'Emirates',
  UAL: 'United Airlines', UPS: 'UPS Airlines', VIR: 'Virgin Atlantic', VLG: 'Vueling', VOZ: 'Virgin Australia', WJA: 'WestJet', WZZ: 'Wizz Air',
  WUK: 'Wizz Air UK', AEE: 'Aegean Airlines', AFL: 'Aeroflot', ANZ: 'Air New Zealand', ARG: 'Aerolíneas Argentinas', AMX: 'Aeroméxico',
  AVA: 'Avianca', AXM: 'AirAsia', BOX: 'AeroLogic', CLX: 'Cargolux', CKS: 'Kalitta Air', GTI: 'Atlas Air', ABW: 'AirBridgeCargo',
  ENY: 'Envoy Air', RPA: 'Republic Airways', ASH: 'Mesa Airlines', EDV: 'Endeavor Air', PDT: 'Piedmont Airlines', JIA: 'PSA Airlines',
  QXE: 'Horizon Air', CPZ: 'Compass Airlines', GJS: 'GoJet', TCX: 'Thomas Cook', CND: 'Corendon', SXS: 'SunExpress', KZR: 'Air Astana',
  UZB: 'Uzbekistan Airways', AUI: 'Ukraine International', BEE: 'Flybe', LOG: 'Loganair', EZE: 'Eastern Airways', AWC: 'Titan Airways',
  NPT: 'West Atlantic', DHK: 'DHL Air UK', BGA: 'Airbus Transport International', BLX: 'TUI fly Nordic', EJA: 'NetJets', NJE: 'NetJets Europe',
  VJT: 'VistaJet', GAC: 'Gama Aviation', LXJ: 'Flexjet', XOJ: 'XOJET', JTL: 'Jet Linx', OPT: 'Flight Options', PJS: 'Jet Aviation',
  RCH: 'US Air Force (AMC)', RRR: 'Royal Air Force', CFC: 'Canadian Forces', GAF: 'German Air Force', CTM: 'French Air Force', IAM: 'Italian Air Force',
  NAF: 'Royal Netherlands Air Force', BAF: 'Belgian Air Force', DAF: 'Danish Air Force', SVF: 'Swedish Air Force', PLF: 'Polish Air Force',
  HKY: 'Hooters Air', SCX: 'Sun Country', VXP: 'Avelo Airlines', MXY: 'Breeze Airways', AAY: 'Allegiant Air', WSW: 'WestJet Encore',
  JZA: 'Jazz Aviation', POE: 'Porter Airlines', FLE: 'Flair Airlines', SWG: 'Sunwing', TSC: 'Air Transat', VOI: 'Volaris', VIV: 'VivaAerobus',
  IGO: 'IndiGo', VTI: 'Vistara', AXB: 'Air India Express', SEJ: 'SpiceJet', AKJ: 'Akasa Air', CEB: 'Cebu Pacific', VJC: 'VietJet Air',
  HVN: 'Vietnam Airlines', BAV: 'Bamboo Airways', LNI: 'Lion Air', CXA: 'Xiamen Airlines', CHH: 'Hainan Airlines', CSZ: 'Shenzhen Airlines',
  CDG: 'Shandong Airlines', CSC: 'Sichuan Airlines', DKH: 'Juneyao Airlines', CQH: 'Spring Airlines', HDA: 'Cathay Dragon', HKE: 'HK Express',
  APJ: 'Peach', JJP: 'Jetstar Japan', SKY: 'Skymark', ADO: 'Air Do', SFJ: 'StarFlyer', JNA: 'Jin Air', JJA: 'Jeju Air', TWB: "T'way Air",
  ABL: 'Air Busan', ASV: 'Air Seoul', ESR: 'Eastar Jet', AAR: 'Asiana Airlines', MMA: 'Myanmar Airways', RBA: 'Royal Brunei', SLK: 'SilkAir',
  TGW: 'Scoot', MXD: 'Malindo Air', FFM: 'Firefly', BKP: 'Bangkok Airways', NOK: 'Nok Air', TLM: 'Thai Lion Air', TAX: 'Thai AirAsia', ALK: 'SriLankan',
  BBC: 'Biman Bangladesh', PIA: 'Pakistan International', GFA: 'Gulf Air', KAC: 'Kuwait Airways', RJA: 'Royal Jordanian', MEA: 'Middle East Airlines',
  ELY: 'El Al', ISR: 'Israir', AIZ: 'Arkia', SVA: 'Saudia', FAD: 'flyadeal', KNE: 'flynas', ABY: 'Air Arabia', FDB: 'flydubai', KMF: 'Kam Air',
  TAR: 'Tunisair', DAH: 'Air Algérie', KQA: 'Kenya Airways', RWD: 'RwandAir', UGD: 'Uganda Airlines', ETH2: 'Ethiopian Airlines', MAU: 'Air Mauritius',
  AVL: 'Air Aurora', TAM: 'LATAM Brasil', AZU: 'Azul', CMP: 'Copa Airlines', LPE: 'LATAM Peru', LAE: 'LATAM Ecuador', ARE: 'LATAM Colombia',
  AZE: 'Azerbaijan Airlines', GEO: 'Georgian Airways', UTA: 'UTair', SDM: 'Rossiya', SBI: 'S7 Airlines', SVR: 'Ural Airlines', PBD: 'Pobeda',
  ADR: 'Adria Airways', ASL: 'Air Serbia', JAT: 'Air Serbia', BUC: 'Bulgaria Air', CSA: 'Czech Airlines', TVS: 'Smartwings', WMT: 'Wizz Air Malta',
  ELL: 'Estonian Air', LGL: 'Luxair', MAH: 'Malév', OAL: 'Olympic Air', SXD: 'Sundair', GWI: 'Germanwings', DLA: 'Air Dolomiti', CLH: 'Lufthansa CityLine',
  OCN: 'Lufthansa City', LHA: 'Lufthansa', EWE: 'Eurowings Europe', NLY: 'Niki', HLX: 'TUIfly', CFG: 'Condor', LDM: 'Lauda Europe', LWG: 'Luxwing',
  ANE: 'Air Nostrum', IBS: 'Iberia Express', VOE: 'Volotea', AEA: 'Air Europa', EVE: 'Evelop', PVG: 'Privilege Style', WFL: 'World2Fly', SWT: 'Swiftair',
  TVL: 'Travel Service', HOP: 'HOP!', FPO: 'ASL Airlines France', AFH: 'Air Français', FWI: 'Air Caraïbes', CRL: 'Corsair', TAY: 'TNT Airways', MSA: 'Mistral Air',
  NOS: 'Neos', ISS: 'Meridiana', VOE2: 'Volotea', LAV: 'Albastar', LBT: 'Nouvelair', NBT: 'Nesma', BMS: 'Blue Air', ROU: 'Air Canada Rouge', WEN: 'WestJet Encore',
  KAP: 'Cape Air', CJC: 'Colgan Air', AWI: 'Air Wisconsin', TSU: 'Gulf and Caribbean Cargo', ABX: 'ABX Air', ATN: 'Air Transport International', GTI2: 'Atlas Air',
  PAC: 'Polar Air Cargo', SOO: 'Southern Air', CLU: 'Cargolux Italia', MPH: 'Martinair', KLC: 'KLM Cityhopper', TRA2: 'Transavia', ASD: 'Air Sinai',
  NJU: 'NetJets Europe', UGA: 'United Gas', DCM: 'Dot Aviation', SKW2: 'SkyWest', GDA: 'Guardian Air', LIF: 'Life Flight', HEMS: 'Air Ambulance',
  UKP: 'UK Police', POL: 'Police', NPAS: 'National Police Air Service', HLE: 'Helimed', HLI: 'Heli Air', HLF: 'Heli Flight', SAR: 'Search and Rescue', CG: 'Coast Guard',
};

/**
 * Decode the operator from a callsign prefix. Only when the callsign is airline-shaped
 * (3 letters then digits) — "N7124G" is a registration, not an airline.
 */
export function airlineFromCallsign(callsign: string | null | undefined): string | null {
  if (!callsign) return null;
  const c = callsign.trim().toUpperCase();
  const m = /^([A-Z]{3})\d/.exec(c);
  if (!m) return null;
  return AIRLINES[m[1]!] ?? null;
}

/** Display callsign with a thin gap between prefix and flight number, as the HUD asset draws it. */
export function displayCallsign(callsign: string | null | undefined, icao24: string): string {
  if (!callsign || !callsign.trim()) return icao24.toUpperCase();
  const c = callsign.trim().toUpperCase();
  const m = /^([A-Z]{3})(\d[A-Z0-9]*)$/.exec(c);
  return m ? `${m[1]} ${m[2]}` : c;
}
