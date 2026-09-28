# Meenvazhi · മീൻവഴി · மீன்வழி

"The way to the fish."

INCOIS publishes Potential Fishing Zone advisories every day, as an HTML table on a
government web page. They are keyed to whichever landing centre each zone happens
to sit off, written in degrees-minutes-seconds, and gone the moment you lose
signal. For a deep-sea fisherman a week out of Kochi, that is unusable.

Meenvazhi turns that advisory into waypoints someone can actually steer to. A daily
pipeline scrapes and parses it, recomputes every zone's bearing and distance **from
the home port**, and publishes static JSON, GPX and text. An offline-first web app
downloads that while there is still signal and keeps working for the rest of the
trip. Nothing runs on a server, so nothing can go down while the boat is at sea.

> **Advisory only. Not for navigation or safety of life at sea.**
>
> Source: INCOIS, Ministry of Earth Sciences, Govt. of India

## Live

Published daily to GitHub Pages:

| | |
|---|---|
| Site | <https://tonygregg.github.io/meenvazhi/> |
| Advisory JSON | <https://tonygregg.github.io/meenvazhi/data/pfz-latest.json> |
| Waypoints for a GPS unit | <https://tonygregg.github.io/meenvazhi/data/pfz-latest.gpx> |
| Text digest | <https://tonygregg.github.io/meenvazhi/data/pfz-latest.txt> |
| Last run, including failures | <https://tonygregg.github.io/meenvazhi/data/status.json> |

The app and its data share one origin, so there is no CORS to configure and the
service worker stays simple.

## Status

Pipeline and app are both built and running. The app was started before the
plan's three-day soak gate on the pipeline had elapsed, which was a deliberate
call: the scraper had by then been validated against the live site twice and
reproduced the captured fixtures exactly.

| Part | State |
|---|---|
| Python pipeline, parser, geodesics, GPX, publishing | 212 tests, 97% coverage |
| Daily cron, Pages deploy, CI | Running; one manual and one scheduled path verified |
| Progressive web app | 110 unit tests, 12 browser tests, verified offline on the live site |
| Sea-surface-temperature fronts | Deferred; no stable source confirmed |
| Offline basemap, species vocabulary | Not started |

## The app

A ranked list of zones is the home screen, not a map. Bearing and distance from
your home port are the largest things on it. There is also a canvas plot with
range rings, a compass that recomputes the course from the boat's own position,
and GPX export of whatever is in range.

English, Malayalam and Tamil, with the fonts subsetted and self-hosted so they
work with no network. Digits stay Latin in every language, because they are read
against a GPS unit that shows Latin digits. Three screen modes, defaulting to a
high-contrast sunlight mode, with a dim red night mode that preserves dark
adaptation in the wheelhouse.

Map tiles are deliberately never cached. Bulk-caching OpenStreetMap tiles is
against the tile usage policy, and a 350 nautical mile radius of the Arabian Sea
is hundreds of megabytes of featureless blue water.

The advisory is kept in IndexedDB, not only in the service worker cache.
Verifying this in a real browser showed exactly why: on a first visit the service
worker has registered but is not yet controlling the page, so the advisory never
passes through it and the runtime cache does not exist yet. On the first trip,
IndexedDB is the only copy there is.

```bash
cd web
npm install
npm run build:full && npm run preview   # service worker is live here, unlike npm run dev
npm test                                # 110 unit tests
npm run test:e2e                        # 12 browser tests, including offline
```

To check the offline behaviour by hand, open the preview, then in DevTools go to
Application, tick Offline under Service Workers, and hard reload. Then delete the
`pfz-data` cache, stay offline and reload again: it should still work, this time
from IndexedDB.

## Why the bearings have to be recomputed

INCOIS reports each zone relative to its nearest landing centre. Recomputing the
same 20 Karnataka zones from Cochin Fisheries Harbour:

| | INCOIS, from local coast | From Kochi |
|---|---|---|
| Bearing range | 248 to 270 degrees | 315 to 330 degrees |
| Nearest zone | not given | 229 nmi |
| Zones within 100 nmi | not given | zero |

Same rows, bearings about 60 degrees apart, and not one zone reachable on a normal
trip. Hence the recomputation, the sort by range from home, and the range filter.

## The bug this project is built to avoid

Request a sector page from INCOIS without a session cookie and it returns **HTTP
200** with an empty page shell: no tables, no sector name, no error. It looks
exactly like a day with no fish.

A scraper that treats "no table" as "no advisory" would report nothing every single
day and never fail a build, and a fisherman would trust it. So the parser
classifies three ways and never collapses them, and a run with any failed sector
publishes nothing rather than half a file. `docs/INCOIS.md` records the access
pattern and the four specific ways the page misleads a scraper.

## Layout

```
pipeline/       Python 3.12 daily pipeline
  meenvazhi/    parse, geo, gpx, build, writer, http, incois, ports, sectors
  tests/        200 tests; fixtures/html holds real pages captured 2026-09-27
public-data/    Published output, committed and served at /data/
web/            The app (not started)
docs/           INCOIS.md, SCHEMA.md
.github/        pipeline.yml (cron), pages.yml (deploy), ci.yml
```

## One-time GitHub setup

Two settings have to be changed by hand. Neither can be done from a workflow.

**Pages.** Settings, then Pages, then set Source to **GitHub Actions**, not a
branch. Until this is done the deploy job fails at `actions/configure-pages` with
`Create Pages site failed. Error: Resource not accessible by integration`. That
action has an `enablement: true` option which looks like it avoids this step, but
the built-in Actions token is not permitted to create a Pages site, so it does not
work.

**Workflow permissions.** Settings, then Actions, then General, then set Workflow
permissions to **Read and write**. The daily pipeline commits the fetched advisory
back to the default branch, so the token needs write access to repository contents.
If that step ever fails with a permission error, this is why.

The Pages deploy is invoked directly by the pipeline rather than triggered by the
data commit, because a push made with the built-in token does not start another
workflow. Without that, the site would keep serving the first day's data forever.

## Running it

```bash
cd pipeline
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt

.venv/bin/python -m pytest                       # 200 tests
.venv/bin/ruff check . && .venv/bin/mypy meenvazhi run_pipeline.py

# Fully offline, from the captured fixtures
.venv/bin/python run_pipeline.py --from-fixtures tests/fixtures/html --out ../public-data -v

# Live, one sector, keeping the HTML for debugging
.venv/bin/python run_pipeline.py --sectors SEC004 --save-html runs/ -v
```

Exit codes: `0` published, `2` refused, `3` fetch or parse failed and previously
published data is untouched, `4` write failed.

Configuration lives in `pipeline/config.yaml`: sectors to fetch, home port,
reachable range, User-Agent, timeouts and history retention.

## Being a good citizen

One run per day. An identifiable User-Agent with a contact URL. Strictly sequential
requests over a single session, with a two-second minimum interval and exponential
backoff. No parallel fetching. INCOIS serves no `robots.txt`, and the client
handles that as "nothing disallowed" rather than treating the 404 as permission to
ignore the question.

## Licence

Code is MIT, see `LICENSE`. The advisories themselves belong to INCOIS and are not
relicensed here, see `DATA-LICENCE.md`.
