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
