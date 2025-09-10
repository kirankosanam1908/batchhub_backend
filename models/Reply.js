const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  thread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAccepted: {
    type: Boolean,
    default: false
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  attachments: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Reply', replySchema);