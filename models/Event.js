const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  endDate: Date,
  location: String,
  todoList: [{
    task: String,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completed: {
      type: Boolean,
      default: false
    }
  }],
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['going', 'maybe', 'not_going'],
      default: 'maybe'
    }
  }],
  expenses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  polls: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Poll'
  }],
  coverImage: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', eventSchema);