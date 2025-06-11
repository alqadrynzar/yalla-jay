const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addStoreTypeToStoresScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية التعديل: إنشاء ENUM لأنواع المتاجر وإضافة عمود store_type إلى جدول stores...');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE store_category_type_enum AS ENUM (
          'grocery_supermarket', 
          'restaurant', 
          'sweets_hospitality', 
          'home_appliances_supplies', 
          'clothing_accessories', 
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN 
          RAISE NOTICE 'النوع "store_category_type_enum" موجود بالفعل، تم التجاوز.';
      END $$;
    `);
    console.log('✅ تم: إنشاء نوع "store_category_type_enum" أو التأكد من وجوده.');

    await client.query(`
      ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS store_type store_category_type_enum DEFAULT 'other';
    `);
    console.log('✅ تم: إضافة عمود "store_type" إلى جدول "stores" مع قيمة افتراضية "other" أو التأكد من وجوده.');

    console.log('🎉 اكتملت عملية تعديل جدول stores بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية التعديل:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addStoreTypeToStoresScript();
