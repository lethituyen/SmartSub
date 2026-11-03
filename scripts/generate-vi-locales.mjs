import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const enDir = path.join(root, 'renderer/public/locales/en');
const viDir = path.join(root, 'renderer/public/locales/vi');

if (!fs.existsSync(viDir)) {
  fs.mkdirSync(viDir, { recursive: true });
}

const PLACEHOLDER_REGEX = /(\{\{[^}]+\}\}|<\/?[a-zA-Z0-9_-]+>|%[sd]|(?<!\{)\{[0-9]+\}(?!\})|\n)/g;

function protectPlaceholders(text) {
  if (typeof text !== 'string') return { protectedText: text, placeholders: [] };
  const placeholders = [];
  const protectedText = text.replace(PLACEHOLDER_REGEX, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `⟦${idx}⟧`;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(text, placeholders) {
  if (typeof text !== 'string' || !placeholders.length) return text;
  return text.replace(/⟦\s*(\d+)\s*⟧/g, (match, idx) => {
    const i = parseInt(idx, 10);
    return placeholders[i] !== undefined ? placeholders[i] : match;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function translateBatchOnce(texts) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.append('client', 'dict-chrome-ex');
    params.append('sl', 'en');
    params.append('tl', 'vi');
    for (const t of texts) {
      params.append('q', t);
    }

    const options = {
      hostname: 'translate.googleapis.com',
      path: '/translate_a/t?' + params.toString(),
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function translateBatchWithRetry(texts, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const results = await translateBatchOnce(texts);
      if (Array.isArray(results) && results.length === texts.length) {
        return results;
      }
      throw new Error(`Length mismatch: sent ${texts.length}, got ${results?.length}`);
    } catch (err) {
      console.warn(`[Attempt ${attempt}/${maxRetries}] Batch failed: ${err.message}. Retrying...`);
      await delay(attempt * 1000);
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Special overrides for domain-specific terminology
const SPECIAL_TERMS = {
  SmartSub: 'SmartSub',
  Whisper: 'Whisper',
  'whisper.cpp': 'whisper.cpp',
  'faster-whisper': 'faster-whisper',
  FunASR: 'FunASR',
  VAD: 'VAD',
  CUDA: 'CUDA',
  CPU: 'CPU',
  GPU: 'GPU',
  FFmpeg: 'FFmpeg',
  GitHub: 'GitHub',
  SRT: 'SRT',
  VTT: 'VTT',
  ASS: 'ASS',
  LRC: 'LRC',
  TXT: 'TXT',
  API: 'API',
  URL: 'URL',
  JSON: 'JSON',
};

async function processFile(filename) {
  const enFilePath = path.join(enDir, filename);
  const viFilePath = path.join(viDir, filename);

  const rawEn = fs.readFileSync(enFilePath, 'utf8');
  const enData = JSON.parse(rawEn);

  console.log(`\nProcessing ${filename}...`);

  // Flatten leaf nodes with paths
  const items = [];
  function extract(node, pathArr = []) {
    if (typeof node === 'object' && node !== null) {
      for (const [key, val] of Object.entries(node)) {
        extract(val, [...pathArr, key]);
      }
    } else {
      items.push({ path: pathArr, original: node });
    }
  }
  extract(enData);

  console.log(`  Total leaf strings: ${items.length}`);

  // Batch translation
  const BATCH_SIZE = 30;
  const translatedItems = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE);
    const toTranslate = [];
    const meta = [];

    for (const item of slice) {
      if (typeof item.original !== 'string' || item.original.trim() === '') {
        meta.push({ item, skip: true, value: item.original });
      } else if (SPECIAL_TERMS[item.original]) {
        meta.push({ item, skip: true, value: SPECIAL_TERMS[item.original] });
      } else {
        const { protectedText, placeholders } = protectPlaceholders(item.original);
        meta.push({ item, skip: false, placeholders });
        toTranslate.push(protectedText);
      }
    }

    if (toTranslate.length > 0) {
      const translatedBatch = await translateBatchWithRetry(toTranslate);
      let tIdx = 0;
      for (const m of meta) {
        if (m.skip) {
          translatedItems.push({ item: m.item, translated: m.value });
        } else {
          const rawTrans = translatedBatch[tIdx++];
          const restored = restorePlaceholders(rawTrans, m.placeholders);
          translatedItems.push({ item: m.item, translated: restored });
        }
      }
    } else {
      for (const m of meta) {
        translatedItems.push({ item: m.item, translated: m.value });
      }
    }

    process.stdout.write(`  Translated ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}\r`);
    await delay(150);
  }

  // Rebuild object tree
  const viData = JSON.parse(JSON.stringify(enData)); // clone structure

  for (const t of translatedItems) {
    let current = viData;
    for (let p = 0; p < t.item.path.length - 1; p++) {
      current = current[t.item.path[p]];
    }
    const lastKey = t.item.path[t.item.path.length - 1];
    current[lastKey] = t.translated;
  }

  // Custom adjustments for specific files
  if (filename === 'settings.json') {
    viData.vietnamese = 'Tiếng Việt';
    viData.chinese = 'Tiếng Trung';
    viData.english = 'Tiếng Anh';
  }

  fs.writeFileSync(viFilePath, JSON.stringify(viData, null, 2) + '\n', 'utf8');
  console.log(`\n  ✓ Saved ${filename} (${translatedItems.length} strings)`);
}

async function main() {
  const files = fs.readdirSync(enDir).filter((f) => f.endsWith('.json')).sort();
  console.log(`Found ${files.length} locale files to translate to Vietnamese.`);

  for (const f of files) {
    await processFile(f);
  }

  console.log('\nAll locale files translated successfully!');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
