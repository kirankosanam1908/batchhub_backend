const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
  try {
    // Check session (Google OAuth)
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    
    // Check JWT token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
        
        req.user = user;
        return next();
      } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }
    
    res.status(401).json({ message: 'Authentication required' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const isRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

const isCommunityMember = async (req, res, next) => {
  try {
    const Community = require('../models/Community');
    const communityId = req.params.communityId || req.body.communityId;
    
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    if (!community.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not a member of this community' });
    }
    
    req.community = community;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  isAuthenticated,
  isRole,
  isCommunityMember
};