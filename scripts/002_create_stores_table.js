const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createStoresTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدول المتاجر (stores)...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address VARCHAR(255),
        phone_number VARCHAR(50),
        logo_url VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "stores" أو التأكد من وجوده.');
    console.log('🎉 اكتملت عملية إنشاء جدول المتاجر بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createStoresTableScript();
