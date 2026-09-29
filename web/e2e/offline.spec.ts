import { expect, test } from '@playwright/test';

interface WebManifest {
  name: string;
  short_name: string;
  display: string;
  icons: { src: string; sizes: string; type?: string; purpose?: string }[];
}

/**
 * The test that matters most.
 *
 * A fisherman loads this once in the harbour and then has no signal for a week. If
 * the app does not come back after the network disappears, nothing else about it is
 * worth anything.
 *
 * Run against the built app with a live service worker, on a phone-sized viewport,
 * because that is the only configuration that resembles the real one.
 */

/**
 * Every test runs on the evening the golden advisory was issued: 27 Sep 2026, valid
 * until the 28th. Without this the suite reads the real clock, and the day after
 * that advisory expires the app rightly swaps "saved copy" for "expired" and the
 * tests fail for being right. The staleness test moves the clock itself.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-27T18:00:00Z'));
});

async function waitForServiceWorker(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test.describe('first load, online', () => {
  test('renders the advisory and registers a service worker', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meenvazhi');
    // Nothing is inside the default 120 nmi from Kochi in this advisory, which is
    // the real state of the data.
    await expect(page.getByText(/No zones within/i)).toBeVisible();
    await expect(page.getByText(/Advisory only/)).toBeVisible();
    await waitForServiceWorker(page);
  });

  test('shows the zones once the range is lifted', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('20 zones')).toBeVisible();
    await expect(page.getByText('229 nmi')).toBeVisible();
  });
});

test.describe('offline, after one online load', () => {
  test('the whole app still works with the network cut', async ({ page, context }) => {
    await page.goto('./');
    await expect(page.getByText(/No zones within/i)).toBeVisible();
    await waitForServiceWorker(page);
    // Give the runtime cache a moment to store the advisory response.
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.reload();

    // The shell, the fonts, the data and the disclaimer must all come back.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meenvazhi');
    await expect(page.getByText(/Advisory only/)).toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('20 zones')).toBeVisible();
    await expect(page.getByText('229 nmi')).toBeVisible();
  });

  test('survives the runtime cache being evicted, falling back to IndexedDB', async ({ page, context }) => {
    // The eviction-resilience proof. Browsers drop origin caches under storage
    // pressure, and this app may sit unopened for a week between trips. If the
    // service worker cache were the only copy, the boat would lose the advisory.
    await page.goto('./');
    await expect(page.getByText(/No zones within/i)).toBeVisible();
    await waitForServiceWorker(page);

    // A reload is needed before the runtime cache exists at all. On a first visit
    // the service worker has registered but is not yet controlling the page, so the
    // advisory request never passes through it. That is precisely why the app keeps
    // its own copy in IndexedDB: on the very first trip, nothing else has it.
    await page.reload();
    await page.waitForTimeout(1500);

    const deleted = await page.evaluate(async () => {
      const names = await caches.keys();
      const dataCaches = names.filter((n) => n.includes('pfz-data'));
      await Promise.all(dataCaches.map((n) => caches.delete(n)));
      return dataCaches;
    });
    expect(deleted.length).toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('20 zones')).toBeVisible();
    await expect(page.getByText(/saved copy/i)).toBeVisible();
  });
});

test.describe('offline with nothing stored', () => {
  test('tells the user to open the app once in harbour', async ({ page, context }) => {
    // Load the shell first so the app itself is cached, then clear the data and go
    // offline: this is a fisherman who installed the app but never opened it with a
    // signal.
    await page.goto('./');
    await waitForServiceWorker(page);
    await page.evaluate(async () => {
      indexedDB.deleteDatabase('keyval-store');
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.includes('pfz-data')).map((n) => caches.delete(n)));
    });

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText(/Open this app once in the harbour/i)).toBeVisible();
    // Not an empty list and not a spinner.
    await expect(page.getByText('20 zones')).toHaveCount(0);
  });
});

test.describe('Indic rendering', () => {
  test('renders Malayalam with real glyphs, not missing-glyph boxes', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Language').selectOption('ml');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('മീൻവഴി');
    const zonesTab = page.getByRole('button', { name: 'മേഖലകൾ' });
    await expect(zonesTab).toBeVisible();

    // A font that failed to load renders as missing-glyph boxes or collapses the
    // text, either of which changes its measured width. A text assertion alone
    // cannot tell the difference, because the characters are in the DOM regardless.
    const width = await zonesTab.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(60);

    // Both subset fonts must have actually loaded, not merely been declared.
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded).toContain('Noto Sans Malayalam Subset');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ml');
  });

  test('renders Tamil with real glyphs', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Language').selectOption('ta');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('மீன்வழி');
    const zonesTab = page.getByRole('button', { name: 'மண்டலங்கள்' });
    const width = await zonesTab.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(60);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded).toContain('Noto Sans Tamil Subset');
  });

  test('renders numbers in Latin digits even in Malayalam', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Language').selectOption('ml');
    await page.getByRole('button', { name: 'എല്ലാം' }).click();
    // 229 nautical miles in Latin digits, with the unit abbreviated in Malayalam.
    // The digits stay Latin because they are read against a GPS unit that shows Latin.
    await expect(page.getByText('229 നോ.മൈൽ')).toBeVisible();

    // Assert the property directly rather than matching one string: no Malayalam or
    // Tamil digit ever reaches the screen. A fisherman reads these figures against a
    // GPS unit that shows Latin digits, so localising them would make the app harder
    // to use, not easier.
    const indicDigits = await page.evaluate(() => {
      const text = document.body.innerText;
      return [...text].filter((c) => /[\u0D66-\u0D6F\u0BE6-\u0BEF]/.test(c));
    });
    expect(indicDigits).toEqual([]);
  });
});

test.describe('staleness', () => {
  test('marks an expired advisory in the strongest terms', async ({ page, context }) => {
    await page.goto('./');
    await waitForServiceWorker(page);
    await page.waitForTimeout(1500);

    // Five days after the advisory was issued, which is day five of a trip.
    await context.setOffline(true);
    await page.clock.setFixedTime(new Date('2026-10-02T09:00:00Z'));
    await page.reload();

    await expect(page.getByText(/expired/i)).toBeVisible();
    await expect(page.getByText(/5 days old/)).toBeVisible();
    await expect(page.getByText(/27 Sept 2026/)).toBeVisible();
  });
});

test.describe('installability', () => {
  test('serves a usable web app manifest and icons', async ({ page, request }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref!, page.url());
    const manifest = (await (await request.get(manifestUrl.toString())).json()) as WebManifest;

    expect(manifest.name).toBe('Meenvazhi');
    expect(manifest.short_name).toBe('Meenvazhi');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    // Every icon the manifest promises has to actually exist, or the install
    // prompt silently never appears.
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(response.status(), icon.src).toBe(200);
    }
  });
});

test.describe('layout', () => {
  test('never scrolls sideways on a phone', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('20 zones')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('gives every tap target enough room for a wet finger', async ({ page }) => {
    await page.goto('./');
    const buttons = await page.getByRole('button').all();
    expect(buttons.length).toBeGreaterThan(4);
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (!box) continue;
      expect(box.height, await button.textContent() ?? '').toBeGreaterThanOrEqual(40);
    }
  });
});

test.describe('by area', () => {
  test('lists a whole area in INCOIS order without scrolling sideways', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'By area' }).click();
    await page.getByRole('button', { name: /^Karnataka/ }).click();
    await expect(page.getByText(/Karnataka · 20 zones/)).toBeVisible();
    await expect(page.getByText('Off Karwar')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('works offline too', async ({ page, context }) => {
    await page.goto('./');
    await expect(page.getByText(/No zones within/i)).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForTimeout(1500);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'By area' }).click();
    await page.getByRole('button', { name: /^Karnataka/ }).click();
    await expect(page.getByText(/Karnataka · 20 zones/)).toBeVisible();
  });
});

test.describe('forecast dates and header on a small phone', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const locale of ['en', 'ml', 'ta'] as const) {
    test(`fit without overlapping or wrapping in ${locale}`, async ({ page }) => {
      // Two layout bugs here were invisible to text assertions: the Malayalam name
      // overlapping the language picker, and a date split across two lines.
      await page.goto('./');
      await page.locator('#locale').selectOption(locale);
      await expect(page.locator('.forecast-dates')).toBeVisible();

      const layout = await page.evaluate(() => {
        const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const name = rect('.header__name');
        const controls = rect('.header > .row');
        const overlap = !(name.right <= controls.left || controls.top >= name.bottom - 1);
        const values = [...document.querySelectorAll<HTMLElement>('.forecast-dates__value')];
        const oneLine = values.every(
          (v) => v.getBoundingClientRect().height < parseFloat(getComputedStyle(v).fontSize) * 1.9,
        );
        return { overlap, oneLine, overflow: document.documentElement.scrollWidth - innerWidth };
      });

      expect(layout.overlap).toBe(false);
      expect(layout.oneLine).toBe(true);
      expect(layout.overflow).toBeLessThanOrEqual(1);
    });
  }

  test('shows the golden advisory dates', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Forecast date')).toBeVisible();
    await expect(page.getByText('27 Sept 2026')).toBeVisible();
    await expect(page.getByText('28 Sept 2026')).toBeVisible();
  });
});

