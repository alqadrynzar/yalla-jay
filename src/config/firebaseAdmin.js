const admin = require('firebase-admin');
const path = require('path');

// Resolve the path to the service account key
const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// Export the initialized admin object to be used in other parts of the application
module.exports = admin;
