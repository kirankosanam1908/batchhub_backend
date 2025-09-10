const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

const app = express();

// Fix CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',  // Vite default port
    'http://localhost:5173',  // Another common Vite port
    'http://localhost:5000',  // Keep this if needed
    'https://batchhub.netlify.app' ,
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',

  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // 24 hours
}));

// Make sure body parsing middleware comes after CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax' // Add this
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Add a test route to verify CORS
app.get('/test', (req, res) => {
  res.json({ message: 'Server is running and CORS is configured' });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log(' MongoDB connected successfully'))
.catch(err => console.error(' MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/communities', require('./routes/communities'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/events', require('./routes/events'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/polls', require('./routes/polls'));
app.use('/api/media', require('./routes/media'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});