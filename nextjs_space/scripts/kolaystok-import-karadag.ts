/**
 * Karadağ Metal → Avc KolayStok.
 *
 *   Dry run (default — reads the Excel only, writes a summary):
 *     npx tsx scripts/kolaystok-import-karadag.ts ../musteri-veri/karadag/Karadag_Metal_Fabrika_Stok_Listesi_2026.xlsx
 *
 * Nothing is written to the database or S3 in a dry run. The live import
 * (--apply --company <id>) is added once Karadağ's company exists and the
 * owner has said "uygula".
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { planKaradagImport, OPENING_STOCK, MIN_STOCK } from '../lib/stock/karadag-import';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Give the path to the Excel file.');
  if (process.argv.includes('--apply')) throw new Error('--apply is not enabled yet: dry run only.');

  const plan = await planKaradagImport(file);
  const units = new Map<string, number>();
  let priced = 0;
  let shelves = 0;
  let photoBytes = 0;
  for (const p of plan.products) {
    units.set(p.unit, (units.get(p.unit) ?? 0) + 1);
    if (p.salePrice !== null) priced += 1;
    if (p.shelf) shelves += 1;
    if (p.photo) photoBytes += p.photo.buffer.length;
  }

  const summary = {
    file: path.basename(file),
    products: plan.products.length,
    categories: plan.categories,
    units: Object.fromEntries(units),
    withSalePrice: priced,
    withShelf: shelves,
    openingStockEach: OPENING_STOCK,
    minStockEach: MIN_STOCK,
    images: { inSheet: plan.totals.images, matchedToProducts: plan.totals.matchedImages, originalMegabytes: Math.round(photoBytes / 1e5) / 10 },
    problems: {
      duplicateCodes: plan.problems.duplicateCodes,
      missingName: plan.problems.missingName,
      missingCode: plan.problems.missingCode,
      badPrice: plan.problems.badPrice,
      imagesWithoutProduct: plan.problems.imagesWithoutProduct,
      productsWithoutImage: plan.problems.productsWithoutImage,
      rowsWithSeveralImages: plan.problems.rowsWithSeveralImages,
      notInStockList: plan.problems.noStockListRow,
    },
    samples: plan.products.slice(0, 3).map(({ photo, ...rest }) => ({ ...rest, hasPhoto: Boolean(photo) })),
  };
  const out = path.join(path.dirname(file), 'kuru-calistirma-ozet.json');
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, samples: undefined }, null, 2));
  console.log(`\nSummary written to ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
