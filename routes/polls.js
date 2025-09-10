const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Poll = require('../models/Poll');
const Event = require('../models/Event');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');

// Get polls for a community or event
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { communityId, eventId } = req.query;
    const query = {};
    
    if (eventId) {
      query.event = eventId;
    } else if (communityId) {
      query.community = communityId;
    } else {
      return res.status(400).json({ message: 'Community or event ID required' });
    }
    
    const polls = await Poll.find(query)
      .populate('createdBy', 'name email profilePicture')
      .populate('options.votes', 'name email')
      .sort('-createdAt');
    
    // Hide voter details if anonymous
    const sanitizedPolls = polls.map(poll => {
      if (poll.isAnonymous) {
        const sanitizedPoll = poll.toObject();
        sanitizedPoll.options.forEach(option => {
          option.voteCount = option.votes.length;
          option.votes = [];
        });
        return sanitizedPoll;
      }
      return poll;
    });
    
    res.json(sanitizedPolls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create poll
router.post('/create', [
  isAuthenticated,
  body('question').trim().isLength({ min: 5 }).withMessage('Question must be at least 5 characters'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('options.*.text').trim().notEmpty().withMessage('Option text required'),
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
    const { question, options, eventId, isAnonymous, multipleChoice, endsAt } = req.body;
    
    const poll = new Poll({
      question,
      options: options.map(opt => ({ text: opt.text || opt, votes: [] })),
      community: req.community._id,
      event: eventId,
      createdBy: req.user._id,
      isAnonymous: isAnonymous || false,
      multipleChoice: multipleChoice || false,
      endsAt: endsAt ? new Date(endsAt) : undefined
    });
    
    await poll.save();
    
    // If associated with an event, add to event's polls
    if (eventId) {
      await Event.findByIdAndUpdate(eventId, {
        $push: { polls: poll._id }
      });
    }
    
    await poll.populate('createdBy', 'name email profilePicture');
    
    res.status(201).json(poll);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Vote on poll
router.post('/:pollId/vote', isAuthenticated, async (req, res) => {
  try {
    const { optionIds } = req.body; // Array for multiple choice, single ID for single choice
    const poll = await Poll.findById(req.params.pollId);
    
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    
    // Check if poll has ended
    if (poll.endsAt && new Date() > poll.endsAt) {
      return res.status(400).json({ message: 'Poll has ended' });
    }
    
    const userId = req.user._id;
    const selectedOptions = Array.isArray(optionIds) ? optionIds : [optionIds];
    
    // Validate multiple choice
    if (!poll.multipleChoice && selectedOptions.length > 1) {
      return res.status(400).json({ message: 'Only one option allowed' });
    }
    
    // Remove previous votes
    poll.options.forEach(option => {
      option.votes = option.votes.filter(vote => !vote.equals(userId));
    });
    
    // Add new votes
    selectedOptions.forEach(optionId => {
      const option = poll.options.id(optionId);
      if (option && !option.votes.includes(userId)) {
        option.votes.push(userId);
      }
    });
    
    await poll.save();
    
    // Return results
    const results = poll.options.map(option => ({
      _id: option._id,
      text: option.text,
      voteCount: option.votes.length,
      percentage: poll.options.reduce((sum, opt) => sum + opt.votes.length, 0) > 0
        ? (option.votes.length / poll.options.reduce((sum, opt) => sum + opt.votes.length, 0) * 100).toFixed(1)
        : 0
    }));
    
    res.json({
      pollId: poll._id,
      results,
      userVotes: selectedOptions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get poll results
router.get('/:pollId/results', isAuthenticated, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.pollId)
      .populate('createdBy', 'name email')
      .populate('options.votes', 'name email profilePicture');
    
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    
    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
    
    const results = poll.options.map(option => ({
      _id: option._id,
      text: option.text,
      voteCount: option.votes.length,
      percentage: totalVotes > 0 ? (option.votes.length / totalVotes * 100).toFixed(1) : 0,
      voters: poll.isAnonymous ? [] : option.votes
    }));
    
    res.json({
      poll: {
        _id: poll._id,
        question: poll.question,
        createdBy: poll.createdBy,
        isAnonymous: poll.isAnonymous,
        multipleChoice: poll.multipleChoice,
        endsAt: poll.endsAt,
        createdAt: poll.createdAt
      },
      results,
      totalVotes
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete poll (creator only)
router.delete('/:pollId', isAuthenticated, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.pollId);
    
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    
    if (!poll.createdBy.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the creator can delete this poll' });
    }
    
    // Remove from event if associated
    if (poll.event) {
      await Event.findByIdAndUpdate(poll.event, {
        $pull: { polls: poll._id }
      });
    }
    
    await poll.deleteOne();
    res.json({ message: 'Poll deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;