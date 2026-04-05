const router = require('express').Router();
const multer = require('multer');
const { uploadFile, deleteFile } = require('../services/storage');
const { saveMedia, listMedia, deleteMedia, getMedia } = require('../services/firestore');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Upload image
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid image file provided' });
  try {
    const { filename, url } = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    const record = await saveMedia({
      filename,
      originalName: req.file.originalname,
      url,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user.id,
    });
    res.status(201).json(record);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// List media
router.get('/', async (req, res) => {
  try {
    const result = await listMedia({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 24,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Delete media
router.delete('/:id', async (req, res) => {
  try {
    const record = await getMedia(req.params.id);
    if (!record) return res.status(404).json({ error: 'Media not found' });

    await deleteFile(record.filename);
    await deleteMedia(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

module.exports = router;
