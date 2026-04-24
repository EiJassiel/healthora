import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ProductSeedMeta = {
  id: string;
  name: string;
  brand: string;
  category: string;
  categoryFolder: string;
};

type DownloadReport = {
  id: string;
  name: string;
  brand: string;
  category: string;
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
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

const DOMAIN_SCORES: Record<string, number> = {
  'm.media-amazon.com': 90,
  'i5.walmartimages.com': 90,
  'i5.wal.co': 90,
  'target.scene7.com': 85,
  'media.ulta.com': 85,
  'www.sephora.com': 85,
  'images.ctfassets.net': 80,
  'static.beautytocare.com': 75,
  'cdn.shopify.com': 70,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unescapeJsString(value: string) {
  return value
    .replace(/\\u002f/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

function decodeQuotedString(singleQuoted?: string, doubleQuoted?: string) {
  const value = singleQuoted ?? doubleQuoted ?? '';
  return value.replace(/\\'/g, "'").replace(/\\"/g, '"');
}

async function loadProducts() {
  const text = await readFile(SEED_PATH, 'utf8');
  const productMatches = [...text.matchAll(/id: '([^']+)',\s+name: (?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"),\s+brand: (?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"),\s+category: '([^']+)'/gs)];

  return productMatches
    .map((match) => ({
      id: match[1],
      name: decodeQuotedString(match[2], match[3]),
      brand: decodeQuotedString(match[4], match[5]),
      category: match[6],
      categoryFolder: CATEGORY_FOLDER_BY_ID[match[6]] || 'otros',
    }))
    .filter((product) => !['Vitaminas', 'Cuidado personal', 'Cuidado del bebé', 'Suplementos', 'Salud de la piel', 'Fitness', 'Medicamentos', 'Hidratantes', 'Fragancias', 'Maquillaje'].includes(product.id));
}

function extractCandidates(html: string) {
  const seen = new Set<string>();
  const patterns = [
    /murl&quot;:&quot;([^&]+?)&quot;/g,
    /"murl":"(.*?)"/g,
    /https?:\/\/[^"'<> ]+\.(?:jpg|jpeg|png)/g,
  ];
  const candidates: string[] = [];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = unescapeJsString(match[1] || match[0]);
      if (!raw.startsWith('http')) continue;
      if (raw.includes('th?id=OIP.')) continue;
      if (raw.includes('/rp/')) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      candidates.push(raw);
    }
  }

  return candidates;
}

function scoreUrl(url: string) {
  let score = 0;
  try {
    const { hostname, pathname } = new URL(url);
    score += DOMAIN_SCORES[hostname] ?? 20;
    if (/1500|1600|2000|2048|1300x1300|1200x1200/i.test(url)) score += 20;
    if (/front|main|hero|primary|product/i.test(pathname)) score += 10;
    if (/back|side|angle|open|detail|alt/i.test(pathname)) score += 6;
    if (/\.jpeg($|\?)/i.test(url)) score += 4;
    if (/\.jpg($|\?)/i.test(url)) score += 5;
    if (/amazon|walmart|ulta|target|sephora|shopify|brand|beauty|pharmacy/i.test(hostname)) score += 8;
  } catch {
    score += 0;
  }
  return score;
}

async function fetchSearchHtml(query: string) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Bing search failed: ${res.status}`);
  return res.text();
}

async function downloadJpeg(url: string, outFile: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('jpeg') && !type.includes('jpg')) {
    throw new Error(`Unsupported content type: ${type || 'unknown'}`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength < 15000) {
    throw new Error(`Image too small: ${bytes.byteLength} bytes`);
  }
  await Bun.write(outFile, new Uint8Array(bytes));
  return bytes.byteLength;
}

async function removeOldImages(id: string) {
  for (let i = 1; i <= 4; i += 1) {
    const file = path.join(OUT_DIR, `${id}-${i}.jpg`);
    await rm(file, { force: true });
  }
}

async function removeCategoryImages(product: ProductSeedMeta) {
  for (let i = 1; i <= 4; i += 1) {
    const file = path.join(OUT_DIR, product.categoryFolder, `${product.id}-${i}.jpg`);
    await rm(file, { force: true });
  }
}

async function ensureDir() {
  await mkdir(OUT_DIR, { recursive: true });
}

async function ensureCategoryDir(folder: string) {
  await mkdir(path.join(OUT_DIR, folder), { recursive: true });
}

async function main() {
  await ensureDir();
  const limit = Number(process.argv[2] || '0');
  const products = (await loadProducts()).slice(0, limit > 0 ? limit : undefined);
  const reports: DownloadReport[] = [];

  for (const product of products) {
    const queries = [
      `${product.brand} ${product.name} product`,
      `site:amazon.com ${product.brand} ${product.name}`,
      `site:walmart.com ${product.brand} ${product.name}`,
    ];

    console.log(`\n[images] ${product.id}`);
    await removeOldImages(product.id);
    await removeCategoryImages(product);
    await ensureCategoryDir(product.categoryFolder);

    const candidateSet = new Set<string>();
    for (const query of queries) {
      try {
        const html = await fetchSearchHtml(query);
        for (const candidate of extractCandidates(html)) candidateSet.add(candidate);
        await sleep(300);
      } catch (error) {
        console.log(`  search failed for query: ${query}`);
      }
    }

    const candidates = [...candidateSet].sort((a, b) => scoreUrl(b) - scoreUrl(a));
    const downloadedFiles: string[] = [];
    const usedSources: string[] = [];
    const warnings: string[] = [];

    for (const candidate of candidates) {
      if (downloadedFiles.length === 4) break;
      const index = downloadedFiles.length + 1;
      const fileName = `${product.id}-${index}.jpg`;
      const relativeFile = `${product.categoryFolder}/${fileName}`;
      const outFile = path.join(OUT_DIR, product.categoryFolder, fileName);

      try {
        const size = await downloadJpeg(candidate, outFile);
        downloadedFiles.push(relativeFile);
        usedSources.push(candidate);
        console.log(`  ok ${index}/4 ${Math.round(size / 1024)}KB ${candidate}`);
        await sleep(150);
      } catch {
        continue;
      }
    }

    if (downloadedFiles.length > 0 && downloadedFiles.length < 4) {
      const filler = downloadedFiles[downloadedFiles.length - 1];
      for (let i = downloadedFiles.length + 1; i <= 4; i += 1) {
        const fileName = `${product.id}-${i}.jpg`;
        const relativeFile = `${product.categoryFolder}/${fileName}`;
        const outFile = path.join(OUT_DIR, product.categoryFolder, fileName);
        const sourceFile = path.join(OUT_DIR, filler);
        const bytes = await readFile(sourceFile);
        await Bun.write(outFile, bytes);
        downloadedFiles.push(relativeFile);
        warnings.push(`Filled slot ${i} by duplicating ${filler}`);
      }
    }

    if (downloadedFiles.length === 0) {
      warnings.push('No JPEG images downloaded');
      console.log('  failed to download any JPEG image');
    }

    reports.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      downloaded: downloadedFiles.length,
      files: downloadedFiles,
      queries,
      sources: usedSources,
      warnings,
    });
  }

  await writeFile(REPORT_PATH, `${JSON.stringify(reports, null, 2)}\n`, 'utf8');

  const success = reports.filter((report) => report.downloaded === 4).length;
  const partial = reports.filter((report) => report.downloaded > 0 && report.downloaded < 4).length;
  const failed = reports.filter((report) => report.downloaded === 0).length;
  console.log(`\n[images] complete: ${success} full, ${partial} partial, ${failed} failed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
