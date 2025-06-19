const admin = require('firebase-admin');

let serviceAccount;

try {
  // اقرأ المفتاح من Environment Variable
  const key = process.env.FIREBASE_ADMIN_KEY;

  if (!key) {
    throw new Error('FIREBASE_ADMIN_KEY is not set in environment variables.');
  }

  serviceAccount = JSON.parse(key);
} catch (error) {
  console.error('❌ Failed to load Firebase service account key:', error);
  process.exit(1);
}

// تأكد من عدم التهيئة مرتين
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin SDK initialized successfully.');
}

module.exports = admin;

