const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addUpdatedAtToStoresScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول "stores": إضافة عمود "updated_at" والمُحفِّز الخاص به...');

    // الخطوة 1: إضافة عمود updated_at إذا لم يكن موجودًا
    await client.query(`
      ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('✅ تم: إضافة عمود "updated_at" إلى جدول "stores" أو التأكد من وجوده.');

    // الخطوة 2: التأكد من وجود دالة المُحفِّز (إنشاء أو استبدال)
    // هذه الدالة عامة ويمكن استخدامها بواسطة جداول متعددة
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ تم: إنشاء أو تحديث دالة المُحفِّز "trigger_set_timestamp".');

    // الخطوة 3: إنشاء أو إعادة إنشاء المُحفِّز لجدول "stores"
    // أولاً، نحذف المُحفِّز القديم إذا كان موجودًا لتجنب أي أخطاء
    await client.query(`
      DROP TRIGGER IF EXISTS set_stores_timestamp ON stores;
    `);
    // ثم نُنشئ المُحفِّز الجديد
    await client.query(`
      CREATE TRIGGER set_stores_timestamp
      BEFORE UPDATE ON stores
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء المُحفِّز "set_stores_timestamp" لجدول "stores".');

    console.log('🎉 اكتملت عملية تعديل جدول "stores" بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية تعديل جدول "stores":', err);
  } finally {
    client.release();
    await pool.end(); // نغلق pool الاتصالات بعد انتهاء السكربت
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addUpdatedAtToStoresScript();
