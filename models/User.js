const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // For Google OAuth users
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values
  },
  
  // Common fields
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  
  // For email/password users
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Required only if not using Google OAuth
    }
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Profile fields
  profilePicture: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 500,
    default: '',
    trim: true
  },
  location: {
    type: String,
    maxlength: 100,
    default: '',
    trim: true
  },
  website: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function(v) {
        if (!v || v.trim() === '') return true; // Allow empty
        // Basic URL validation
        const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
        return urlPattern.test(v);
      },
      message: 'Please enter a valid URL'
    }
  },
  
  // User role and communities
  role: {
    type: String,
    enum: ['student', 'cr', 'teacher'],
    default: 'student'
  },
  communities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community'
  }],
  
  // Settings (for future use)
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    communityInvites: {
      type: Boolean,
      default: true
    },
    profileVisibility: {
      type: String,
      enum: ['public', 'communities', 'private'],
      default: 'public'
    }
  },
  
  // Privacy settings (for future use)
  privacy: {
    showEmail: {
      type: Boolean,
      default: false
    },
    showLocation: {
      type: Boolean,
      default: true
    },
    allowMessaging: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true // This adds createdAt and updatedAt automatically
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcryptjs.genSalt(12); // Increased salt rounds for better security
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcryptjs.compare(candidatePassword, this.password);
};

// Method to get public profile (excluding sensitive data)
userSchema.methods.getPublicProfile = function() {
  const publicProfile = this.toObject();
  delete publicProfile.password;
  delete publicProfile.emailVerificationToken;
  delete publicProfile.passwordResetToken;
  delete publicProfile.passwordResetExpires;
  delete publicProfile.googleId;
  delete publicProfile.__v;
  
  return publicProfile;
};

// Static method to find users by community
userSchema.statics.findByCommunity = function(communityId) {
  return this.find({ communities: communityId })
    .select('-password -emailVerificationToken -passwordResetToken -passwordResetExpires')
    .populate('communities', 'name type');
};

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ communities: 1 });

module.exports = mongoose.model('User', userSchema);