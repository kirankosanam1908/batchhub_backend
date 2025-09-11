const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const passport = require('../config/passport');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { isAuthenticated } = require('../middleware/auth');
const { profileUpload } = require('../utils/cloudinary'); // Add this import
const bcrypt = require('bcryptjs'); // Add this import
const crypto = require('crypto');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Register with email/password
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    // Create new user
    const user = new User({
      email,
      password,
      name,
      emailVerificationToken: crypto.randomBytes(32).toString('hex')
    });
    
    await user.save();
    
    // Generate JWT token
    const token = generateToken(user._id);
    console.log("Hello");
    // TODO: Send verification email
    sendVerificationEmail(user.email, user.emailVerificationToken);
    
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login with email/password
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Check if user registered with Google
    if (user.googleId && !user.password) {
      return res.status(400).json({ 
        message: 'This email is registered with Google. Please use Google Sign-In.' 
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = generateToken(user._id);
    console.log(token)
    
    // Create session for consistency with Google OAuth
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Session creation failed' });
      }
      
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          profilePicture: user.profilePicture,
          isEmailVerified: user.isEmailVerified
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({ 
      emailVerificationToken: req.params.token 
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
    
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request password reset
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If email exists, reset link has been sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
    
    await user.save();
    
    // TODO: Send reset email
    sendPasswordResetEmail(user.email, resetToken);
    
    res.json({ message: 'If email exists, reset link has been sent' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reset password
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    
    // Update password
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Google OAuth routes (existing)
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Updated Google callback with token generation
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed` }),
  (req, res) => {
    try {
      // Generate JWT token for the Google-authenticated user
      const token = generateToken(req.user._id);

      // Redirect to frontend with token
      res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=token_generation_failed`);
    }
  }
);


// Get current user (works with both session and JWT)
router.get('/current', async (req, res) => {
  try {
    let user;
    
    // Check session first (Google OAuth)
    if (req.user) {
      user = await User.findById(req.user._id)
        .populate('communities', 'name type code')
        .select('-password -__v');
    } 
    // Check JWT token
    else if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      const { verifyToken } = require('../utils/jwt');
      
      try {
        const decoded = verifyToken(token);
        user = await User.findById(decoded.userId)
          .populate('communities', 'name type code')
          .select('-password -__v');
      } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }
    
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Logout (works for both session and JWT)
router.post('/logout', (req, res) => {
  if (req.user) {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      req.session.destroy();
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    // For JWT, client should remove token
    res.json({ message: 'Logged out successfully' });
  }
});

// ========== PROFILE UPDATE ROUTES ==========

// Update profile information
router.put('/profile', isAuthenticated, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
  body('location')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Location must be less than 100 characters'),
  body('website')
    .optional()
    .custom((value) => {
      if (value && value.trim() !== '') {
        // Basic URL validation
        const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
        if (!urlPattern.test(value)) {
          throw new Error('Please enter a valid URL');
        }
      }
      return true;
    }),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name, bio, location, website } = req.body;
    
    // Get current user ID from either session or JWT
    const userId = req.user._id || req.user.id;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        name: name.trim(), 
        bio: bio?.trim() || '',
        location: location?.trim() || '',
        website: website?.trim() || '',
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    ).select('-password -__v');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update profile picture
router.put('/profile-picture', isAuthenticated, (req, res, next) => {
  profileUpload.single('profilePicture')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ message: 'File upload error: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Get current user ID from either session or JWT
    const userId = req.user._id || req.user.id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        profilePicture: req.file.path,
        updatedAt: Date.now()
      },
      { new: true }
    ).select('-password -__v');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      success: true,
      message: 'Profile picture updated successfully',
      profilePicture: updatedUser.profilePicture,
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile picture update error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Change password
router.put('/change-password', isAuthenticated, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get current user ID from either session or JWT
    const userId = req.user._id || req.user.id;
    
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a password (might be Google-only user)
    if (!user.password) {
      return res.status(400).json({ 
        message: 'Cannot change password for Google-authenticated accounts' 
      });
    }
    
    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Don't allow same password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    // Hash new password and update
    user.password = newPassword; // Let the User model's pre-save hook handle hashing
    user.updatedAt = Date.now();
    await user.save();

    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete account (optional - for complete profile management)
router.delete('/delete-account', isAuthenticated, [
  body('password')
    .notEmpty()
    .withMessage('Password is required to delete account'),
  body('confirmEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required for confirmation'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { password, confirmEmail } = req.body;
    
    // Get current user ID from either session or JWT
    const userId = req.user._id || req.user.id;
    
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify email matches
    if (user.email !== confirmEmail) {
      return res.status(400).json({ message: 'Email confirmation does not match' });
    }

    // Verify password (skip for Google-only users)
    if (user.password) {
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Invalid password' });
      }
    }

    // TODO: Clean up user's data in other collections (notes, threads, etc.)
    
    // Delete the user
    await User.findByIdAndDelete(userId);

    // Logout if session exists
    if (req.user && req.session) {
      req.logout((err) => {
        if (err) console.error('Logout error during account deletion:', err);
      });
      req.session.destroy();
    }

    res.json({ 
      success: true,
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;