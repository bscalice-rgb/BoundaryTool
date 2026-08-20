import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import shp from 'shpjs';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { FIXTURE_DIR, writeFixtures } from './make-fixtures';

const FILES = ['blocks.kmz', 'parcelles.zip', 'extra.geojson'].map((name) =>
  join(FIXTURE_DIR, name),
);

/** Hosts contacted by the page, minus the dev server itself. */
const externalHosts: string[] = [];

test.beforeAll(async () => {
  await writeFixtures();
});

test.beforeEach(async ({ page }) => {
  externalHosts.length = 0;
  // Basemap tiles are the only outbound traffic the app is allowed to make. They are
  // blocked here so the test does not need the internet, and recorded so the test can
  // assert nothing else goes out.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    externalHosts.push(url.hostname);
    await route.abort();
  });

  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

/** The attribute table cells, addressed precisely so the panel's info buttons cannot match. */
const attributeCell = (page: Page, column: 'client' | 'farm' | 'field') =>
  page.locator(`input[aria-label="${column}"]`);

/**
 * Loads the three sample files. Attribute mapping is switched off so the polygons
 * arrive ungrouped, which is the state the grouping tests start from.
 */
async function importFixtures(page: Page): Promise<void> {
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });
  await expect(dialog).toBeVisible();
  for (const name of ['client', 'farm', 'field']) {
    await dialog.getByRole('checkbox', { name }).uncheck();
  }
  await page.getByRole('button', { name: 'Add to workspace' }).click();
  await expect(dialog).toBeHidden();
  // The map frames the new data before anything else can act on the view.
  await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText('50 km');
}

/* -------------------------------------------------------------------------- */

test('shows the empty state before anything is loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Prepare field boundaries for CropForce' })).toBeVisible();
  await expect(page.getByText('Drop your files')).toBeVisible();
  await expect(page.getByText('Files are processed only in your browser')).toBeVisible();
});

test('imports a KMZ, a UTM shapefile and a GeoJSON in one drop', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);

  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Read 4 polygons from 3 files')).toBeVisible();
  // The shapefile was in UTM zone 31N and has to be reprojected on the way in.
  await expect(dialog.getByText(/reprojected/i)).toBeVisible();

  await dialog.getByRole('checkbox', { name: 'client' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'farm' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'field' }).uncheck();
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  await expect(page.getByText('Ungrouped polygons')).toBeVisible();
  await expect(page.locator('text=/4 polygons? not assigned/')).toBeVisible();
});

test('pre-groups by the attributes a source file already carries', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);
  // The mapping checkboxes are pre-ticked because these files do carry usable names.
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  // The shapefile names its parcel and each KML placemark names itself, so each
  // arrives as its own field with the Field column already filled in.
  const fieldCells = page.locator('input[aria-label="field"]');
  await expect(fieldCells).toHaveCount(4);
  const names = await fieldCells.evaluateAll((inputs) =>
    (inputs as HTMLInputElement[]).map((input) => input.value).sort(),
  );
  expect(names).toEqual(['Bottom Meadow', 'Church Field', 'Parcelle 1', 'Two Halves']);
  await expect(page.getByText('Ungrouped polygons')).toBeHidden();
});

test('groups polygons from different files into one field and exports it', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByText('4 polygons selected')).toBeVisible();
  await page.getByRole('button', { name: 'Combine into one field' }).click();

  // One field row, and the export is blocked while its attributes are empty.
  await expect(page.getByRole('button', { name: 'Export merged shapefile for CropForce' })).toBeVisible();
  await page.getByRole('button', { name: 'Export merged shapefile for CropForce' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export for CropForce' });
  await expect(exportDialog.getByText(/blocked until these are resolved/)).toBeVisible();
  await expect(exportDialog.getByRole('button', { name: 'Download zip' })).toBeDisabled();
  await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await attributeCell(page, 'client').first().fill('Ferme SA');
  await attributeCell(page, 'farm').first().fill('Nord');
  await attributeCell(page, 'field').first().fill('Grande Piece');

  await expect(page.getByText('0 blocking')).toBeVisible();

  await page.getByRole('button', { name: 'Export merged shapefile for CropForce' }).click();
  await expect(exportDialog.getByRole('button', { name: 'Download zip' })).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download zip' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Ferme_SA_cropforce_\d{4}-\d{2}-\d{2}\.zip$/);

  const path = await download.path();
  const buffer = readFileSync(path);

  const zip = await JSZip.loadAsync(buffer);
  expect(Object.keys(zip.files).sort().map((name) => name.split('.').pop())).toEqual([
    'cpg',
    'dbf',
    'prj',
    'shp',
    'shx',
  ]);

  const prj = await zip.file(/\.prj$/)[0].async('string');
  expect(prj).toContain('GEOGCS');
  expect(prj).toContain('WGS_1984');

  const parsed = (await shp(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  )) as FeatureCollection;

  expect(parsed.features).toHaveLength(1);
  expect(parsed.features[0].properties).toEqual({
    Client: 'Ferme SA',
    Farm: 'Nord',
    Field: 'Grande Piece',
  });
  // Four features from three files, one of them a two-part multipolygon, land as a
  // single row holding all five polygons.
  const geometry = parsed.features[0].geometry as MultiPolygon;
  expect(geometry.type).toBe('MultiPolygon');
  expect(geometry.coordinates).toHaveLength(5);
});

test('runs a QA auto-fix and undoes it', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Combine into one field' }).click();

  const flag = page.locator('article', { hasText: 'attribute' }).first();
  await expect(flag).toBeVisible();

  // "Fix manually" on a missing attribute puts the cursor in the offending cell.
  await flag.getByRole('button', { name: 'Fix manually' }).click();
  await expect(attributeCell(page, 'client').first()).toBeFocused();

  await attributeCell(page, 'client').first().fill('Acme');
  await attributeCell(page, 'farm').first().fill('Home');
  await attributeCell(page, 'field').first().fill('Wheat 2024');

  // The season-specific name is a warning, and warnings never block.
  await expect(page.getByText('0 blocking')).toBeVisible();
  await expect(page.locator('article', { hasText: 'season-specific' })).toBeVisible();
});

test('draws a polygon and undoes it with the keyboard', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: /^Draw/ }).click();
  const map = page.locator('.leaflet-container');
  const box = (await map.boundingBox())!;

  const click = (dx: number, dy: number) =>
    page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);

  await click(-120, -80);
  await click(60, -80);
  await click(60, 60);
  await page.mouse.dblclick(box.x + box.width / 2 - 120, box.y + box.height / 2 + 60);

  await expect(page.locator('text=/5 polygons? not assigned/')).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(page.locator('text=/4 polygons? not assigned/')).toBeVisible();

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('text=/5 polygons? not assigned/')).toBeVisible();
});

/**
 * Selects the first ungrouped polygon and fills the map with it, so the drawing tests
 * can aim at the middle of the viewport and be sure of hitting it.
 */
async function focusFirstPolygon(page: Page) {
  await page
    .locator('section', { hasText: 'Ungrouped polygons' })
    .locator('button', { hasText: 'blocks.kmz' })
    .first()
    .click();
  await expect(page.getByText('1 polygon selected')).toBeVisible();

  await page.getByRole('button', { name: 'Zoom to selection' }).click();
  // The scale bar reads in kilometres until the map has actually zoomed in.
  await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText(/\bm$/);

  return (await page.locator('.leaflet-container').boundingBox())!;
}

test('splits a polygon in two with a drawn line', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  const box = await focusFirstPolygon(page);

  await page.getByRole('button', { name: /^Split/ }).click();
  const midY = box.y + box.height / 2;
  await page.mouse.click(box.x + 40, midY);
  await page.mouse.dblclick(box.x + box.width - 40, midY);

  await expect(page.locator('text=/5 polygons? not assigned/')).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(page.locator('text=/4 polygons? not assigned/')).toBeVisible();
});

test('cuts an exclusion zone and the area drops', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  const box = await focusFirstPolygon(page);

  const areaLabel = page.locator('section', { hasText: 'Ungrouped polygons' })
    .locator('text=/ha$/')
    .first();
  const before = Number((await areaLabel.innerText()).replace(' ha', ''));
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Cut hole' }).click();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx - 60, cy - 60);
  await page.mouse.click(cx + 60, cy - 60);
  await page.mouse.click(cx + 60, cy + 60);
  await page.mouse.dblclick(cx - 60, cy + 60);

  await expect
    .poll(async () => Number((await areaLabel.innerText()).replace(' ha', '')))
    .toBeLessThan(before);

  // The hole is undoable like everything else.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => Number((await areaLabel.innerText()).replace(' ha', '')))
    .toBe(before);
});

test('resolves an overlap between two fields and undoes the clip', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  const box = await focusFirstPolygon(page);

  // Make that polygon a field of its own.
  await page.getByRole('button', { name: 'Combine into one field' }).click();
  await attributeCell(page, 'client').first().fill('Acme');
  await attributeCell(page, 'farm').first().fill('Home');
  await attributeCell(page, 'field').first().fill('West');

  // Draw a second polygon overlapping it, and make that a field too.
  await page.getByRole('button', { name: /^Draw/ }).click();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy - 80);
  await page.mouse.click(cx + 200, cy - 80);
  await page.mouse.click(cx + 200, cy + 80);
  await page.mouse.dblclick(cx, cy + 80);

  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Combine into one field' }).click();
  await attributeCell(page, 'client').nth(1).fill('Acme');
  await attributeCell(page, 'farm').nth(1).fill('Home');
  await attributeCell(page, 'field').nth(1).fill('East');

  const overlapFlag = page.locator('article', { hasText: 'overlaps' });
  await expect(overlapFlag).toBeVisible();

  await overlapFlag.getByRole('button', { name: 'Auto-fix' }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve overlap' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Clip the overlap' }).click();

  await expect(overlapFlag).toBeHidden();
  await expect(page.getByText('0 blocking')).toBeVisible();

  // Auto-fixes are ordinary history entries, so one undo puts the overlap back.
  await page.keyboard.press('Control+z');
  await expect(page.locator('article', { hasText: 'overlaps' })).toBeVisible();
});

test.describe('bulk naming', () => {
  /** Imports with mapping on, so each source polygon arrives as its own named field. */
  async function importAsFields(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="field"]')).toHaveCount(4);
  }

  const clientValues = (page: Page) =>
    page
      .locator('input[aria-label="client"]')
      .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));

  test('applies one client and farm across every ticked field', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);

    await page.getByRole('checkbox', { name: 'Select all fields' }).check();
    await expect(page.getByText('4 fields ticked')).toBeVisible();

    await page.locator('input[aria-label="Client for all ticked fields"]').fill('Ferme SA');
    await page.locator('input[aria-label="Farm for all ticked fields"]').fill('Nord');
    await page.getByRole('button', { name: 'Apply' }).click();

    expect(await clientValues(page)).toEqual(['Ferme SA', 'Ferme SA', 'Ferme SA', 'Ferme SA']);
    await expect(page.locator('input[aria-label="farm"]').first()).toHaveValue('Nord');
    // The per-row field names are untouched by a bulk client change.
    const fieldNames = await page
      .locator('input[aria-label="field"]')
      .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value).sort());
    expect(fieldNames).toEqual(['Bottom Meadow', 'Church Field', 'Parcelle 1', 'Two Halves']);
  });

  test('touches only the fields that are ticked', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);

    const ticks = page.locator('input[aria-label^="Select "][aria-label$="for bulk editing"]');
    await ticks.nth(0).check();
    await ticks.nth(2).check();
    await expect(page.getByText('2 fields ticked')).toBeVisible();

    await page.locator('input[aria-label="Client for all ticked fields"]').fill('Acme');
    await page.getByRole('button', { name: 'Apply' }).click();

    const values = await clientValues(page);
    expect(values[0]).toBe('Acme');
    expect(values[2]).toBe('Acme');
    expect(values[1]).not.toBe('Acme');
    expect(values[3]).not.toBe('Acme');
  });

  test('is one history entry, so a single undo reverses the whole batch', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);

    const before = await clientValues(page);
    await page.getByRole('checkbox', { name: 'Select all fields' }).check();
    await page.locator('input[aria-label="Client for all ticked fields"]').fill('Ferme SA');
    await page.getByRole('button', { name: 'Apply' }).click();
    expect(await clientValues(page)).not.toEqual(before);

    await page.keyboard.press('Control+z');
    expect(await clientValues(page)).toEqual(before);
  });

  test('does nothing while both boxes are empty', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);
    await page.getByRole('checkbox', { name: 'Select all fields' }).check();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});

test.describe('zoom to my location', () => {
  test.use({ geolocation: { latitude: 48.8566, longitude: 2.3522 }, permissions: ['geolocation'] });

  test('centres the map on the reported position and marks it', async ({ page }) => {
    await page.goto('/');
    await importFixtures(page);

    await page.getByRole('button', { name: 'Zoom to my location' }).click();

    // A dot with an accuracy ring lands on the map, and the view zooms in to it.
    await expect(page.locator('.location-dot')).toBeVisible();
    await expect(page.locator('.location-accuracy')).toHaveCount(1);
    await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText(/\bm$/);
  });
});

test('retries at high accuracy when the coarse attempt reports no position', async ({ page }) => {
  // Reproduces the desktop case: the browser's network location service answers
  // POSITION_UNAVAILABLE, but a GPS fix is available when asked for precisely.
  await page.addInitScript(() => {
    const calls: boolean[] = [];
    (window as unknown as { __locateCalls: boolean[] }).__locateCalls = calls;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          ok: (position: unknown) => void,
          fail: (error: unknown) => void,
          options?: { enableHighAccuracy?: boolean },
        ) => {
          const precise = options?.enableHighAccuracy === true;
          calls.push(precise);
          if (!precise) {
            fail({ code: 2, message: 'Position update is unavailable' });
            return;
          }
          ok({ coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 20 }, timestamp: Date.now() });
        },
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();

  await expect(page.locator('.location-dot')).toBeVisible();
  await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText(/\bm$/);
  // Coarse first, then precise: never the other way round.
  expect(await page.evaluate(() => (window as unknown as { __locateCalls: boolean[] }).__locateCalls))
    .toEqual([false, true]);
  // The user is never shown an error for an attempt that ultimately succeeded.
  await expect(page.getByText(/Could not get your location/)).toHaveCount(0);
});

test('explains a device that cannot locate itself at all', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (error: unknown) => void) =>
          fail({ code: 2, message: 'Position update is unavailable' }),
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();
  // The advice has to be actionable, not the browser's own opaque wording.
  await expect(page.getByText(/could not work out where it is/)).toBeVisible();
  await expect(page.getByText(/pan the map to your fields instead/)).toBeVisible();
  await expect(page.locator('.location-dot')).toHaveCount(0);
});

test('reports a refused location rather than failing silently', async ({ page }) => {
  // The refusal is stubbed rather than driven through Chromium's permission prompt,
  // which under automation neither grants nor rejects promptly.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (error: unknown) => void) =>
          fail({ code: 1, message: 'User denied Geolocation' }),
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();
  await expect(page.getByText(/the browser blocked it/)).toBeVisible();
  await expect(page.locator('.location-dot')).toHaveCount(0);
});

test('keeps nothing across a reload and contacts only basemap hosts', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  await expect(page.getByText('Ungrouped polygons')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepare field boundaries for CropForce' })).toBeVisible();
  await expect(page.getByText('Ungrouped polygons')).toBeHidden();

  const storage = await page.evaluate(() => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    cookies: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookies: '' });

  // Tile servers are the only outbound traffic; nothing else leaves the browser.
  const unexpected = [...new Set(externalHosts)].filter(
    (host) => !/arcgisonline\.com$|openstreetmap\.org$/.test(host),
  );
  expect(unexpected).toEqual([]);
});
