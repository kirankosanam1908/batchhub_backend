const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Community = require('../models/Community');
const User = require('../models/User');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation failed for request:', req.body);
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ 
      message: 'Validation failed',
      errors: errors.array(),
      receivedData: req.body 
    });
  }
  next();
};



// Create community
router.post('/create', [
  isAuthenticated,
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Name must be 3-50 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 500 }).withMessage('Description must be 10-500 characters'),
  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['academic', 'chillout']).withMessage('Invalid community type'),
  handleValidationErrors
], async (req, res) => {
  console.log('Creating community - Passed validation');
  console.log('User ID:', req.user._id);
  console.log('Request body:', req.body);
  
  try {
    const { name, description, type } = req.body;
    
    const community = new Community({
      name,
      description,
      type,
      creator: req.user._id,
      moderators: [req.user._id],
      members: [req.user._id]
    });
    
    console.log('Saving community:', community);
    await community.save();
    console.log('Community saved successfully');
    
    // Add community to user's communities
    await User.findByIdAndUpdate(req.user._id, {
      $push: { communities: community._id }
    });
    console.log('Updated user communities');
    
    res.status(201).json(community);
  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Join community
router.post('/join', [
  isAuthenticated,
  body('code').trim().isLength({ min: 6, max: 6 }).withMessage('Invalid community code'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { code } = req.body;
    
    const community = await Community.findOne({ code: code.toUpperCase() });
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is already a member
    if (community.members.includes(req.user._id)) {
      return res.status(400).json({ message: 'Already a member' });
    }
    
    // Add user to community
    community.members.push(req.user._id);
    await community.save();
    
    // Add community to user's communities
    await User.findByIdAndUpdate(req.user._id, {
      $push: { communities: community._id }
    });
    
    res.json({ message: 'Joined successfully', community });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's communities
router.get('/my-communities', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'communities',
        select: 'name description type code coverImage members createdAt',
        populate: {
          path: 'creator',
          select: 'name email'
        }
      });
    
    res.json(user.communities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get community details
router.get('/:communityId', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const community = await Community.findById(req.params.communityId)
      .populate('creator', 'name email profilePicture')
      .populate('moderators', 'name email profilePicture')
      .populate('members', 'name email profilePicture role');
    
    res.json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update community settings (moderators only)
router.put('/:communityId/settings', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const community = req.community;
    
    // Check if user is moderator
    if (!community.moderators.includes(req.user._id)) {
      return res.status(403).json({ message: 'Only moderators can update settings' });
    }
    
    const { settings } = req.body;
    community.settings = { ...community.settings, ...settings };
    await community.save();
    
    res.json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Leave community
router.delete('/:communityId/leave', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const community = req.community;
    
    // Creator cannot leave
    if (community.creator.equals(req.user._id)) {
      return res.status(400).json({ message: 'Creator cannot leave the community' });
    }
    
    // Remove user from community
    community.members = community.members.filter(
      member => !member.equals(req.user._id)
    );
    community.moderators = community.moderators.filter(
      mod => !mod.equals(req.user._id)
    );
    await community.save();
    
    // Remove community from user
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { communities: community._id }
    });
    
    res.json({ message: 'Left community successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;