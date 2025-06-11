const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createCategoriesTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدول الأقسام (categories) مع حقل للصورة...');

    // الخطوة 1: إنشاء دالة لتحديث updated_at تلقائياً
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ تم: إنشاء أو تحديث دالة "trigger_set_timestamp".');

    // الخطوة 2: إنشاء جدول categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(255), -- <<-- هذا هو العمود الجديد للصورة (اختياري)
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "categories" مع حقل الصورة أو التأكد من وجوده.');

    // الخطوة 3: إنشاء "زناد" (Trigger) لتحديث updated_at على جدول categories
    await client.query(`
      DROP TRIGGER IF EXISTS set_categories_timestamp ON categories;
    `);
    await client.query(`
      CREATE TRIGGER set_categories_timestamp
      BEFORE UPDATE ON categories
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء الزناد "set_categories_timestamp" لجدول "categories".');
    console.log('🎉 اكتملت عملية إنشاء جدول الأقسام وملحقاته بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createCategoriesTableScript();
