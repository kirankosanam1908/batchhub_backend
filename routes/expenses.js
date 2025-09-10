const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const Event = require('../models/Event');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');
const { mediaUpload } = require('../utils/cloudinary');

// Get expenses for a community or event
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
    
    const expenses = await Expense.find(query)
      .populate('paidBy', 'name email')
      .populate('splitBetween.user', 'name email')
      .sort('-createdAt');
    
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create expense
router.post('/create', [
  isAuthenticated,
  mediaUpload.single('receipt'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Valid amount required'),
  body('category').isIn(['food', 'transport', 'accommodation', 'entertainment', 'other']),
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
    const { title, amount, category, splitBetween, eventId, notes } = req.body;
    
    // Parse splitBetween if it's a string
    const splits = typeof splitBetween === 'string' ? JSON.parse(splitBetween) : splitBetween;
    
    const expense = new Expense({
      title,
      amount: parseFloat(amount),
      category,
      paidBy: req.user._id,
      splitBetween: splits,
      community: req.community._id,
      event: eventId,
      receipt: req.file ? req.file.path : undefined,
      notes
    });
    await expense.save();
    
    // If associated with an event, add to event's expenses
    if (eventId) {
      await Event.findByIdAndUpdate(eventId, {
        $push: { expenses: expense._id }
      });
    }
    
    await expense.populate('paidBy', 'name email');
    await expense.populate('splitBetween.user', 'name email');
    
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get expense summary for a user
router.get('/summary', isAuthenticated, async (req, res) => {
  try {
    const { communityId, eventId } = req.query;
    const userId = req.user._id;
    const query = {};
    
    if (eventId) {
      query.event = eventId;
    } else if (communityId) {
      query.community = communityId;
    }
    
    const expenses = await Expense.find(query);
    
    let totalPaid = 0;
    let totalOwed = 0;
    const balances = {};
    
    expenses.forEach(expense => {
      // If user paid
      if (expense.paidBy.equals(userId)) {
        totalPaid += expense.amount;
        
        expense.splitBetween.forEach(split => {
          if (!split.user.equals(userId) && !split.isPaid) {
            if (!balances[split.user]) {
              balances[split.user] = 0;
            }
            balances[split.user] += split.amount;
          }
        });
      }
      
      // If user owes
      expense.splitBetween.forEach(split => {
        if (split.user.equals(userId) && !expense.paidBy.equals(userId) && !split.isPaid) {
          totalOwed += split.amount;
          
          if (!balances[expense.paidBy]) {
            balances[expense.paidBy] = 0;
          }
          balances[expense.paidBy] -= split.amount;
        }
      });
    });
    
    res.json({
      totalPaid,
      totalOwed,
      netBalance: totalPaid - totalOwed,
      balances
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark expense as paid
router.put('/:expenseId/pay/:userId', isAuthenticated, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.expenseId);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Find the split for the user
    const split = expense.splitBetween.find(
      s => s.user.toString() === req.params.userId
    );
    
    if (!split) {
      return res.status(404).json({ message: 'User not found in expense split' });
    }
    
    // Only the person who paid or the person who owes can mark as paid
    if (!expense.paidBy.equals(req.user._id) && !split.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    
    split.isPaid = true;
    await expense.save();
    
    res.json({ message: 'Marked as paid' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete expense (only by creator)
router.delete('/:expenseId', isAuthenticated, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.expenseId);
    
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    if (!expense.paidBy.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the creator can delete this expense' });
    }
    
    // Remove from event if associated
    if (expense.event) {
      await Event.findByIdAndUpdate(expense.event, {
        $pull: { expenses: expense._id }
      });
    }
    
    await expense.deleteOne();
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;    