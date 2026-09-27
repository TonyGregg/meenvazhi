# INCOIS access notes

How the Potential Fishing Zone advisory is actually retrieved, and the four
specific ways the page misleads a scraper. Investigated against the live site on
2026-09-27; every claim below was verified with a real request, none is inferred.

**Read this before changing `meenvazhi/parse.py`.** When INCOIS redesigns their
page, this document is the difference between an hour of work and a day of it.

---

## There is no API, and no AJAX on the path that matters

The sector dropdown is not a form post and not an XHR. It is a plain navigation:

```html
<select onchange="window.location.href=this.value">
  <option value='TextData;jsessionid=E13DA...?secid=SEC004'>KARNATAKA</option>
```

So the advisory is reachable in two GETs. The `;jsessionid=...` path parameter in those option
values is decorative; an ordinary cookie jar works.

```
GET https://incois.gov.in/MarineFisheries/TextDataHome?mfid=1&request_locale=en
    -> Set-Cookie: JSESSIONID=...; Path=/MarineFisheries; HttpOnly; Secure

GET https://incois.gov.in/MarineFisheries/TextData?secid=SEC004   (with that cookie)
    -> 50 KB sector page containing the advisory table
```

## The most important finding: a cookieless request lies

Request a sector page with no session cookie and you get **HTTP 200 and no error**. The body is
a 34 KB shell with zero tables, no sector name anywhere, and no cloud-cover message. It is
indistinguishable from "no advisory" unless you look for the right marker.

A naive scraper would record that as "no fish today" every single day and never fail a build.

**The reliable discriminator is an HTML comment.** Every genuine sector page contains
`<!-- START OF BODY PART OF THIS PAGE -->` exactly once. I verified the counts across all six
captured pages:

| Page | Body marker | Tables | Cloud-cover phrase |
|---|---|---|---|
| Karnataka, populated | 1 | 5 | 0 |
| Kerala, cloudy | 1 | 0 | 1 |
| South Tamil Nadu, cloudy | 1 | 0 | 1 |
| Lakshadweep, cloudy | 1 | 0 | 1 |
| Cookieless shell | 0 | 0 | 0 |
| Home page | 0 | 2 | 0 |

That gives a clean three-way classification. Order matters:

1. No body marker, or no recognised sector name inside it, means `FETCH_FAILED`. Retry, then
   abort the run and leave yesterday's file untouched.
2. Body marker plus a table whose header contains `From the coast of`, with at least one data
   row, means `HAS_ADVISORY`.
3. Body marker plus `No data available for this sector due to excessive cloud cover` in the body
   text means `NO_ADVISORY`, recorded with the reason.
4. Anything else, meaning a real page in an unrecognised shape, is `FETCH_FAILED`. Fail loudly on
   a redesign rather than silently reporting no fish.

## Four traps, each verified, each of which must become a test

- **The `<title>` looks usable but is not sufficient.** Populated pages read
  `Marine Fisheries Advisory Text Data`, cloudy pages read
  `Marine Fisheries Advisory - Text Data Not Available`, the shell reads `Marine Fisheries`. But
  the home page carries the **same title as a populated sector page**, so the title can
  corroborate and never decide. Also each page contains three `<title>` tags and nested duplicate
  `<html>` and `<head>` elements. The markup is malformed. Parse with the `lxml` tree builder and
  always take the first title.
- **Searching for "cloud" matches every page.** All six pages, the failure shell included, load
  Font Awesome from `cdnjs.cloudflare.com`, three hits each. Match the full phrase, case
  insensitive, whitespace normalised, and only inside the body region.
- **Do not index tables positionally.** The populated page has five tables, one of them nested.
  An early count during investigation said four, because a non-greedy regex missed the nested
  one. That is exactly the mistake the code must not repeat. Select the table whose header row contains `From the coast of`.
- **Do not depend on element IDs.** On a populated page `sectorname`, `satmsg`, `forecastdata`
  and `mfsadvisory` all exist. On a legitimately cloudy page **all four are absent**, and the
  sector name is an unlabelled centred bold paragraph just before the cloud-cover sentence.
  Scraping the empty state by ID silently yields nothing.

In both non-failure states the parser extracts the sector name and asserts it matches the name
expected for the requested `secid`. That catches a stale session serving the wrong sector.

## Sector identifiers, all fourteen verified

```
SEC001 GUJARAT          SEC006 SOUTH TAMILNADU        SEC011 WEST BENGAL
SEC002 MAHARASHTRA      SEC007 NORTH TAMILNADU        SEC012 ANDAMAN
SEC003 GOA              SEC008 SOUTH ANDHRA PRADESH   SEC013 NICOBAR
SEC004 KARNATAKA        SEC009 NORTH ANDHRA PRADESH   SEC014 LAKSHADWEEP
SEC005 KERALA           SEC010 ODISHA
```

Configured default is Kerala, Karnataka, Lakshadweep and South Tamil Nadu, as a list in config.

## Table shape

```
From the coast of | Direction | Bearing (deg) | Distance (km) From-To | Depth (mtr) From-To | Latitude (dms) | Longitude (dms)
Karwar            | W         | 270           | 79-84                 | 105-110             | 14 49 10 N     | 73 18 26 E
Hosabettu-Udaivar | SW        | 261           | 108-113               | 944-949             | 12 52 25 N     | 73 46 34 E
```

Degrees, minutes and seconds are space separated with a hemisphere letter and no symbols, and
minutes or seconds may be single digits. Distance and depth stay as ranges rather than being
flattened to a midpoint. The bearing in that table is measured from the named local landing
centre, which is why it cannot be used as-is.

Metadata, on the populated page only: the validity line in `satmsg`
(`SATELLITE DATA SHOWS LIKELY AVAILABILITY OF FISH STOCK TILL  28 SEP 2026`, with a double space,
so parse the date with a tolerant pattern), and the issue timestamp in a hidden
`<p id="updatedDate">` holding `Sun Sep 27 15:26:56 IST 2026`. That IST date is the advisory's
logical date. Note that `dateutil` cannot parse the `IST` token, since it is ambiguous with Irish
Standard Time, so strip the literal and attach `Asia/Kolkata` explicitly.

## Two further endpoints, both of which I recommend against

An undocumented XHR re-renders just the table in your choice of units:

```
GET /MarineFisheries/formattedForecast.action?distanceformat=nmiles&depthformat=metre&latlongformat=dd
```

It works and returns a tidy 5 KB fragment, and it is tempting because it can hand back nautical
miles and decimal degrees directly. **Do not use it for coordinates.** It rounds decimal degrees
to two places, so `14 49 10 N` comes back as `14.82`, discarding up to about 550 m of position.
For a man steering to a waypoint that is the wrong trade. We parse the degrees-minutes-seconds
from the main page and convert ourselves, losing nothing. Unit values, for the record, are
`km|miles|nmiles`, `metre|fathom`, `dms|dd|dmm`.

There is also `download.action?documentType=xls`, a session-scoped spreadsheet export, and a
`POST TextData.action` that filters to a single landing centre via `lcid`. Neither earns its
place. All three go in `docs/INCOIS.md` with the reason, so nobody optimises into them later.

## Politeness

`robots.txt` is a 404, so no rules exist to honour, and the client's existing "no robots file
means allowed" branch handles that correctly with no change. The pipeline still behaves: one run
per day, `Meenvazhi/1.0 (+<repo URL>)` as User-Agent, strictly sequential requests over a single
reused session with a 2 second minimum interval, exponential backoff on retry, no parallelism.
The app credits "Source: INCOIS, Ministry of Earth Sciences, Govt. of India".

## Why recomputing from Kochi is the whole point

Recomputing all 20 Karnataka zones from Cochin Fisheries Harbour, 9.9370 N 76.2610 E:

| | INCOIS, from local coast | Recomputed, from Kochi |
|---|---|---|
| Bearing range | 248 to 270 degrees | 315 to 330 degrees |
| Nearest zone | not given | 229 nmi |
| Farthest zone | not given | 340 nmi |
| Zones within 100 nmi | not given | zero |

Same rows, bearings about 60 degrees apart, and not one zone in that sector is reachable on a
normal trip. Two consequences. Zones are sorted by range from the home port and filtered by a
configurable reachable distance. And "advisories exist, none within range" is a **common** case,
not an edge case, so the empty states get designed first rather than last.

---

