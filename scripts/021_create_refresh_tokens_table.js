const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createRefreshTokensTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدول توكنات التحديث (user_refresh_tokens)...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_revoked BOOLEAN DEFAULT false NOT NULL,
        CONSTRAINT uq_refresh_token UNIQUE (token)
      );
    `);
    console.log('✅ تم: إنشاء جدول "user_refresh_tokens" أو التأكد من وجوده.');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user_id ON user_refresh_tokens(user_id);
    `);
    console.log('✅ تم: إنشاء فهرس (index) على حقل "user_id" في جدول "user_refresh_tokens".');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_token ON user_refresh_tokens(token);
    `);
    console.log('✅ تم: إنشاء فهرس (index) على حقل "token" في جدول "user_refresh_tokens".');


    console.log('🎉 اكتملت عملية إنشاء جدول توكنات التحديث بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية إنشاء جدول توكنات التحديث:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createRefreshTokensTableScript();
