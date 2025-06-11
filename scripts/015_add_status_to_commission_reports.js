const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addStatusToCommissionReportsScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول "commission_reports": إضافة عمود "status"...');

    // الاستعلام للتحقق مما إذا كان العمود موجودًا بالفعل
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'commission_reports'
        AND column_name = 'status';
    `;
    const { rows } = await client.query(checkColumnQuery);

    if (rows.length === 0) {
      // العمود غير موجود، قم بإضافته
      await client.query(`
        ALTER TABLE commission_reports
        ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING_REVIEW' NOT NULL;
      `);
      console.log('✅ تم بنجاح: إضافة عمود "status" مع قيمة افتراضية إلى جدول "commission_reports".');
    } else {
      // العمود موجود بالفعل
      console.log('ℹ️ معلومة: عمود "status" موجود بالفعل في جدول "commission_reports". لا يلزم إجراء أي تغيير.');
    }

    console.log('🎉 اكتملت عملية فحص/تعديل جدول "commission_reports" بخصوص عمود "status" بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية فحص/تعديل جدول "commission_reports":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addStatusToCommissionReportsScript();
