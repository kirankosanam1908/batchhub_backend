const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  options: [{
    text: {
      type: String,
      required: true
    },
    votes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  multipleChoice: {
    type: Boolean,
    default: false
  },
  endsAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Poll', pollSchema);