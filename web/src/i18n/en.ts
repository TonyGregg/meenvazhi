/**
 * English strings, and the source of truth for the message shape.
 *
 * `type Messages = typeof en` makes the Malayalam and Tamil files
 * compile-time-complete: a missing key is a build error, not a blank label on a
 * boat.
 *
 * Functions rather than template placeholders, so each language controls its own
 * word order rather than having English grammar imposed on it.
 */
export const en = {
  appName: 'Meenvazhi',
  script: '',
  tagline: 'The way to the fish',

  tabZones: 'Zones',
  tabPlot: 'Plot',
  tabCompass: 'Compass',
  tabSettings: 'Settings',

  online: 'Online',
  offline: 'Offline',
  refresh: 'Refresh',
  refreshing: 'Checking…',

  // Staleness. Safety-critical: never soften these.
  freshToday: 'Today’s advisory',
  freshYesterday: 'Yesterday’s advisory',
  ageDays: (n: number) => (n === 1 ? '1 day old' : `${n} days old`),
  agingWarning: 'This advisory is getting old. Fish move.',
  staleWarning: 'This advisory is out of date. Do not rely on it.',
  expiredWarning: 'This advisory has expired. The zones have moved.',
  noDataWarning: 'No advisory on this device yet.',
  clockWarning: 'Your device clock may be wrong.',
  validUntil: (date: string) => `Valid until ${date}`,
  noValidity: 'No validity date published',
  issued: (date: string) => `Issued ${date}`,
  lastChecked: (time: string) => `Last checked ${time}`,
  usingSavedCopy: 'Showing the saved copy. No signal.',

  // Empty states, all three of them first-class.
  emptyNoAdvisory: 'No fishing zones published today',
  emptyNoAdvisoryWhy: 'Cloud cover stopped the satellite from seeing the sea. This is normal and happens often.',
  emptyOutOfRange: (n: number) => `No zones within ${n} nautical miles`,
  emptyOutOfRangeWhy: 'Zones were published, but all of them are further out than your range. Increase the range to see them.',
  emptyNoData: 'Open this app once in the harbour',
  emptyNoDataWhy: 'While you have a signal, the advisory downloads and stays on your phone for the whole trip.',

  // Zone card.
  steer: 'Steer',
  degreesTrue: '°T',
  nauticalMiles: 'nmi',
  kilometres: 'km',
  depth: 'Depth',
  metres: 'm',
  fromCoastOf: (place: string) => `Off ${place}`,
  coordinates: 'Position',
  copy: 'Copy',
  copied: 'Copied',
  setTarget: 'Set as target',
  clearTarget: 'Clear target',
  target: 'Target',
  incoisSays: (dir: string, deg: number, place: string) => `INCOIS: ${deg}° ${dir} from ${place}`,
  outOfRange: 'Out of range',

  // Filters.
  homePort: 'Home port',
  range: 'Range',
  rangeAll: 'All',
  sortByDistance: 'Nearest first',
  sortByBearing: 'By bearing',
  allSectors: 'All areas',
  zonesFound: (n: number) => (n === 1 ? '1 zone' : `${n} zones`),

  // Plot.
  plotTitle: 'Zones around your home port',
  plotRings: (n: number) => `${n} nmi`,
  plotNoZones: 'Nothing to plot today',

  // Compass.
  compassTitle: 'Course to target',
  compassNoTarget: 'Choose a zone first',
  compassPickZone: 'Pick a zone from the Zones tab and it will show here.',
  headingUnavailable: 'No compass on this device',
  headingFromGps: 'Heading from GPS. Only valid while moving.',
  enableCompass: 'Turn on compass',
  yourPosition: 'Your position',
  distanceToGo: 'To go',
  relativeBearing: 'Turn',
  turnLeft: 'left',
  turnRight: 'right',
  onCourse: 'On course',

  // Export.
  download: 'Download waypoints',
  share: 'Share waypoints',
  exportNote: 'A GPX file with the zones in range. Load it into your GPS.',
  exportEmpty: 'No zones in range to export',

  // Settings.
  language: 'Language',
  theme: 'Screen',
  themeSun: 'Sunlight',
  themeDay: 'Day',
  themeNight: 'Night',
  themeSunWhy: 'Highest contrast, for reading on deck in glare.',
  themeNightWhy: 'Dim red, to keep your night vision in the wheelhouse.',
  storage: 'Storage',
  storageKept: 'The advisory is kept on this device',
  storageNotKept: 'The browser may clear the saved advisory',
  storageUsed: (used: string) => `Using ${used}`,
  updateAvailable: 'A new version is ready',
  updateNow: 'Update',
  updateLater: 'Not now',
  appUpdateNeeded: 'This app is too old to read the latest advisory. Update it in the harbour.',
  about: 'About',
  credits: 'Credits',

  // Two ways to read the zones: nearest to the home port, or area by area as INCOIS lists them.
  viewNearest: 'Nearest to me',
  viewByArea: 'By area',
  area: 'Area',
  inIncoisOrder: 'In the order INCOIS lists them, along the coast',
  areaNoAdvisory: 'No advisory for this area today',
  moreBeyondRange: (n: number, range: number) =>
    n === 1 ? `1 more zone beyond ${range} nmi` : `${n} more zones beyond ${range} nmi`,
  showThem: 'Show them',
  fromCoastIncois: (place: string) => `From ${place} coast · INCOIS`,
  fromYourPort: (port: string) => `From ${port}`,
  sectorNames: {
    SEC004: 'Karnataka',
    SEC005: 'Kerala',
    SEC006: 'South Tamil Nadu',
    SEC007: 'North Tamil Nadu',
    SEC014: 'Lakshadweep',
  } as Record<string, string>,

  // Always present.
  disclaimer: 'Advisory only. Not for navigation or safety of life at sea.',
  credit: 'Source: INCOIS, Ministry of Earth Sciences, Govt. of India',
  bearingsAreTrue: 'All bearings are true, not magnetic.',
  banWest: 'Monsoon fishing ban, 1 June to 31 July, west coast. Confirm this year’s dates.',
  banEast: 'Monsoon fishing ban, 15 April to 14 June, east coast. Confirm this year’s dates.',
};

/**
 * The shape every language must satisfy.
 *
 * Deliberately not `as const` on `en`: literal types would force the Malayalam
 * and Tamil files to repeat the English words verbatim. Widened, a missing or
 * misnamed key is still a compile error, which is the property worth having.
 */
export type Messages = typeof en;
