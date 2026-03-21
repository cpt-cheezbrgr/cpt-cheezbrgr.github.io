const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

async function uploadFile(fileBuffer, originalName, mimeType) {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}`);
  }
  if (fileBuffer.length > MAX_SIZE_BYTES) {
    throw new Error('File too large (max 10 MB)');
  }

  const ext = path.extname(originalName) || '.bin';
  const filename = `media/${uuidv4()}${ext}`;
  const file = bucket.file(filename);

  await file.save(fileBuffer, {
    contentType: mimeType,
    metadata: { originalName },
  });

  await file.makePublic();

  const url = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${filename}`;
  return { filename, url };
}

async function deleteFile(filename) {
  try {
    await bucket.file(filename).delete();
  } catch (err) {
    if (err.code !== 404) throw err;
  }
}

module.exports = { uploadFile, deleteFile };
