import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ProductMeta = {
  id: string;
  category: string;
  categoryFolder: string;
};

type DownloadReport = {
  id: string;
  name: string;
  brand: string;
  category?: string;
  downloaded: number;
  files: string[];
  queries: string[];
  sources: string[];
  warnings: string[];
};

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, 'backend', 'src', 'db', 'seed.ts');
const OUT_DIR = path.join(ROOT, 'frontend', 'public', 'products');
const REPORT_PATH = path.join(ROOT, 'product-image-download-report.json');

const CATEGORY_FOLDER_BY_ID: Record<string, string> = {
  Vitaminas: 'vitaminas',
  'Cuidado personal': 'cuidado-personal',
  'Cuidado del bebé': 'cuidado-bebe',
  Suplementos: 'suplementos',
  'Salud de la piel': 'salud-piel',
  Fitness: 'fitness',
  Medicamentos: 'medicamentos',
  Hidratantes: 'hidratantes',
  Fragancias: 'fragancias',
  Maquillaje: 'maquillaje',
};

async function loadProducts() {
  const text = await readFile(SEED_PATH, 'utf8');
  const matches = [...text.matchAll(/id: '([^']+)',\s+name: (?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"),\s+brand: (?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"),\s+category: '([^']+)'/gs)];

  return matches.map((match) => ({
    id: match[1],
    category: match[6],
    categoryFolder: CATEGORY_FOLDER_BY_ID[match[6]] || 'otros',
  }));
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const products = await loadProducts();
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8')) as DownloadReport[];
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const product of products) {
    await mkdir(path.join(OUT_DIR, product.categoryFolder), { recursive: true });
    for (let i = 1; i <= 4; i += 1) {
      const fileName = `${product.id}-${i}.jpg`;
      const source = path.join(OUT_DIR, fileName);
      const target = path.join(OUT_DIR, product.categoryFolder, fileName);
      if (await fileExists(source)) {
        await rename(source, target);
      }
    }
  }

  for (const entry of report) {
    const product = byId.get(entry.id);
    if (!product) continue;
    entry.category = product.category;
    entry.files = entry.files.map((file) => file.includes('/') ? file : `${product.categoryFolder}/${file}`);
  }

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Organized images for ${products.length} products`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
