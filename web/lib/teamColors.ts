// Primary national team colors by FIFA three-letter code.
// Used to tint hero gradients and card top-accent strips on the homepage.
const COLORS: Record<string, string> = {
  // Hosts
  USA: "#B22234", CAN: "#FF0000", MEX: "#006847",
  // CONMEBOL (URY = Uruguay in football-data.org)
  BRA: "#FCD116", ARG: "#74ACDF", URU: "#5EB6E4", URY: "#5EB6E4", COL: "#FFD100",
  ECU: "#FFD100", CHI: "#D52B1E", PAR: "#D52B1E", PER: "#D91023",
  VEN: "#CF142B", BOL: "#D52B1E",
  // UEFA
  GER: "#1A1A1A", FRA: "#002395", ESP: "#AA151B", POR: "#006600",
  NED: "#FF6600", BEL: "#EF3340", ITA: "#009246", ENG: "#CF142B",
  SCO: "#003F87", WAL: "#D00C27", NIR: "#003F87", CRO: "#FF0000",
  SUI: "#FF0000", DEN: "#C60C30", SWE: "#006AA7", NOR: "#EF2B2D",
  FIN: "#003580", POL: "#DC143C", AUT: "#ED2939", CZE: "#D7141A",
  SVK: "#005BB5", SVN: "#003DA5", SRB: "#C6363C", BIH: "#002395",
  MNE: "#D4AF37", ALB: "#E41E20", GRE: "#0D5EAF", TUR: "#E30A17",
  ROU: "#002B7F", HUN: "#CE2939", BUL: "#00966E", ISL: "#003897",
  GEO: "#FF0000", AZE: "#0092BC", ARM: "#D90012", UKR: "#FFD700",
  KVX: "#1C3F95",
  // CAF
  MAR: "#C1272D", SEN: "#00853F", CMR: "#007A5E", GHA: "#006B3F",
  NGR: "#008751", CIV: "#F77F00", EGY: "#CE1126", ALG: "#006233",
  TUN: "#E70013", ZAF: "#007A4D", COD: "#007FFF", ANG: "#CC0000",
  MAL: "#14B53A", ETH: "#078930", KEN: "#006600", TAN: "#1EB53A",
  MOZ: "#009A44", ZIM: "#006400", ZAM: "#198A00", UGA: "#FCDC04",
  RWA: "#20603D", GUI: "#CE1126", GAB: "#009E60", CGO: "#009A00",
  CPV: "#003893", BEN: "#008751", MTN: "#006233", BFA: "#EF2B2D",
  NIG: "#E05206", TOG: "#006A4E",
  // AFC (KSA = Saudi Arabia in football-data.org)
  JPN: "#BC002D", KOR: "#C9002B", AUS: "#FFD700", IRN: "#239F40",
  SAU: "#006C35", KSA: "#006C35", QAT: "#8D1B3D", UAE: "#009A44", IRQ: "#CE1126",
  JOR: "#007A3D", IDN: "#CE1126", THA: "#A51931", CHN: "#DE2910",
  IND: "#FF9933", KUW: "#007A3D", BHR: "#CE1126", OMA: "#DB161B",
  UZB: "#1EB53A", TJK: "#CC0001", KGZ: "#E8112D", KAZ: "#00AFCA",
  // OFC
  NZL: "#1A1A1A", FIJ: "#68BFE5", SOL: "#0120C5", VAN: "#009543",
  // CONCACAF (non-hosts); CUW = Curaçao, RSA = South Africa
  HON: "#0073CF", GTM: "#4997D0", SLV: "#0F47AF", CRC: "#002B7F",
  PAN: "#DA121A", JAM: "#FFD100", TRI: "#CE1126", HAI: "#00209F",
  CUB: "#002A8F", CUW: "#003DA5", RSA: "#007A4D",
};

export function teamColor(teamId: string): string {
  return COLORS[teamId] ?? "#7E7892";
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
