const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const { isAuthenticated, isCommunityMember } = require('../middleware/auth');
const { mediaUpload } = require('../utils/cloudinary');

// Get events for a community
router.get('/community/:communityId', [isAuthenticated, isCommunityMember], async (req, res) => {
  try {
    const { status = 'upcoming' } = req.query;
    const query = { community: req.params.communityId };
    
    const now = new Date();
    if (status === 'upcoming') {
      query.date = { $gte: now };
    } else if (status === 'past') {
      query.date = { $lt: now };
    }
    
    const events = await Event.find(query)
      .populate('createdBy', 'name email profilePicture')
      .populate('attendees.user', 'name email profilePicture')
      .sort(status === 'upcoming' ? 'date' : '-date');
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create event
router.post('/create', [
  isAuthenticated,
  mediaUpload.single('coverImage'),
  body('title').trim().isLength({ min: 3 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date required'),
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
    const { title, description, date, endDate, location } = req.body;
    
    const event = new Event({
      title,
      description,
      date,
      endDate,
      location,
      community: req.community._id,
      createdBy: req.user._id,
      coverImage: req.file ? req.file.path : undefined,
      attendees: [{
        user: req.user._id,
        status: 'going'
      }]
    });
    
    await event.save();
    await event.populate('createdBy', 'name email profilePicture');
    
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update attendance status
router.post('/:eventId/attendance', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const attendeeIndex = event.attendees.findIndex(
      a => a.user.toString() === req.user._id.toString()
    );
    
    if (attendeeIndex > -1) {
      event.attendees[attendeeIndex].status = status;
    } else {
      event.attendees.push({
        user: req.user._id,
        status
      });
    }
    
    await event.save();
    res.json({ message: 'Attendance updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add/update todo item
router.post('/:eventId/todo', isAuthenticated, async (req, res) => {
  try {
    const { task, assignedTo } = req.body;
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    event.todoList.push({
      task,
      assignedTo,
      completed: false
    });
    
    await event.save();
    res.json(event.todoList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Toggle todo completion
router.put('/:eventId/todo/:todoId', isAuthenticated, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const todo = event.todoList.id(req.params.todoId);
    if (!todo) {
      return res.status(404).json({ message: 'Todo not found' });
    }
    
    todo.completed = !todo.completed;
    await event.save();
    
    res.json(todo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;