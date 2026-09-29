/**
 * The app end to end, with the network and storage stubbed.
 *
 * The cases that matter are the unhappy ones: no signal, no data at all, and an
 * expired advisory. Those are what a fisherman actually meets on day four of a
 * trip, and they are the ones that have to read correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { App } from '../App';

/** In-memory stand-in for IndexedDB, which jsdom does not provide. */
const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: (key: string) => Promise.resolve(store.get(key)),
  set: (key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  },
  del: (key: string) => {
    store.delete(key);
    return Promise.resolve();
  },
}));

function stubNetwork(document: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      document === null
        ? // Stands in for being at sea: the request simply never completes.
          Promise.reject(new Error('network unreachable'))
        : Promise.resolve(new Response(JSON.stringify(document), { status: 200 })),
    ),
  );
}

beforeEach(() => {
  store.clear();
  localStorage.clear();
  vi.stubGlobal('navigator', {
    ...navigator,
    onLine: true,
    languages: ['en-IN'],
    language: 'en-IN',
    clipboard: { writeText: () => Promise.resolve() },
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // The golden advisory was issued 27 Sep 2026 and is valid until the 28th.
  vi.setSystemTime(new Date('2026-09-27T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('with a fresh advisory', () => {
  beforeEach(() => stubNetwork(golden));

  it('shows the zones once loaded', async () => {
    render(<App />);
    // Nothing is in range from Kochi at the default 120 nmi, which is the real
    // state of the data, so the out-of-range empty state is correct here.
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());
    // And it says how many are being hidden, rather than letting them vanish.
    expect(screen.getByText('20 more zones beyond 120 nmi')).toBeInTheDocument();
  });

  it('shows the hidden zones in one tap from the notice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Show them' }));
    expect(await screen.findByText('20 zones')).toBeInTheDocument();
    expect(screen.queryByText(/more zones beyond/)).not.toBeInTheDocument();
  });

  it('shows the zones after the range is lifted', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(await screen.findByText('20 zones')).toBeInTheDocument();
    // The nearest Karnataka zone is 229 nmi from Kochi. Several zones share a
    // bearing of 320, so that one is matched as a group.
    expect(screen.getByText('229')).toBeInTheDocument();
    expect(screen.getAllByText('320').length).toBeGreaterThan(0);
  });

  it('shows INCOIS’s own bearing alongside ours, labelled with where it is measured from', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'All' }));

    // 320 from Kochi versus 261 from the local coast: the whole reason the app
    // recomputes, so both must be on screen and distinguishable.
    expect(await screen.findByText(/INCOIS: 261.*from Hosabettu-Udaivar/)).toBeInTheDocument();
  });

  it('shows no staleness banner on the day of issue', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());
    expect(screen.queryByText(/out of date|expired|getting old/i)).not.toBeInTheDocument();
  });

  it('always shows the disclaimer and the credit', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Advisory only/)).toBeInTheDocument());
    expect(screen.getByText(/Source: INCOIS/)).toBeInTheDocument();
    expect(screen.getByText(/bearings are true/i)).toBeInTheDocument();
  });
});

describe('offline with a saved copy', () => {
  it('falls back to storage and says so', async () => {
    stubNetwork(golden);
    const first = render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());
    first.unmount();

    // Now at sea: the fetch fails and only the stored copy remains.
    stubNetwork(null);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/saved copy/i)).toBeInTheDocument());
    expect(screen.getByText(/Issued/)).toBeInTheDocument();
  });
});

describe('with nothing on the device', () => {
  it('tells the user to open the app once in harbour', async () => {
    stubNetwork(null);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Open this app once in the harbour/i)).toBeInTheDocument());
    expect(screen.getByText(/While you have a signal/i)).toBeInTheDocument();
  });
});

describe('with an expired advisory', () => {
  it('warns in the strongest terms on day five of a trip', async () => {
    stubNetwork(golden);
    const first = render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());
    first.unmount();

    vi.setSystemTime(new Date('2026-10-02T09:00:00Z'));
    stubNetwork(null);
    render(<App />);

    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    // Absolute date and relative age together: relative alone is ambiguous, and
    // absolute alone asks for date arithmetic on a boat.
    expect(screen.getByText(/27 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByText(/5 days old/)).toBeInTheDocument();
  });
});

describe('language', () => {
  beforeEach(() => stubNetwork(golden));

  it('switches the whole interface to Malayalam', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Language'), 'ml');

    expect(await screen.findByText('മേഖലകൾ')).toBeInTheDocument();
    expect(screen.getByText(/അറിയിപ്പ് മാത്രം/)).toBeInTheDocument();
    expect(document.documentElement.getAttribute('lang')).toBe('ml');
  });

  it('starts in Malayalam when the phone asks for it', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: true, languages: ['ml-IN'], language: 'ml-IN' });
    render(<App />);
    expect(await screen.findByText('മേഖലകൾ')).toBeInTheDocument();
  });
});

describe('screen mode', () => {
  beforeEach(() => stubNetwork(golden));

  it('defaults to the sunlight theme rather than following the operating system', async () => {
    render(<App />);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('sun'));
  });

  it('switches to the night theme on request', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Night' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
  });
});

describe('tabs', () => {
  beforeEach(() => stubNetwork(golden));

  it('reaches every screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No zones within/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Plot' }));
    expect(screen.getByRole('img', { name: /Zones around/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Compass' }));
    expect(screen.getByText(/Choose a zone first/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('Credits')).toBeInTheDocument();
  });
});

describe('by area, the way INCOIS lists it', () => {
  beforeEach(() => stubNetwork(golden));

  async function openArea(user: ReturnType<typeof userEvent.setup>, area: RegExp): Promise<void> {
    render(<App />);
    await screen.findByText(/No zones within/i);
    await user.click(screen.getByRole('button', { name: 'By area' }));
    await user.click(screen.getByRole('button', { name: area }));
  }

  it('lists every zone in the area, ignoring the range filter', async () => {
    const user = userEvent.setup();
    await openArea(user, /^Karnataka/);
    // All 20, although none is within the default 120 nmi of Kochi.
    expect(await screen.findByText(/Karnataka · 20 zones/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Set as target' })).toHaveLength(20);
  });

  it('keeps INCOIS order along the coast rather than sorting by distance', async () => {
    const user = userEvent.setup();
    await openArea(user, /^Karnataka/);
    const places = screen.getAllByText(/^Off /).map((el) => el.textContent);
    // Karwar is INCOIS's first row and the farthest from Kochi; nearest-first would
    // put it last.
    expect(places[0]).toBe('Off Karwar');
    expect(places.at(-1)).toBe('Off Hosabettu-Udaivar');
  });

  it('names the origin of each bearing, so the two can never be confused', async () => {
    const user = userEvent.setup();
    await openArea(user, /^Karnataka/);
    // INCOIS's bearing from the local coast, and ours from the home port, both on
    // the first card, each labelled with its place.
    expect((await screen.findAllByText('From Karwar coast · INCOIS'))[0]).toBeInTheDocument();
    expect(screen.getAllByText('From Kochi').length).toBe(20);
    expect(screen.getByText('W 270°')).toBeInTheDocument();
  });

  it('says plainly when an area has no advisory today', async () => {
    const user = userEvent.setup();
    await openArea(user, /^Kerala/);
    expect(await screen.findByText('No advisory for this area today')).toBeInTheDocument();
    expect(screen.getByText(/Cloud cover/)).toBeInTheDocument();
  });

  it('remembers the chosen view and area', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await screen.findByText(/No zones within/i);
    await user.click(screen.getByRole('button', { name: 'By area' }));
    await user.click(screen.getByRole('button', { name: /^Karnataka/ }));
    first.unmount();

    render(<App />);
    expect(await screen.findByText(/Karnataka · 20 zones/)).toBeInTheDocument();
  });

  it('names the areas in Malayalam', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/No zones within/i);
    await user.selectOptions(screen.getByLabelText('Language'), 'ml');
    await user.click(screen.getByRole('button', { name: 'പ്രദേശം അനുസരിച്ച്' }));
    expect(screen.getByRole('button', { name: /^കർണാടക/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^തെക്കൻ തമിഴ്നാട്/ })).toBeInTheDocument();
  });
});

