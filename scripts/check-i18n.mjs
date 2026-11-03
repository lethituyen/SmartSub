#!/usr/bin/env node
/**
 * i18n 质量门禁：
 * 1. zh/en namespace 文件集合与 key 集合必须完全对等
 * 2. 源码不允许新增 `t('key') || '兜底文案'` 模式（key 已保证存在，兜底只会掩盖缺键）
 * 退出码非 0 表示存在问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'renderer/public/locales');
const srcDirs = ['renderer/components', 'renderer/pages', 'renderer/hooks'].map(
  (d) => path.join(root, d),
);

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};

// ---------- 1. key 对等 ----------
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

const listJson = (loc) =>
  fs
    .readdirSync(path.join(localesDir, loc))
    .filter((f) => f.endsWith('.json'))
    .sort();

const locales = ['zh', 'en', 'vi'];

for (const loc of locales) {
  const files = listJson(loc);
  for (const otherLoc of locales) {
    if (loc === otherLoc) continue;
    const otherFiles = listJson(otherLoc);
    for (const f of files.filter((f) => !otherFiles.includes(f))) {
      fail(`namespace ${f} 仅存在于 ${loc}，缺失于 ${otherLoc}`);
    }
  }
}

const baseFiles = listJson('en');
for (const f of baseFiles) {
  const keysByLocale = Object.fromEntries(
    locales.map((loc) => [
      loc,
      new Set(
        flatten(
          JSON.parse(fs.readFileSync(path.join(localesDir, loc, f), 'utf8')),
        ),
      ),
    ]),
  );

  for (const loc of locales) {
    for (const otherLoc of locales) {
      if (loc === otherLoc) continue;
      for (const k of keysByLocale[loc]) {
        if (!keysByLocale[otherLoc].has(k)) {
          fail(`${f} 缺失于 ${otherLoc} 的 key: ${k} (存在于 ${loc})`);
        }
      }
    }
  }
}

// ---------- 2. 禁止 t() || '兜底' ----------
const fallbackPattern =
  /\bt\(\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*\{[^{}]*\})?\s*\)\s*\|\|\s*(?:'|"|`)/;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });

for (const dir of srcDirs) {
  for (const file of walk(dir)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (fallbackPattern.test(line)) {
        fail(
          `i18n 兜底模式（请补 key 而非兜底）: ${path.relative(root, file)}:${i + 1}`,
        );
      }
    });
  }
}

if (failed) {
  process.exit(1);
}
console.log('✓ i18n check passed: zh/en/vi key parity OK, no fallback patterns');
