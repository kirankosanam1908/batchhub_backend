const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  subject: {
    type: String,
    required: true
  },
  semester: String,
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'doc', 'ppt', 'image', 'video', 'other']
  },
  fileSize: Number,
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tags: [String],
  downloads: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

noteSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Note', noteSchema);