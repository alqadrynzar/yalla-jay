const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addFtsToProductsScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول products لدعم البحث بالنص الكامل (FTS)...');

    // الخطوة 1: إضافة عمود tsvector إذا لم يكن موجوداً
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS document_vector TSVECTOR;
    `);
    console.log('✅ تم: إضافة عمود "document_vector" إلى جدول "products" أو التأكد من وجوده.');

    // الخطوة 2: إنشاء أو استبدال دالة الـ Trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION product_document_vector_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.document_vector :=
          to_tsvector('arabic', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, ''));
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ تم: إنشاء أو استبدال دالة الـ Trigger "product_document_vector_trigger".');

    // الخطوة 3: حذف الـ Trigger القديم إذا كان موجوداً وإنشاء واحد جديد
    await client.query(`
      DROP TRIGGER IF EXISTS tsvectorupdate ON products;
    `);
    await client.query(`
      CREATE TRIGGER tsvectorupdate
      BEFORE INSERT OR UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION product_document_vector_trigger();
    `);
    console.log('✅ تم: إنشاء الـ Trigger "tsvectorupdate" على جدول "products".');

    // الخطوة 4: تحديث الصفوف الموجودة لملء document_vector (فقط إذا كانت فارغة)
    // هذا مهم للمنتجات التي كانت موجودة قبل إضافة العمود والـ Trigger
    console.log('⏳ جاري تحديث document_vector للمنتجات الموجودة...');
    const updateResult = await client.query(`
      UPDATE products
      SET document_vector = to_tsvector('arabic', coalesce(name, '') || ' ' || coalesce(description, ''))
      WHERE document_vector IS NULL;
    `);
    console.log(`✅ تم: تحديث document_vector لـ ${updateResult.rowCount} منتجاً موجوداً.`);

    // الخطوة 5: إنشاء فهرس GIN إذا لم يكن موجوداً
    await client.query(`
      CREATE INDEX IF NOT EXISTS products_document_vector_idx
      ON products
      USING GIN (document_vector);
    `);
    console.log('✅ تم: إنشاء فهرس GIN "products_document_vector_idx" على عمود "document_vector" أو التأكد من وجوده.');

    console.log('🎉 اكتملت عملية تهيئة البحث بالنص الكامل لجدول products بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية تهيئة FTS:', err);
    if (err.message && err.message.includes("text search configuration \"arabic\" does not exist")) {
        console.error("------------------------------------------------------------------------------------");
        console.error("خطأ هام: تهيئة البحث النصي للغة العربية ('arabic') غير موجودة في قاعدة بياناتك.");
        console.error("قد تحتاج إلى تثبيت حزم إضافية للغة العربية في PostgreSQL أو التأكد من تفعيلها.");
        console.error("يمكنك تجربة استخدام 'simple' بدلاً من 'arabic' في الدالة والـ UPDATE كحل مؤقت،");
        console.error("ولكن البحث لن يكون بنفس الكفاءة للغة العربية.");
        console.error("------------------------------------------------------------------------------------");
    }
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addFtsToProductsScript();
