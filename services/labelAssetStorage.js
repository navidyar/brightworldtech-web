'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LABEL_LIBRARY_STORAGE_RELATIVE_PATH } = require('../config/labelLibrary');

const MIME_EXTENSIONS = Object.freeze({
  'application/json': '.json',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg'
});

function resolveStorageRoot(rootOverride = null) {
  if (rootOverride) return path.resolve(String(rootOverride));
  if (process.env.LABEL_LIBRARY_STORAGE_ROOT) {
    return path.resolve(process.env.LABEL_LIBRARY_STORAGE_ROOT);
  }
  return path.resolve(process.cwd(), LABEL_LIBRARY_STORAGE_RELATIVE_PATH);
}

function getLabelLibraryStoragePaths(rootOverride = null) {
  const root = resolveStorageRoot(rootOverride);
  return Object.freeze({
    root,
    assetsRoot: path.join(root, 'assets', 'sha256'),
    tempRoot: path.join(root, 'tmp')
  });
}

async function inspectLabelLibraryStorage(rootOverride = null) {
  const paths = getLabelLibraryStoragePaths(rootOverride);
  const inspectPath = async (target) => {
    try {
      const stat = await fs.promises.stat(target);
      return { exists: true, isDirectory: stat.isDirectory() };
    } catch (error) {
      if (error.code === 'ENOENT') return { exists: false, isDirectory: false };
      throw error;
    }
  };

  return Object.freeze({
    paths,
    root: await inspectPath(paths.root),
    assets: await inspectPath(paths.assetsRoot),
    temp: await inspectPath(paths.tempRoot)
  });
}

async function ensureLabelLibraryStorage(rootOverride = null) {
  const paths = getLabelLibraryStoragePaths(rootOverride);
  await fs.promises.mkdir(paths.assetsRoot, { recursive: true });
  await fs.promises.mkdir(paths.tempRoot, { recursive: true });
  return paths;
}

function normalizeMimeType(mimeType) {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (!MIME_EXTENSIONS[normalized]) {
    throw new Error(`Unsupported label asset MIME type: ${mimeType || '(blank)'}.`);
  }
  return normalized;
}

function normalizeSha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Label asset SHA-256 must be a 64-character hexadecimal digest.');
  }
  return normalized;
}

function buildAssetRelativePath(sha256, mimeType) {
  const hash = normalizeSha256(sha256);
  const normalizedMime = normalizeMimeType(mimeType);
  return path.posix.join('assets', 'sha256', hash.slice(0, 2), `${hash}${MIME_EXTENSIONS[normalizedMime]}`);
}

function resolveAssetAbsolutePath(relativePath, rootOverride = null) {
  const root = getLabelLibraryStoragePaths(rootOverride).root;
  const candidate = path.resolve(root, String(relativePath || ''));
  const relative = path.relative(root, candidate);

  if (!relative || relative === '.') {
    throw new Error('A label asset path must point to a file below the repository root.');
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Label asset path escapes the repository root.');
  }

  return candidate;
}

async function writeContentAddressedAsset(buffer, { mimeType, rootPath = null } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Label asset content must be a non-empty Buffer.');
  }

  const normalizedMime = normalizeMimeType(mimeType);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const relativePath = buildAssetRelativePath(sha256, normalizedMime);
  const paths = await ensureLabelLibraryStorage(rootPath);
  const absolutePath = resolveAssetAbsolutePath(relativePath, rootPath);

  try {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) throw new Error(`Label asset path is not a file: ${relativePath}`);
    if (stat.size !== buffer.length) {
      throw new Error(`Existing label asset size does not match SHA-256 path: ${relativePath}`);
    }
    return Object.freeze({ sha256, relativePath, byteSize: stat.size, created: false });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  const tempPath = path.join(paths.tempRoot, `${sha256}-${crypto.randomUUID()}.tmp`);
  await fs.promises.writeFile(tempPath, buffer, { flag: 'wx' });

  try {
    try {
      await fs.promises.access(absolutePath, fs.constants.F_OK);
      await fs.promises.unlink(tempPath);
      return Object.freeze({ sha256, relativePath, byteSize: buffer.length, created: false });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await fs.promises.rename(tempPath, absolutePath);
    return Object.freeze({ sha256, relativePath, byteSize: buffer.length, created: true });
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }
}


async function deleteContentAddressedAsset(relativePath, { rootPath = null } = {}) {
  const absolutePath = resolveAssetAbsolutePath(relativePath, rootPath);
  try {
    await fs.promises.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  MIME_EXTENSIONS,
  resolveStorageRoot,
  getLabelLibraryStoragePaths,
  inspectLabelLibraryStorage,
  ensureLabelLibraryStorage,
  normalizeMimeType,
  normalizeSha256,
  buildAssetRelativePath,
  resolveAssetAbsolutePath,
  writeContentAddressedAsset,
  deleteContentAddressedAsset
};
