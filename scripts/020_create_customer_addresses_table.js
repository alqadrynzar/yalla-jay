const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // تمت الإضافة لمطابقة أسلوبك
const pool = require('../src/config/database.js'); // المسار صحيح الآن

const createCustomerAddressesTableMigration = async () => {
  const client = await pool.connect();
  console.log('بدء عملية إنشاء جدول "customer_addresses"...');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        address_label VARCHAR(100),
        full_address TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "customer_addresses" أو التأكد من وجوده.');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);
    `);
    console.log('✅ تم: إنشاء فهرس "idx_customer_addresses_user_id" على جدول "customer_addresses" أو التأكد من وجوده.');

    console.log('🎉 اكتملت عملية ترحيل جدول "customer_addresses" بنجاح!');

  } catch (err) {
    // طباعة الخطأ الكامل هنا ليظهر في الطرفية
    console.error('❌ حدث خطأ أثناء عملية ترحيل جدول "customer_addresses":', err);
    // لا تقم بإعادة throw للخطأ هنا إذا كنت تريد للـ finally أن ينفذ دائماً لغلق الـ pool
    // ولكن بما أننا نريد للسكربت أن يشير إلى فشل، يمكننا إعادة throw أو الخروج بكود خطأ
    throw err; // أعد throw للسماح بمعالجة الخطأ في المستوى الأعلى إذا لزم الأمر، أو للخروج بكود خطأ
  } finally {
    if (client) {
      client.release();
      console.log('تم تحرير الاتصال بالموكل (client).');
    }
    // لا تقم بإغلاق pool هنا إذا كانت هناك عمليات أخرى قد تستخدمه مباشرة بعد هذا السكربت
    // في مثالك السابق، تم إغلاقه. سنتبع ذلك.
  }
};

// دالة رئيسية لتشغيل السكربت وإغلاق الـ pool بشكل نهائي
const runMigration = async () => {
  try {
    await createCustomerAddressesTableMigration();
  } catch (error) {
    console.error("❌ فشل سكربت الترحيل 020 في التنفيذ بشكل كامل.");
    // الخطأ الأصلي يجب أن يكون قد طُبع بالفعل من داخل createCustomerAddressesTableMigration
  } finally {
    try {
      await pool.end();
      console.log('تم إغلاق pool الاتصالات بنجاح بعد تنفيذ السكربت.');
    } catch (poolError) {
      console.error('❌ خطأ عند محاولة إغلاق pool الاتصالات:', poolError);
    }
  }
};

runMigration(); // التنفيذ المباشر للسكربت
