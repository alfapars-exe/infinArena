#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const i18nFilePath = path.join(repoRoot, "frontend", "src", "lib", "i18n.ts");

function countChar(line, char) {
  let count = 0;
  for (const current of line) {
    if (current === char) count += 1;
  }
  return count;
}

function extractLocaleEntries(source, locale) {
  const lines = source.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    new RegExp(`^\\s*${locale}\\s*:\\s*\\{\\s*$`).test(line)
  );

  if (startIndex < 0) {
    throw new Error(`Could not find "${locale}" locale block in i18n.ts`);
  }

  const entries = new Map();
  let depth = 0;
  let started = false;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    depth += countChar(line, "{");
    depth -= countChar(line, "}");
    started = true;

    if (i > startIndex) {
      const match = line.match(/^\s*"([^"]+)":\s*"((?:\\.|[^"\\])*)",?\s*$/);
      if (match) {
        entries.set(match[1], match[2]);
      }
    }

    if (started && depth === 0) break;
  }

  return entries;
}

function extractPlaceholders(text) {
  return [...text.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .sort();
}

function walkDirectory(dirPath, collector) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(entryPath, collector);
      continue;
    }
    collector.push(entryPath);
  }
}

function toPosixPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

const issues = [];

const i18nSource = fs.readFileSync(i18nFilePath, "utf8");
const enEntries = extractLocaleEntries(i18nSource, "en");
const trEntries = extractLocaleEntries(i18nSource, "tr");

const enKeys = [...enEntries.keys()];
const trKeys = [...trEntries.keys()];

for (const key of enKeys) {
  if (!trEntries.has(key)) {
    issues.push(`Missing key in tr locale: ${key}`);
  }
}

for (const key of trKeys) {
  if (!enEntries.has(key)) {
    issues.push(`Extra key in tr locale: ${key}`);
  }
}

for (const key of enKeys) {
  const enText = enEntries.get(key);
  const trText = trEntries.get(key);
  if (typeof trText !== "string") continue;

  const enVars = extractPlaceholders(enText);
  const trVars = extractPlaceholders(trText);
  if (JSON.stringify(enVars) !== JSON.stringify(trVars)) {
    issues.push(
      `Placeholder mismatch for "${key}": en={${enVars.join(",")}} tr={${trVars.join(",")}}`
    );
  }
}

const transliterationChecks = [
  { pattern: /\bLutfen\b/g, suggestion: "Lütfen" },
  { pattern: /\blutfen\b/g, suggestion: "lütfen" },
  { pattern: /\byukleniyor\b/g, suggestion: "yükleniyor" },
  { pattern: /\bYukleniyor\b/g, suggestion: "Yükleniyor" },
  { pattern: /\bbaglaniliyor\b/g, suggestion: "bağlanılıyor" },
  { pattern: /\bBaglaniliyor\b/g, suggestion: "Bağlanılıyor" },
  { pattern: /\bDogru\b/g, suggestion: "Doğru" },
  { pattern: /\bdogru\b/g, suggestion: "doğru" },
  { pattern: /\bYanlis\b/g, suggestion: "Yanlış" },
  { pattern: /\byanlis\b/g, suggestion: "yanlış" },
  { pattern: /\bgonderilemedi\b/g, suggestion: "gönderilemedi" },
  { pattern: /\bGelistirme\b/g, suggestion: "Geliştirme" },
  { pattern: /\bBirlesik\b/g, suggestion: "Birleşik" },
  { pattern: /\bAyrik\b/g, suggestion: "Ayrık" },
  { pattern: /\bVarsayilan\b/g, suggestion: "Varsayılan" },
  { pattern: /\bDegiskenleri\b/g, suggestion: "Değişkenleri" },
  { pattern: /\bNotlari\b/g, suggestion: "Notları" },
  { pattern: /\bonerilen\b/g, suggestion: "önerilen" },
  { pattern: /\byarismaci\b/g, suggestion: "yarışmacı" },
  { pattern: /\bduzenlendi\b/g, suggestion: "düzenlendi" },
  { pattern: /\bcalisacak\b/g, suggestion: "çalışacak" },
  { pattern: /\bcalistirir\b/g, suggestion: "çalıştırır" },
  { pattern: /\bdonuk\b/g, suggestion: "dönük" },
  { pattern: /\bGuvenlik\b/g, suggestion: "Güvenlik" },
  { pattern: /\bbaslangicinda\b/g, suggestion: "başlangıcında" },
  { pattern: /\buretilir\b/g, suggestion: "üretilir" },
  { pattern: /\btanimlayin\b/g, suggestion: "tanımlayın" },
  { pattern: /\bbaglanacagi\b/g, suggestion: "bağlanacağı" },
];

const filesToScan = [
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "backend", "README.md"),
  path.join(repoRoot, "frontend", "README.md"),
  path.join(repoRoot, "frontend", "src", "lib", "i18n.ts"),
];

const frontendSourceFiles = [];
walkDirectory(path.join(repoRoot, "frontend", "src"), frontendSourceFiles);
for (const filePath of frontendSourceFiles) {
  if (!/\.(ts|tsx)$/.test(filePath)) continue;
  filesToScan.push(filePath);
}

const uniqueFiles = [...new Set(filesToScan)];
for (const filePath of uniqueFiles) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  for (const check of transliterationChecks) {
    check.pattern.lastIndex = 0;
    const match = check.pattern.exec(content);
    if (match) {
      issues.push(
        `${toPosixPath(filePath)} contains "${match[0]}". Suggested: "${check.suggestion}".`
      );
    }
  }
}

if (issues.length > 0) {
  console.error("l10n check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("l10n check passed.");
