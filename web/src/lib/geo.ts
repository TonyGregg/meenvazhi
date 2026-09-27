/**
 * Geodesics, mirroring pipeline/meenvazhi/geo.py.
 *
 * Needed in the app because the home port is a user setting: changing it must
 * recompute every bearing without waiting for a new pipeline run, which would
 * require a signal the boat does not have.
 *
 * Uses Vincenty's inverse formula on the WGS84 ellipsoid so the results match the
 * Python side, which uses geographiclib. A spherical approximation would drift
 * about two kilometres and a fifth of a degree over the distances involved, and
 * src/__tests__/geo.test.ts checks these against the pipeline's golden file for
 * exactly that reason.
 */

export const KM_PER_NAUTICAL_MILE = 1.852;

const A = 6378137.0; // WGS84 semi-major axis, metres
const F = 1 / 298.257223563; // flattening
const B = A * (1 - F);

const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

export interface Vector {
  distanceKm: number;
  distanceNmi: number;
  bearingDeg: number;
  compass: string;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export function compassPoint(bearingDeg: number): string {
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[index] ?? 'N';
}

/**
 * Distance and initial true bearing from point 1 to point 2.
 *
 * Vincenty's inverse solution. It fails to converge only for nearly antipodal
 * points, which cannot arise here, and the iteration cap keeps it bounded anyway.
 */
export function inverse(lat1: number, lon1: number, lat2: number, lon2: number): Vector {
  const L = rad(lon2 - lon1);
  const U1 = Math.atan((1 - F) * Math.tan(rad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(rad(lat2)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinLambda = 0;
  let cosLambda = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cos2Alpha = 0;
  let cos2SigmaM = 0;

  for (let i = 0; i < 200; i += 1) {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) {
      return { distanceKm: 0, distanceNmi: 0, bearingDeg: 0, compass: 'N' };
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;
    const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
    const previous = lambda;
    lambda =
      L +
      (1 - C) *
        F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - previous) < 1e-12) break;
  }

  const uSq = (cos2Alpha * (A * A - B * B)) / (B * B);
  const AA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const BB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    BB *
    sinSigma *
    (cos2SigmaM +
      (BB / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (BB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  const distanceKm = (B * AA * (sigma - deltaSigma)) / 1000;
  const bearing =
    (deg(Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)) + 360) % 360;

  return {
    distanceKm,
    distanceNmi: distanceKm / KM_PER_NAUTICAL_MILE,
    bearingDeg: bearing,
    compass: compassPoint(bearing),
  };
}

/** Decimal degrees to the space-separated DMS a GPS unit's entry screen expects. */
export function toDms(value: number, axis: 'lat' | 'lon'): string {
  const hemisphere = value < 0 ? (axis === 'lat' ? 'S' : 'W') : axis === 'lat' ? 'N' : 'E';
  const totalSeconds = Math.round(Math.abs(value) * 3600);
  const degrees = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${degrees} ${minutes} ${seconds} ${hemisphere}`;
}
