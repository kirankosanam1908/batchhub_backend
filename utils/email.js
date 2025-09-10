const nodemailer = require('nodemailer');

// Create transporter (example with Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;
  
  await transporter.sendMail({
    from: '"BatchHub" <noreply@batchhub.com>',
    to: email,
    subject: 'Verify your email',
    html: `
      <h1>Welcome to BatchHub!</h1>
      <p>Please click the link below to verify your email:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${verificationUrl}</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
  });
};

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  
  await transporter.sendMail({
    from: '"BatchHub" <noreply@batchhub.com>',
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #FF5722; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};