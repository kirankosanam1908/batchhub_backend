const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Test cloudinary connection
const testCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connected successfully:', result);
    return true;
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error.message);
    return false;
  }
};

// Call the test function
testCloudinaryConnection();

// Helper function to get file extension from mimetype
const getFileExtension = (mimetype) => {
  const extensions = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar'
  };
  return extensions[mimetype] || 'unknown';
};

// Helper function to determine resource type
const getResourceType = (mimetype) => {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  const videoTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm'];
  
  if (imageTypes.includes(mimetype)) {
    return 'image';
  } else if (videoTypes.includes(mimetype)) {
    return 'video';
  } else {
    return 'raw'; // For PDFs, docs, etc.
  }
};

// Note upload storage configuration
const noteStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const fileExtension = getFileExtension(file.mimetype);
    const resourceType = getResourceType(file.mimetype);
    
    console.log('📁 Uploading file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      extension: fileExtension,
      resourceType: resourceType
    });
    
    return {
      folder: 'batchhub/notes',
      public_id: `note_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
    };
  }
});

// Note upload configuration
const noteUpload = multer({
  storage: noteStorage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    console.log('📁 File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      console.log('✅ File type accepted:', file.mimetype);
      cb(null, true);
    } else {
      console.log('❌ File type rejected:', file.mimetype);
      cb(new Error(`Invalid file type: ${file.mimetype}. Only documents and images are allowed.`), false);
    }
  }
});

// Media upload configuration (for gallery)
const mediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const resourceType = getResourceType(file.mimetype);
    return {
      folder: 'batchhub/media',
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
    };
  }
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'video/mp4',
      'video/mov',
      'video/avi',
      'video/webm'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});

// Profile picture upload configuration
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'batchhub/profiles',
    resource_type: 'image',
    transformation: [
      { width: 300, height: 300, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  }
});

const profileUpload = multer({
  storage: profileStorage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG and PNG images are allowed.'), false);
    }
  }
});

// Utility function to delete files from cloudinary
const deleteFile = async (publicId, resourceType = 'auto') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log('🗑️ File deleted from Cloudinary:', result);
    return result;
  } catch (error) {
    console.error('❌ Error deleting file from Cloudinary:', error);
    throw error;
  }
};

// Utility function to get optimized URL
const getOptimizedUrl = (publicId, transformations = [], resourceType = 'auto') => {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    ...transformations,
    secure: true,
    quality: 'auto',
    fetch_format: 'auto'
  });
};

// Utility function to get correct file URL based on resource type
const getFileUrl = (fileUrl) => {
  // If the URL has '/image/upload/' but should be '/raw/upload/', fix it
  if (fileUrl.includes('/image/upload/') && (fileUrl.includes('.pdf') || fileUrl.includes('.doc') || fileUrl.includes('.xls') || fileUrl.includes('.ppt'))) {
    return fileUrl.replace('/image/upload/', '/raw/upload/');
  }
  return fileUrl;
};

module.exports = {
  cloudinary,
  noteUpload,
  mediaUpload,
  profileUpload,
  deleteFile,
  getOptimizedUrl,
  getFileExtension,
  getResourceType,
  getFileUrl
};