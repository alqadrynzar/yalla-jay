const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../src/config/database.js');

const migrationScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء نوع الأدوار وجدول المستخدمين...');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role_enum AS ENUM ('customer', 'store_owner', 'delivery_worker', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ تم: إنشاء نوع "user_role_enum" أو التأكد من وجوده.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        user_role user_role_enum DEFAULT 'customer' NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "users" أو التأكد من وجوده.');
    console.log('🎉 اكتملت عملية إنشاء الجدول بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

migrationScript();
