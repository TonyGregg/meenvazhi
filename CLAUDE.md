# Meenvazhi conventions

An offline-first app and daily pipeline that turns INCOIS Potential Fishing Zone
advisories into GPS waypoints for a deep-sea fisherman working out of Kochi. He is
50-plus nautical miles offshore for a week at a time with no signal.

**Read `docs/INCOIS.md` before touching `pipeline/meenvazhi/parse.py`.** It records
how the source page is actually retrieved and the four specific ways it misleads a
scraper. None of it is guessable from the code alone.

## The rules that exist for safety, not taste

1. **Never collapse `FETCH_FAILED` into `NO_ADVISORY`.** A sessionless request to
   INCOIS returns HTTP 200 and an empty page shell, indistinguishable from a
   genuinely empty sector. Conflating them would report "no fish today" every day,
   forever, without ever failing a build.
2. **A failed run publishes nothing.** Someone at sea is relying on the file
   already published. Stale-but-known beats partial. Writes are atomic and a run
   with any failed sector leaves the previous advisory untouched.
3. **An all-cloudy run is a success and gets published.** Withholding it leaves
   yesterday's zones on the boat's screen with nothing to say they are superseded.
4. **Keep INCOIS's bearings namespaced apart from ours.** Theirs are measured from
   the local landing centre, ours from the home port, and for real zones they differ
   by about 60 degrees. Confusing them is the worst bug this project could ship.
5. **Coordinates come from DMS, never from `latlongformat=dd`.** That view rounds to
   two decimal places, discarding up to 550 m.
6. **Advisory dates are Asia/Kolkata**, from INCOIS's own timestamp. Never the UTC
   run date: a retry across midnight UTC would relabel yesterday as today.
7. **No `datetime.now()` inside pure functions.** `now` is always a parameter. It is
   what makes the golden tests reproducible.
8. **Locate the data table by its header text**, never by index. The page has five
   tables and that count has already changed once.
9. **GPX waypoint names: six uppercase ASCII alphanumerics at most, no Indic text.**
   Real GPS units truncate longer names and then silently merge the collisions.

## Stack and tooling

Python 3.12, managed with `uv venv --python 3.12 .venv` and
`uv pip install --python .venv/bin/python -r requirements-dev.txt`. Scripts run as
`.venv/bin/python ...`. `httpx` is the HTTP client, not `requests`. Dependencies are
pinned in a plain `requirements.txt`.

`ruff` does both linting and formatting; there is no `black`. Line length 120.
`mypy --strict` over the package. `pytest` with a 90% coverage floor, currently 97%.

```bash
cd pipeline
.venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/mypy meenvazhi run_pipeline.py
.venv/bin/python run_pipeline.py --from-fixtures tests/fixtures/html --out ../public-data -v
```

The web app, when it lands, uses React, TypeScript and Vite with
`vite-plugin-pwa`, `strict: true`, an `@/*` path alias and a flat eslint config.

## Fixtures

`pipeline/tests/fixtures/html/` holds real pages captured from INCOIS on
2026-09-27, with session tokens redacted. They are close to irreplaceable: that day
happened to give us one populated sector, three genuinely cloud-covered sectors and
the sessionless shell together. A populated sector only exists on days when the
satellite got a clear look. Do not regenerate them casually.

Goldens in `fixtures/golden/` are byte-compared. If a change is meant to alter
output, regenerate them deliberately and read the diff.

## Being a good citizen

Up to seven scheduled runs a day, every two hours from 10:00 to 22:00 IST, because
GitHub's cron can run hours late. Two guards keep that cheap and must stay: a
scheduled run makes no request at all once today's advisory is published, and a
run that fetches an advisory identical to the published one writes nothing (not
even `status.json`), so there is nothing to commit or deploy. Each run that does
reach INCOIS: an identifiable User-Agent with a contact URL, strictly sequential
requests over one session with a two-second floor, exponential backoff, no
parallelism. This is a small government service, not a CDN.

## Tone in user-facing text

Every screen says "Advisory only. Not for navigation or safety of life at sea." and
credits INCOIS. Staleness is never hidden and never dismissible. Show the absolute
IST advisory date alongside the relative age, because relative alone is ambiguous
and absolute alone demands arithmetic on a boat.
