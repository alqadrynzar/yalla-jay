const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createNotificationsTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدول الإشعارات (notifications)...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        link VARCHAR(255),
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "notifications" أو التأكد من وجوده.');

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    `);
    console.log('✅ تم: إنشاء فهرس (index) على حقل "user_id" لتحسين أداء الاستعلامات.');

    console.log('🎉 اكتملت عملية إنشاء جدول الإشعارات بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createNotificationsTableScript();
