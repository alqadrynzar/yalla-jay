const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addMadeReadyAtToOrdersScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول "orders": إضافة عمود "made_ready_at"...');

    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS made_ready_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    `);
    console.log('✅ تم: إضافة عمود "made_ready_at" إلى جدول "orders" أو التأكد من وجوده.');

    console.log('🎉 اكتملت عملية تعديل جدول "orders" بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية تعديل جدول "orders":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addMadeReadyAtToOrdersScript();
