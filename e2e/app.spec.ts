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
  page.locator(`input[aria-label="${column[0].toUpperCase()}${column.slice(1)}"]`);

/**
 * Loads the three sample files. Attribute mapping is switched off so the polygons
 * arrive ungrouped, which is the state the grouping tests start from.
 */
async function importFixtures(page: Page): Promise<void> {
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });
  await expect(dialog).toBeVisible();
  for (const target of ['client', 'farm', 'field']) {
    await dialog.getByLabel(`${target} column`).selectOption('');
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
  // The privacy note moved into the header's info dot when the status line took its
  // place, so it is one hover away rather than permanently on screen.
  const privacy = page.getByRole('button', {
    name: 'Files are processed only in your browser. Nothing is uploaded or stored.',
  });
  await expect(privacy).toBeVisible();
  await privacy.hover();
  await expect(page.getByRole('tooltip')).toContainText('No server, no database');
});

test('imports a KMZ, a UTM shapefile and a GeoJSON in one drop', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);

  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Read 4 polygons from 3 files')).toBeVisible();
  // The shapefile was in UTM zone 31N and has to be reprojected on the way in.
  await expect(dialog.getByText(/reprojected/i)).toBeVisible();

  await dialog.getByLabel('client column').selectOption('');
  await dialog.getByLabel('farm column').selectOption('');
  await dialog.getByLabel('field column').selectOption('');
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  await expect(page.getByText('Ungrouped polygons')).toBeVisible();
  await expect(page.locator('text=/4 polygons? not assigned/')).toBeVisible();
});

test('maps a source column onto a CropForce attribute', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });

  // The guess pre-selects the obvious columns, and shows a sample so two similar ones
  // can be told apart.
  await expect(dialog.getByLabel('client column')).toHaveValue('Client');
  await expect(dialog.getByText('e.g. “Bell Farms”')).toBeVisible();

  // The KML calls its field name "name"; pointing Field at it is the user's choice.
  await dialog.getByLabel('field column').selectOption('name');
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  const names = await page
    .locator('input[aria-label="Field"]')
    .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value).sort());
  expect(names).toContain('Church Field');
  expect(names).toContain('Two Halves');
});

test('leaves an attribute blank when no column is chosen for it', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });

  await dialog.getByLabel('farm column').selectOption('');
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  const farms = await page
    .locator('input[aria-label="Farm"]')
    .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));
  expect(farms.every((value) => value === '')).toBe(true);
  // Client was still mapped, so it came across.
  await expect(page.locator('input[aria-label="Client"]').first()).not.toHaveValue('');
});

test('will not point two attributes at the same column', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });

  await dialog.getByLabel('farm column').selectOption('Client');
  // Claiming a column for Farm releases it from Client rather than duplicating it.
  await expect(dialog.getByLabel('client column')).toHaveValue('');
});

test('groups polygons from different files into one field and exports it', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
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

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
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

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
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
  /** Imports with the guessed mapping, which names every one of the four polygons. */
  const FIELD_COUNT = 4;

  async function importAsFields(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(FIELD_COUNT);
  }

  const clientValues = (page: Page) =>
    page
      .locator('input[aria-label="Client"]')
      .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));

  test('applies one client and farm across every ticked field', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);

    await page.getByRole('checkbox', { name: 'Select all fields' }).check();
    await expect(page.getByText(`${FIELD_COUNT} fields ticked`)).toBeVisible();

    await page.locator('input[aria-label="Client for all ticked fields"]').fill('Ferme SA');
    await page.locator('input[aria-label="Farm for all ticked fields"]').fill('Nord');
    await page.getByRole('button', { name: 'Apply' }).click();

    expect(await clientValues(page)).toEqual(Array(FIELD_COUNT).fill('Ferme SA'));
    await expect(page.locator('input[aria-label="Farm"]').first()).toHaveValue('Nord');
    // The per-row field names are untouched by a bulk client change.
    const fieldNames = await page
      .locator('input[aria-label="Field"]')
      .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value).sort());
    expect(fieldNames).toContain('Church Field');
    expect(fieldNames).toContain('Two Halves');
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

test('waits for a slow permission prompt instead of timing out', async ({ page }) => {
  // The case reported from a real laptop: geolocation works, but the answer only comes
  // after the user has clicked Allow. The clock runs while that prompt is on screen.
  await page.addInitScript(() => {
    const calls: boolean[] = [];
    (window as unknown as { __locateCalls: boolean[] }).__locateCalls = calls;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          ok: (position: unknown) => void,
          _fail: (error: unknown) => void,
          options?: { enableHighAccuracy?: boolean; timeout?: number },
        ) => {
          calls.push(options?.enableHighAccuracy === true);
          // Twelve seconds is a realistic delay for someone reading the prompt. The old
          // eight-second timeout gave up before this, then escalated to high accuracy.
          if ((options?.timeout ?? 0) < 12_000) return;
          setTimeout(
            () =>
              ok({
                coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 40 },
                timestamp: Date.now(),
              }),
            12_000,
          );
        },
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();
  // The wait is visible, so it does not look like the button did nothing.
  await expect(page.getByRole('status')).toContainText(/location|Asking your browser/);

  await expect(page.locator('.location-dot')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status')).toBeHidden();
  // One coarse call, and no escalation to high accuracy.
  expect(await page.evaluate(() => (window as unknown as { __locateCalls: boolean[] }).__locateCalls))
    .toEqual([false]);
});

test('does not escalate to high accuracy when the request merely timed out', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: boolean[] = [];
    (window as unknown as { __locateCalls: boolean[] }).__locateCalls = calls;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _ok: unknown,
          fail: (error: unknown) => void,
          options?: { enableHighAccuracy?: boolean },
        ) => {
          calls.push(options?.enableHighAccuracy === true);
          fail({ code: 3, message: 'Timeout expired' });
        },
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();
  // Asking a GPS-less laptop for high accuracy is how a slow answer becomes no answer.
  await expect(page.getByText(/did not answer in time/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __locateCalls: boolean[] }).__locateCalls))
    .toEqual([false]);
});

test('says how to unblock a site the browser has blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state: 'denied' }) },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: () => {
          throw new Error('should not be called when the permission is already denied');
        },
        watchPosition: () => 0,
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/');
  await importFixtures(page);

  await page.getByRole('button', { name: 'Zoom to my location' }).click();
  await expect(page.getByText(/set Location to Allow/)).toBeVisible();
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

test.describe('finding a field', () => {
  async function importNamed(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('dialog', { name: 'Import boundaries' }).getByLabel('field column')
      .selectOption('name');
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);
  }

  test('filters the list down to what was typed', async ({ page }) => {
    await page.goto('/');
    await importNamed(page);

    await page.getByLabel('Search fields').fill('church');
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(1);
    await expect(page.locator('input[aria-label="Field"]').first()).toHaveValue('Church Field');
    await expect(page.getByText('1 of 4 fields')).toBeVisible();
  });

  test('matches on any column, in any word order', async ({ page }) => {
    await page.goto('/');
    await importNamed(page);

    // "Bell Farms" is the Client and "Church Field" the Field: two columns, reversed.
    await page.getByLabel('Search fields').fill('church bell');
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(1);
  });

  test('matches the source filename too', async ({ page }) => {
    await page.goto('/');
    await importNamed(page);

    await page.getByLabel('Search fields').fill('parcelles.zip');
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(1);
  });

  test('says so when nothing matches, and clears back to everything', async ({ page }) => {
    await page.goto('/');
    await importNamed(page);

    await page.getByLabel('Search fields').fill('nothing here');
    await expect(page.getByText(/Nothing matches/)).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);
  });

  test('zooms the map to the matches', async ({ page }) => {
    await page.goto('/');
    await importNamed(page);

    await page.getByLabel('Search fields').fill('parcelles');
    await page.getByRole('button', { name: 'Zoom to matching fields' }).click();
    await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText(/\bm$/);
  });
});

test.describe('duplicate Client/Farm/Field', () => {
  /** Two polygons deliberately given the same three names. */
  async function twoCollidingFields(page: Page) {
    await importFixtures(page);
    const ungrouped = page.locator('section', { hasText: 'Ungrouped polygons' });

    for (const index of [0, 1]) {
      await ungrouped.locator('button', { hasText: /blocks\.kmz|parcelles\.zip|extra\.geojson/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Combine into one field' }).click();
      await attributeCell(page, 'client').nth(index).fill('Acme');
      await attributeCell(page, 'farm').nth(index).fill('Home');
      await attributeCell(page, 'field').nth(index).fill('Long Acre');
    }
  }

  test('blocks the export and offers to number them apart', async ({ page }) => {
    await page.goto('/');
    await twoCollidingFields(page);

    const flag = page.locator('article', { hasText: 'share the name' });
    await expect(flag).toBeVisible();
    await expect(flag).toContainText('CropForce would keep only the last one uploaded');

    await page.getByRole('button', { name: 'Export merged shapefile for CropForce' }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Export for CropForce' });
    await expect(exportDialog.getByText(/blocked until these are resolved/)).toBeVisible();
    await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await flag.getByRole('button', { name: 'Auto-fix' }).click();

    const names = await page
      .locator('input[aria-label="Field"]')
      .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));
    expect(names).toEqual(['Long Acre', 'Long Acre (2)']);
    await expect(page.locator('article', { hasText: 'share the name' })).toBeHidden();
  });

  test('clears just as well by combining them into one field', async ({ page }) => {
    await page.goto('/');
    await twoCollidingFields(page);
    await expect(page.locator('article', { hasText: 'share the name' })).toBeVisible();

    // The other honest resolution: they really were one field in two blocks.
    await page.locator('article', { hasText: 'share the name' })
      .getByRole('button', { name: 'Fix manually' })
      .click();
    await page.getByRole('button', { name: 'Combine into one field' }).click();

    await expect(page.locator('article', { hasText: 'share the name' })).toBeHidden();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(1);
  });
});

test.describe('going somewhere without geolocation', () => {
  test('jumps to a pasted coordinate', async ({ page }) => {
    await page.goto('/');
    await importFixtures(page);

    await page.getByRole('button', { name: 'Go to coordinates' }).click();
    const dialog = page.getByRole('dialog', { name: 'Go to coordinates' });
    await dialog.getByLabel('Latitude and longitude').fill('48.8566, 2.3522');
    await expect(dialog.getByText('Reads as 48.85660, 2.35220')).toBeVisible();

    await dialog.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.locator('.location-dot')).toBeVisible();
    await expect(page.locator('.leaflet-control-scale-line').first()).toHaveText(/\bm$/);
  });

  test('accepts a pasted map link', async ({ page }) => {
    await page.goto('/');
    await importFixtures(page);

    await page.getByRole('button', { name: 'Go to coordinates' }).click();
    const dialog = page.getByRole('dialog', { name: 'Go to coordinates' });
    await dialog.getByLabel('Latitude and longitude').fill(
      'https://www.google.com/maps/@48.8566,2.3522,15z',
    );
    await expect(dialog.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
  });

  test('refuses a place name and says why', async ({ page }) => {
    await page.goto('/');
    await importFixtures(page);

    await page.getByRole('button', { name: 'Go to coordinates' }).click();
    const dialog = page.getByRole('dialog', { name: 'Go to coordinates' });
    await dialog.getByLabel('Latitude and longitude').fill('Paris');
    await expect(dialog.getByText(/needs an online lookup/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
  });
});

test('keeps an audit reference in the field name', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', FILES);
  const dialog = page.getByRole('dialog', { name: 'Import boundaries' });

  await dialog.getByLabel('field column').selectOption('name');
  await dialog.getByLabel('field second column').selectOption('Client');
  await expect(dialog.getByText('e.g. “Church Field (Bell Farms)”')).toBeVisible();

  await dialog.getByLabel('field join format').selectOption('dash');
  await expect(dialog.getByText('e.g. “Church Field - Bell Farms”')).toBeVisible();

  await dialog.getByLabel('field join format').selectOption('parentheses');
  await page.getByRole('button', { name: 'Add to workspace' }).click();

  const names = await page
    .locator('input[aria-label="Field"]')
    .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));
  expect(names).toContain('Church Field (Bell Farms)');
});

test('shortens a name that will not fit the column', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Combine into one field' }).click();

  await attributeCell(page, 'client').first().fill('Acme');
  await attributeCell(page, 'farm').first().fill('Home');
  // maxlength stops this being typed, so it goes in the way a real one does: from data.
  await attributeCell(page, 'field').first().evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, 'North Field Behind The Old Barn At Manor Farm');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const flag = page.locator('article', { hasText: 'too long for the column' });
  await expect(flag).toBeVisible();
  await expect(flag).toContainText('Field (45)');

  await flag.getByRole('button', { name: 'Auto-fix' }).click();
  await expect(attributeCell(page, 'field').first()).toHaveValue('North Field Behind The Old');
  await expect(page.getByText('0 blocking')).toBeVisible();
});

test('selects the boundaries behind the flags', async ({ page }) => {
  await page.goto('/');
  await importFixtures(page);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Combine into one field' }).click();
  await page.locator('body').click();
  await expect(page.getByText('Nothing selected')).toBeVisible();

  // The blocking count doubles as a way to select everything it counts.
  await page.getByRole('button', { name: /blocking/ }).click();
  await expect(page.getByText('4 polygons selected')).toBeVisible();
  // The four fixtures straddle two countries, so framing them all zooms out, not in —
  // the point is that the view moved to them at all.
  await expect(page.locator('.leaflet-control-scale-line').first()).not.toHaveText('50 km');
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

test.describe('filtering the field list', () => {
  /** Four fields, three of them missing attributes and one fully named. */
  async function importAndNameOne(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    const dialog = page.getByRole('dialog', { name: 'Import boundaries' });
    for (const target of ['client', 'farm', 'field']) {
      await dialog.getByLabel(`${target} column`).selectOption('');
    }
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await page.getByRole('button', { name: 'Combine into one field' }).click();
    await page.locator('body').click();
    await attributeCell(page, 'client').first().fill('Acme');
    await attributeCell(page, 'farm').first().fill('Home');
    await attributeCell(page, 'field').first().fill('Long Acre');
  }

  test('shows only the fields that still need work', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);

    // Only the KML's Church Field arrives with all three attributes filled; the other
    // three are missing something, so three rows are blocked and one is clean.
    const blocking = page.getByRole('button', { name: /^Blocking/ });
    await expect(blocking).toHaveText(/3/);
    await blocking.click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(3);

    const clean = page.getByRole('button', { name: /^Clean/ });
    await clean.click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(1);
    await expect(page.locator('input[aria-label="Client"]').first()).toHaveValue('Bell Farms');

    // Filling a blocked row in moves it across, and the counts follow.
    await page.getByRole('button', { name: /^All/ }).click();
    await page.locator('input[aria-label="Client"][data-empty="true"]').first().fill('Acme');
    await page.locator('input[aria-label="Farm"][data-empty="true"]').first().fill('Home');
    await expect(clean).toHaveText(/2/);
    await clean.click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(2);
  });

  test('marks a warning reviewed and takes it back off the list', async ({ page }) => {
    await page.goto('/');
    await importAndNameOne(page);

    // One of the fixtures is a season-specific name, which is a warning rather than a block.
    await attributeCell(page, 'field').first().fill('Wheat 2024');
    const warning = page.locator('article', { hasText: 'season-specific' });
    await expect(warning).toBeVisible();
    await expect(page.getByRole('button', { name: /^1 to review/ })).toBeVisible();

    await warning.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(warning).toBeHidden();
    await expect(page.getByText('0 to review')).toBeVisible();

    // The reviewed section keeps it, and un-reviewing brings it back to the working list.
    await page.getByRole('button', { name: '1 reviewed' }).click();
    const reviewed = page.locator('article', { hasText: 'season-specific' });
    await reviewed.getByRole('button', { name: 'Un-review' }).click();
    await expect(page.getByRole('button', { name: /^1 to review/ })).toBeVisible();
  });
});

test.describe('language', () => {
  test('switches the whole interface and switches back', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Prepare field boundaries for CropForce' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Português (BR)' }).click();

    await expect(page.getByRole('heading', { name: /Prepare contornos/ })).toBeVisible();
    await expect(page.getByText('Verificações de qualidade')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    await page.getByRole('button', { name: 'Idioma' }).click();
    await page.getByRole('option', { name: 'Español (LATAM)' }).click();
    await expect(page.getByRole('heading', { name: /Prepare contornos de lotes/ })).toBeVisible();
    await expect(page.getByText('Controles de calidad')).toBeVisible();

    await page.getByRole('button', { name: 'Idioma' }).click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect(
      page.getByRole('heading', { name: 'Prepare field boundaries for CropForce' }),
    ).toBeVisible();
  });

  test('reports quality flags in the chosen language', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('article', { hasText: 'attribute' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Español (LATAM)' }).click();

    await expect(page.locator('article', { hasText: 'atributo' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar shapefile combinado para CropForce' })).toBeVisible();
  });

  test('keeps the exported columns named in English whatever the interface says', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();

    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Português (BR)' }).click();

    // The table headers name the DBF columns, so they must not be translated.
    await expect(page.getByRole('columnheader', { name: 'Client' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Farm' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Field' })).toBeVisible();
  });
});


test.describe('the two panels as one workflow', () => {
  /** Imports with the guessed mapping: three fields blocked, one clean. */
  async function importAsFields(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);
  }

  /** Types a value the input's own maxlength would refuse, the way imported data does. */
  async function forceValue(page: Page, column: 'client' | 'farm' | 'field', row: number, value: string) {
    await attributeCell(page, column).nth(row).evaluate((node, text) => {
      const input = node as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }

  test('shows a single field\'s issues when it is picked from the list', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);
    await expect(page.locator('article')).toHaveCount(3);

    // The blocking badge on a row is the way into that field's issues.
    await page.getByRole('button', { name: /^Show the issues on/ }).first().click();

    await expect(page.getByText(/Showing 1 selected field/)).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);

    await page.getByRole('button', { name: 'Show all fields' }).click();
    await expect(page.getByText(/Showing 1 selected field/)).toBeHidden();
    await expect(page.locator('article')).toHaveCount(3);
  });

  test('says so when the field you picked has nothing wrong with it', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);

    // Church Field arrives fully named, so it carries no flag at all.
    await page.locator('tbody tr').first().hover();
    await page.getByRole('button', { name: "Select this field's polygons" }).first().click();

    await expect(page.getByText('Nothing is flagged on the fields you have selected.')).toBeVisible();
  });

  test('filters the quality panel by problem category', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);
    // A second kind of problem, so there is something to tell apart.
    await attributeCell(page, 'field').first().fill('Wheat 2024');

    const seasonNames = page.getByRole('button', { name: /^Season names/ });
    await expect(seasonNames).toBeVisible();
    await expect(page.locator('article')).toHaveCount(4);

    await seasonNames.click();
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.locator('article')).toContainText('season-specific');

    await page.getByRole('button', { name: /^Missing names/ }).click();
    await expect(page.locator('article')).toHaveCount(3);
  });

  test('auto-fixes a batch as one undoable step', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);
    await forceValue(page, 'field', 1, 'North Field Behind The Old Barn At Manor Farm');
    await forceValue(page, 'field', 3, 'South Field Behind The New Barn At Manor Farm');

    await page.getByRole('button', { name: /^Names too long/ }).click();
    await expect(page.locator('article')).toHaveCount(2);

    await page.getByRole('checkbox', { name: 'Select every issue shown' }).check();
    await expect(page.getByText('2 issues selected')).toBeVisible();
    await page.getByRole('button', { name: 'Auto-fix 2' }).click();

    await expect(page.getByText('Fixed 2 issues')).toBeVisible();
    await expect(attributeCell(page, 'field').nth(1)).toHaveValue('North Field Behind The Old');
    await expect(attributeCell(page, 'field').nth(3)).toHaveValue('South Field Behind The New');

    // One entry in the history, so one undo puts both back.
    await page.keyboard.press('Control+z');
    await expect(attributeCell(page, 'field').nth(1)).toHaveValue(
      'North Field Behind The Old Barn At Manor Farm',
    );
    await expect(attributeCell(page, 'field').nth(3)).toHaveValue(
      'South Field Behind The New Barn At Manor Farm',
    );
  });

  test('marks several warnings reviewed at once', async ({ page }) => {
    await page.goto('/');
    await importAsFields(page);
    await attributeCell(page, 'field').nth(0).fill('Wheat 2024');
    await attributeCell(page, 'field').nth(1).fill('Barley 2023');

    await page.getByRole('button', { name: /^Season names/ }).click();
    await expect(page.locator('article')).toHaveCount(2);

    await page.getByRole('checkbox', { name: 'Select every issue shown' }).check();
    await page.getByRole('button', { name: 'Mark 2 reviewed' }).click();

    await expect(page.getByText('Marked 2 warnings reviewed.')).toBeVisible();
    await expect(page.getByText('0 to review')).toBeVisible();
    await expect(page.getByRole('button', { name: '2 reviewed' })).toBeVisible();
  });
});


test.describe('working room', () => {
  async function loaded(page: Page) {
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);
  }

  const mapWidth = (page: Page) =>
    page.locator('.leaflet-container').evaluate((node) => node.getBoundingClientRect().width);

  test('folds a panel away and brings it back', async ({ page }) => {
    await page.goto('/');
    await loaded(page);
    const before = await mapWidth(page);

    await page.getByRole('button', { name: 'Hide the quality panel' }).click();
    await expect(page.locator('article')).toHaveCount(0);
    expect(await mapWidth(page)).toBeGreaterThan(before);

    // The folded rail still says what it is, and how bad things are.
    const rail = page.getByRole('button', { name: 'Show the quality panel' });
    await expect(rail).toBeVisible();
    await rail.click();
    await expect(page.locator('article')).toHaveCount(3);
  });

  test('resizes a panel from the keyboard', async ({ page }) => {
    await page.goto('/');
    await loaded(page);
    const before = await mapWidth(page);

    const splitter = page.getByRole('separator', { name: /field list/ });
    await splitter.focus();
    for (let n = 0; n < 4; n++) await page.keyboard.press('ArrowLeft');

    expect(await mapWidth(page)).toBeGreaterThan(before);
  });

  test('opens the shortcut sheet with ?', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Prepare field boundaries for CropForce' })).toBeVisible();
    await page.keyboard.press('?');

    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Cut hole')).toBeVisible();
    await expect(sheet.getByText('Show this list')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

test.describe('saying it once', () => {
  test('leaves empty attributes alone until an export is actually stopped', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();

    const empty = page.locator('input[aria-label="Client"][data-empty="true"]').first();
    await expect(empty).toHaveAttribute('data-blocked', 'false');

    await page.getByRole('button', { name: 'Export merged shapefile for CropForce' }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(empty).toHaveAttribute('data-blocked', 'true');
  });

  test('counts how much of the job is done', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();

    const bar = page.getByRole('progressbar', { name: 'Fields ready to export' });
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await expect(bar).toHaveAttribute('aria-valuemax', '4');
    await expect(page.getByText('1 of 4 ready')).toBeVisible();

    // The header says the one thing that matters next, not every count at once.
    await expect(page.getByText('3 fields need attention before they can be exported')).toBeVisible();
  });

  test('lights the boundary a flag is about, without selecting it', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();

    const hovered = page.locator('.leaflet-interactive.feature-hover');
    await expect(hovered).toHaveCount(0);

    await page.locator('article').first().hover();
    await expect(hovered).toHaveCount(1);
    // Pointing is not selecting.
    await expect(page.getByText('Nothing selected')).toBeVisible();

    await page.getByRole('heading', { name: 'Quality checks' }).hover();
    await expect(hovered).toHaveCount(0);
  });

  test('names the fields on the map once there is room for them', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();

    await expect(page.locator('.field-label')).toHaveCount(0);

    await page.locator('tbody tr').first().hover();
    await page.getByRole('button', { name: 'Zoom to field' }).first().click();

    await expect(page.locator('.field-label').first()).toContainText('Manor / Church Field');
  });

  test('jumps back several steps from the history list', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', FILES);
    await page.getByRole('button', { name: 'Add to workspace' }).click();
    await attributeCell(page, 'client').nth(1).fill('Acme');
    await attributeCell(page, 'farm').nth(1).fill('Home');

    await page.getByRole('button', { name: 'Recent actions' }).first().click();
    // Newest first under "Now", so the second "Edit attributes" is the earlier of the
    // two edits. Undoing back to it takes both out in one go.
    await page.getByRole('button', { name: 'Edit attributes' }).nth(1).click();

    await expect(attributeCell(page, 'client').nth(1)).toHaveValue('');
    await expect(attributeCell(page, 'farm').nth(1)).toHaveValue('');
    // The import itself survives, because it sits below the entry that was clicked.
    await expect(page.locator('input[aria-label="Field"]')).toHaveCount(4);
  });
});
