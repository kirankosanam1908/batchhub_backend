const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Note = require('../models/Note');
const User = require('../models/User'); // Add this import
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');
const { noteUpload, getFileExtension,getFileUrl } = require('../utils/cloudinary');

// Get notes for a community
router.get('/community/:communityId', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const { page = 1, limit = 20, subject, semester, search } = req.query;
    const query = { community: req.params.communityId };
    
    if (subject) query.subject = subject;
    if (semester) query.semester = semester;
    if (search) {
      query.$text = { $search: search };
    }
    
    const notes = await Note.find(query)
      .populate('uploadedBy', 'name email profilePicture')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Note.countDocuments(query);
    
    res.json({
      notes,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('❌ Error fetching notes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/upload', [
  isAuthenticated,
  (req, res, next) => {
    console.log('📤 Upload attempt started for user:', req.user?.name);
    next();
  },
  noteUpload.single('file'),
  body('title').trim().isLength({ min: 3 }).withMessage('Title is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('communityId').isMongoId().withMessage('Valid community ID required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  isCommunityMember
], async (req, res) => {
  try {
    console.log('📋 Upload data received:', {
      body: req.body,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      } : 'No file'
    });

    const { title, description, subject, semester, tags } = req.body;
    const community = req.community;
    
    // Check if students can upload (if this setting exists)
    if (req.user.role === 'student' && community.settings?.allowStudentUploads === false) {
      return res.status(403).json({ message: 'Students cannot upload in this community' });
    }
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Get file extension from mimetype
    const fileExtension = getFileExtension(req.file.mimetype);
    
    // Ensure the URL is correct for the resource type
    const correctedFileUrl = getFileUrl(req.file.path);
    
    const note = new Note({
      title,
      description,
      subject,
      semester,
      fileUrl: correctedFileUrl,
      fileType: fileExtension,
      fileSize: req.file.size,
      community: community._id,
      uploadedBy: req.user._id,
      tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : []
    });
    
    await note.save();
    console.log('✅ Note saved successfully:', note._id);
    
    // Populate the response
    await note.populate('uploadedBy', 'name email profilePicture');
    
    res.status(201).json(note);
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload file',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Download/view note - Updated
router.get('/:noteId/download', isAuthenticated, async (req, res) => {
  try {
    const note = await Note.findById(req.params.noteId).populate('community');
    if (!note) {
      return res.status(404).json({ message: 'Study material not found' });
    }
    
    // Check if user has access to the community
    const user = await User.findById(req.user._id);
    if (!user.communities.includes(note.community._id)) {
      return res.status(403).json({ message: 'Access denied to this study material' });
    }
    
    // Increment download count
    note.downloads = (note.downloads || 0) + 1;
    await note.save();
    
    // Fix the URL if it's incorrect
    const correctedUrl = getFileUrl(note.fileUrl);
    
    console.log('📥 File accessed:', {
      noteId: note._id,
      title: note.title,
      originalUrl: note.fileUrl,
      correctedUrl: correctedUrl
    });
    
    // Return the corrected file URL for direct access
    res.json({ 
      url: correctedUrl,
      title: note.title,
      fileType: note.fileType,
      fileSize: note.fileSize
    });
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ message: 'Failed to access study material' });
  }
});




// Delete note (uploader or moderator only)
router.delete('/:noteId', isAuthenticated, async (req, res) => {
  try {
    const note = await Note.findById(req.params.noteId).populate('community');
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Check permissions
    const isModerator = note.community.moderators.includes(req.user._id);
    const isUploader = note.uploadedBy.equals(req.user._id);
    
    if (!isModerator && !isUploader) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    
    // TODO: Delete from Cloudinary as well
    // const publicId = note.fileUrl.split('/').pop().split('.')[0];
    // await deleteFile(publicId);
    
    await note.deleteOne();
    console.log('🗑️ Note deleted:', note._id);
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;