const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addStoreOperationalStatusFieldsScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول "stores": إضافة حقول حالة التشغيل والجداول الزمنية...');
    await client.query('BEGIN');

    // الخطوة 1: إنشاء نوع ENUM إذا لم يكن موجودًا
    const enumTypeName = 'store_override_status_enum';
    const enumCheckQuery = `SELECT 1 FROM pg_type WHERE typname = $1;`;
    const enumResult = await client.query(enumCheckQuery, [enumTypeName]);

    if (enumResult.rows.length === 0) {
      await client.query(`
        CREATE TYPE ${enumTypeName} AS ENUM ('AUTO', 'FORCE_OPEN', 'FORCE_CLOSED');
      `);
      console.log(`✅ تم: إنشاء نوع ENUM "${enumTypeName}".`);
    } else {
      console.log(`ℹ️ معلومة: نوع ENUM "${enumTypeName}" موجود بالفعل.`);
    }

    // الخطوة 2: إضافة الأعمدة الجديدة إلى جدول stores إذا لم تكن موجودة
    const columnsToAdd = [
      { name: 'default_opening_time', type: 'TIME NULL' },
      { name: 'default_closing_time', type: 'TIME NULL' },
      { name: 'admin_forced_status', type: `${enumTypeName} DEFAULT 'AUTO' NOT NULL` },
      { name: 'owner_choice_status', type: `${enumTypeName} DEFAULT 'AUTO' NOT NULL` }
    ];

    for (const column of columnsToAdd) {
      const columnCheckQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stores'
          AND column_name = $1;
      `;
      const colResult = await client.query(columnCheckQuery, [column.name]);
      if (colResult.rows.length === 0) {
        await client.query(`ALTER TABLE stores ADD COLUMN ${column.name} ${column.type};`);
        console.log(`✅ تم: إضافة عمود "${column.name}" إلى جدول "stores".`);
      } else {
        console.log(`ℹ️ معلومة: العمود "${column.name}" موجود بالفعل في جدول "stores".`);
      }
    }

    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية تعديل جدول "stores" بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية تعديل جدول "stores":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addStoreOperationalStatusFieldsScript();
