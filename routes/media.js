const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Media = require('../models/Media');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');
const { mediaUpload } = require('../utils/cloudinary');

// Get media for a community
router.get('/community/:communityId', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = { community: req.params.communityId };
    
    if (type) query.type = type;
    
    const media = await Media.find(query)
      .populate('uploadedBy', 'name email profilePicture')
      .populate('likes', 'name')
      .populate('comments.user', 'name profilePicture')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Media.countDocuments(query);
    
    res.json({
      media,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload media
router.post('/upload', [
  isAuthenticated,
  mediaUpload.array('files', 10), // Max 10 files at once
  body('communityId').isMongoId().withMessage('Valid community ID required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  isCommunityMember
], async (req, res) => {
  try {
    const { caption, eventId, tags } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    const mediaItems = [];
    
    for (const file of req.files) {
      const media = new Media({
        url: file.path,
        type: file.mimetype.startsWith('image') ? 'image' : 'video',
        caption,
        community: req.community._id,
        event: eventId,
        uploadedBy: req.user._id,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      });
      
      await media.save();
      mediaItems.push(media);
    }
    
    res.status(201).json(mediaItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Like/unlike media
router.post('/:mediaId/like', isAuthenticated, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    
    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }
    
    const userId = req.user._id;
    const likeIndex = media.likes.indexOf(userId);
    
    if (likeIndex > -1) {
      media.likes.splice(likeIndex, 1);
    } else {
      media.likes.push(userId);
    }
    
    await media.save();
    res.json({ 
      likes: media.likes.length,
      isLiked: likeIndex === -1
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add comment to media
router.post('/:mediaId/comment', [
  isAuthenticated,
  body('text').trim().notEmpty().withMessage('Comment cannot be empty'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    
    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }
    
    const comment = {
      user: req.user._id,
      text: req.body.text,
      createdAt: new Date()
    };
    
    media.comments.push(comment);
    await media.save();
    
    // Populate the new comment's user info
    await media.populate('comments.user', 'name profilePicture');
    const newComment = media.comments[media.comments.length - 1];
    
    res.json(newComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete comment (comment author only)
router.delete('/:mediaId/comment/:commentId', isAuthenticated, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    
    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }
    
    const comment = media.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    if (!comment.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }
    
    media.comments.pull(req.params.commentId);
    await media.save();
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete media (uploader or moderator only)
router.delete('/:mediaId', isAuthenticated, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId).populate('community');
    
    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }
    
    const isModerator = media.community.moderators.includes(req.user._id);
    const isUploader = media.uploadedBy.equals(req.user._id);
    
    if (!isModerator && !isUploader) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    
    // Delete from cloudinary
    const publicId = media.url.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`batchhub/media/${publicId}`);
    
    await media.deleteOne();
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;