const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addSupportPhoneToServiceRegionsScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية التعديل: إضافة عمود support_phone_number إلى جدول service_regions...');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE service_regions
      ADD COLUMN IF NOT EXISTS support_phone_number VARCHAR(50);
    `);
    console.log('✅ تم: إضافة عمود "support_phone_number" إلى جدول "service_regions" أو التأكد من وجوده.');

    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية تعديل جدول service_regions بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية تعديل جدول service_regions:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addSupportPhoneToServiceRegionsScript();
