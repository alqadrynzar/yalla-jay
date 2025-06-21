const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addBranchManagerRoleScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الترحيل: إضافة دور مدير الفرع...');
    await client.query('BEGIN');

    // الأمر الأول: استخدام الاسم الصحيح للنوع 'user_role_enum'
    console.log("الخطوة 1: تعديل نوع 'user_role_enum' لإضافة 'branch_manager'...");
    await client.query("ALTER TYPE user_role_enum ADD VALUE 'branch_manager';");
    console.log("✅ تم: تعديل 'user_role_enum' بنجاح.");

    // الأمر الثاني: إنشاء الجدول الوسيط لربط مدراء الفروع بمناطق الخدمة
    console.log("الخطوة 2: إنشاء جدول 'branch_manager_regions'...");
    const createTableQuery = `
      CREATE TABLE branch_manager_regions (
          user_id INTEGER NOT NULL,
          region_id INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, region_id),
          CONSTRAINT fk_user
              FOREIGN KEY(user_id) 
              REFERENCES users(id)
              ON DELETE CASCADE,
          CONSTRAINT fk_service_region
              FOREIGN KEY(region_id) 
              REFERENCES service_regions(id)
              ON DELETE CASCADE
      );
    `;
    await client.query(createTableQuery);
    console.log("✅ تم: إنشاء جدول 'branch_manager_regions' بنجاح.");

    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية ترحيل إضافة دور مدير الفرع بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية الترحيل:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addBranchManagerRoleScript();
