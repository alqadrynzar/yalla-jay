const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createFcmTokensTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الترحيل: إنشاء جدول user_fcm_tokens...');
    await client.query('BEGIN');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS user_fcm_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, token)
      );
    `;

    await client.query(createTableQuery);
    console.log('✅ تم: إنشاء جدول "user_fcm_tokens" أو التأكد من وجوده.');

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_id ON user_fcm_tokens(user_id);
    `;
    await client.query(createIndexQuery);
    console.log('✅ تم: إنشاء فهرس لـ "user_id" أو التأكد من وجوده.');

    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية ترحيل جدول user_fcm_tokens بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية ترحيل جدول user_fcm_tokens:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createFcmTokensTableScript();
