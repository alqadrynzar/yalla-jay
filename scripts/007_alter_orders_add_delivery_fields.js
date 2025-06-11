const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const alterOrdersTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية التعديل: إضافة حقول جديدة إلى جدول orders...');

    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_estimated_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS delivery_worker_rejection_reason TEXT;
    `);
    console.log('✅ تم: إضافة حقول delivery_estimated_at و delivery_worker_rejection_reason إلى جدول "orders" أو التأكد من وجودها.');

    console.log('🎉 اكتملت عملية تعديل جدول orders بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية تعديل الجدول:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

alterOrdersTableScript();
