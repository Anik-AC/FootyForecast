// Maps FIFA three-letter codes to flagcdn.com ISO 3166-1 alpha-2 codes.
// England/Scotland/Wales use the subdivision codes gb-eng/gb-sct/gb-wls.
const FIFA_TO_ISO2: Record<string, string> = {
  // CONCACAF
  USA: "us", CAN: "ca", MEX: "mx", HON: "hn", GTM: "gt", SLV: "sv",
  CRC: "cr", PAN: "pa", JAM: "jm", TRI: "tt", HAI: "ht", CUB: "cu",
  // CONMEBOL
  BRA: "br", ARG: "ar", URU: "uy", COL: "co", CHI: "cl", ECU: "ec",
  PAR: "py", PER: "pe", VEN: "ve", BOL: "bo",
  // UEFA
  GER: "de", FRA: "fr", ESP: "es", POR: "pt", NED: "nl", BEL: "be",
  ITA: "it", ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir",
  CRO: "hr", SUI: "ch", DEN: "dk", SWE: "se", NOR: "no", FIN: "fi",
  POL: "pl", AUT: "at", CZE: "cz", SVK: "sk", SVN: "si", SRB: "rs",
  BIH: "ba", MNE: "me", ALB: "al", GRE: "gr", TUR: "tr", ROU: "ro",
  HUN: "hu", BUL: "bg", ISL: "is", GEO: "ge", AZE: "az", ARM: "am",
  UKR: "ua", KVX: "xk",
  // CAF
  MAR: "ma", SEN: "sn", CMR: "cm", GHA: "gh", NGR: "ng", CIV: "ci",
  EGY: "eg", ALG: "dz", TUN: "tn", ZAF: "za", COD: "cd", ANG: "ao",
  MAL: "ml", ETH: "et", KEN: "ke", TAN: "tz", MOZ: "mz", ZIM: "zw",
  ZAM: "zm", UGA: "ug", RWA: "rw", GUI: "gn", GAB: "ga", CGO: "cg",
  CPV: "cv", BEN: "bj", MTN: "mr", BFA: "bf", NIG: "ne", TOG: "tg",
  // AFC
  JPN: "jp", KOR: "kr", AUS: "au", IRN: "ir", SAU: "sa", QAT: "qa",
  UAE: "ae", IRQ: "iq", JOR: "jo", IDN: "id", THA: "th", CHN: "cn",
  IND: "in", KUW: "kw", BHR: "bh", OMA: "om", UZB: "uz", TJK: "tj",
  KGZ: "kg", KAZ: "kz",
  // OFC
  NZL: "nz", FIJ: "fj", SOL: "sb", VAN: "vu",
};

/** Returns the flagcdn.com image URL for a FIFA 3-letter team code. */
export function flagUrl(teamId: string, size: 40 | 80 | 160 = 160): string {
  const iso2 = FIFA_TO_ISO2[teamId] ?? teamId.toLowerCase().slice(0, 2);
  return `https://flagcdn.com/w${size}/${iso2}.png`;
}
