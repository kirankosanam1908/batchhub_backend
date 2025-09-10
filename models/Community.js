const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['academic', 'chillout'],
    required: true
  },
  code: {
    type: String,
    unique: true,
    uppercase: true
  },
  coverImage: String,
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowStudentUploads: {
      type: Boolean,
      default: true
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate unique community code
communitySchema.pre('save', function(next) {
  if (!this.code) {
    this.code = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Community', communitySchema);