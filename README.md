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

## Status

The pipeline is complete and verified against the live site. The web app is not
built yet, deliberately: the plan gates it behind three consecutive days of correct
data in production, because a polished app over a wrong scraper just makes bad data
look authoritative.

| Part | State |
|---|---|
| Python pipeline, parser, geodesics, GPX, publishing | Done, 200 tests, 97% coverage |
| GitHub Actions cron and Pages deploy | Written, pending first real scheduled run |
| Progressive web app | Not started |
| Sea-surface-temperature fronts | Deferred; no stable source confirmed yet |

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
