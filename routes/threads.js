const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Thread = require('../models/Thread');
const Reply = require('../models/Reply');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');

// Get threads for a community
router.get('/community/:communityId', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search, sortBy = 'recent' } = req.query;
    const query = { community: req.params.communityId };
    
    if (type) query.type = type;
    if (search) query.$text = { $search: search };
    
    let sort = {};
    switch (sortBy) {
      case 'recent': sort = { createdAt: -1 }; break;
      case 'popular': sort = { views: -1 }; break;
      case 'upvotes': sort = { upvotes: -1 }; break;
      default: sort = { createdAt: -1 };
    }
    
    const threads = await Thread.find(query)
      .populate('author', 'name email profilePicture')
      .populate('replies')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Thread.countDocuments(query);
    
    res.json({
      threads,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create thread
router.post('/create', [
  isAuthenticated,
  body('title').trim().isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('type').isIn(['academic', 'chillout']).withMessage('Invalid thread type'),
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
    const { title, content, type, tags } = req.body;
    
    const thread = new Thread({
      title,
      content,
      type,
      community: req.community._id,
      author: req.user._id,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });
    
    await thread.save();
    await thread.populate('author', 'name email profilePicture');
    
    res.status(201).json(thread);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single thread with replies
router.get('/:threadId', isAuthenticated, async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.threadId)
      .populate('author', 'name email profilePicture role')
      .populate({
        path: 'replies',
        populate: {
          path: 'author',
          select: 'name email profilePicture role'
        }
      });
    
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    
    // Increment views
    thread.views += 1;
    await thread.save();
    
    res.json(thread);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add reply to thread
router.post('/:threadId/reply', [
  isAuthenticated,
  body('content').trim().isLength({ min: 5 }).withMessage('Reply must be at least 5 characters'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    
    const { content } = req.body;
    
    const reply = new Reply({
      content,
      thread: thread._id,
      author: req.user._id
    });
    
    await reply.save();
    
    // Add reply to thread
    thread.replies.push(reply._id);
    thread.updatedAt = Date.now();
    await thread.save();
    
    await reply.populate('author', 'name email profilePicture role');
    
    res.status(201).json(reply);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Vote on thread
router.post('/:threadId/vote', isAuthenticated, async (req, res) => {
  try {
    const { voteType } = req.body; // 'upvote' or 'downvote'
    const thread = await Thread.findById(req.params.threadId);
    
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    
    const userId = req.user._id;
    const upvoteIndex = thread.upvotes.indexOf(userId);
    const downvoteIndex = thread.downvotes.indexOf(userId);
    
    if (voteType === 'upvote') {
      if (upvoteIndex > -1) {
        thread.upvotes.splice(upvoteIndex, 1);
      } else {
        thread.upvotes.push(userId);
        if (downvoteIndex > -1) {
          thread.downvotes.splice(downvoteIndex, 1);
        }
      }
    } else if (voteType === 'downvote') {
      if (downvoteIndex > -1) {
        thread.downvotes.splice(downvoteIndex, 1);
      } else {
        thread.downvotes.push(userId);
        if (upvoteIndex > -1) {
          thread.upvotes.splice(upvoteIndex, 1);
        }
      }
    }
    
    await thread.save();
    res.json({ upvotes: thread.upvotes.length, downvotes: thread.downvotes.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Pin/unpin thread (moderators only)
router.put('/:threadId/pin', isAuthenticated, async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.threadId).populate('community');
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    
    // Check if user is moderator
    if (!thread.community.moderators.includes(req.user._id)) {
      return res.status(403).json({ message: 'Only moderators can pin threads' });
    }
    
    thread.isPinned = !thread.isPinned;
    await thread.save();
    
    res.json({ isPinned: thread.isPinned });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark as resolved (thread author or moderators)
router.put('/:threadId/resolve', isAuthenticated, async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.threadId).populate('community');
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    
    const isModerator = thread.community.moderators.includes(req.user._id);
    const isAuthor = thread.author.equals(req.user._id);
    
    if (!isModerator && !isAuthor) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    
    thread.isResolved = !thread.isResolved;
    await thread.save();
    
    res.json({ isResolved: thread.isResolved });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;