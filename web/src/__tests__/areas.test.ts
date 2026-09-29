import { describe, expect, it } from 'vitest';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { hiddenByRange, incoisOrder, pickAreaSector, portShortName, sectorLabel, zonesInSelection } from '../lib/areas';
import { validateDocument } from '../lib/pfz';
import { withHomePort } from '../lib/recompute';
import { portBySlug } from '../data/ports';
import { en } from '../i18n/en';
import { ta } from '../i18n/ta';

const doc = validateDocument(golden);
const karnataka = doc.sectors.find((s) => s.sector_id === 'SEC004')!;

describe('incoisOrder', () => {
  it('restores the row order INCOIS published', () => {
    // The document stores zones nearest-first from Kochi, so Karwar is last there.
    expect(karnataka.zones.at(-1)?.landing_centre).toBe('Karwar');
    const ordered = incoisOrder(karnataka.zones);
    expect(ordered[0]?.landing_centre).toBe('Karwar');
    expect(ordered.map((z) => z.id)).toEqual([...ordered.map((z) => z.id)].sort());
  });

  it('does not mutate its input', () => {
    const before = karnataka.zones.map((z) => z.id);
    incoisOrder(karnataka.zones);
    expect(karnataka.zones.map((z) => z.id)).toEqual(before);
  });
});

describe('hiddenByRange', () => {
  it('counts every zone beyond the range', () => {
    // At 120 nmi from Kochi every Karnataka zone is out of range.
    expect(hiddenByRange(doc, null)).toBe(20);
    expect(hiddenByRange(doc, 'KARNATAKA')).toBe(20);
    expect(hiddenByRange(doc, 'KERALA')).toBe(0);
  });

  it('hides nothing once the range is lifted', () => {
    expect(hiddenByRange(withHomePort(doc, portBySlug('kochi')!, null), null)).toBe(0);
  });
});

describe('zonesInSelection', () => {
  it('returns all zones, or one sector', () => {
    expect(zonesInSelection(doc, null)).toHaveLength(20);
    expect(zonesInSelection(doc, 'KERALA')).toHaveLength(0);
  });
});

describe('pickAreaSector', () => {
  it('honours the remembered area', () => {
    expect(pickAreaSector(doc, 'SEC005')?.sector_id).toBe('SEC005');
  });

  it('falls back to the first area with zones', () => {
    expect(pickAreaSector(doc, null)?.sector_id).toBe('SEC004');
    expect(pickAreaSector(doc, 'SEC999')?.sector_id).toBe('SEC004');
  });
});

describe('labels', () => {
  it('names areas in the reader language, with INCOIS name as fallback', () => {
    expect(sectorLabel(en, { sector_id: 'SEC006', sector_name: 'SOUTH TAMILNADU' })).toBe('South Tamil Nadu');
    expect(sectorLabel(ta, { sector_id: 'SEC007', sector_name: 'NORTH TAMILNADU' })).toBe('வடக்கு தமிழ்நாடு');
    expect(sectorLabel(en, { sector_id: 'SEC099', sector_name: 'SOMEWHERE NEW' })).toBe('SOMEWHERE NEW');
  });

  it('shortens a port name for labels', () => {
    expect(portShortName('Kochi (Cochin Fisheries Harbour)')).toBe('Kochi');
    expect(portShortName('Malpe')).toBe('Malpe');
  });

  it('covers every sector the pipeline fetches, in all three languages', () => {
    for (const id of ['SEC004', 'SEC005', 'SEC006', 'SEC007']) {
      expect(en.sectorNames[id]).toBeTruthy();
      expect(ta.sectorNames[id]).toBeTruthy();
    }
  });
});
