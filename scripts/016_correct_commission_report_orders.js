const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const correctCommissionReportOrdersScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تصحيح مخطط جدول "commission_report_orders"...');
    await client.query('BEGIN'); // Start transaction

    // Helper function to check if a column exists
    const columnExists = async (tableName, columnName) => {
      const res = await client.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2;
      `, [tableName, columnName]);
      return res.rows.length > 0;
    };

    // 1. Rename commission_report_id to report_id
    const oldReportIdCol = 'commission_report_id';
    const newReportIdCol = 'report_id';
    if (await columnExists('commission_report_orders', oldReportIdCol) && !(await columnExists('commission_report_orders', newReportIdCol))) {
      await client.query(`ALTER TABLE commission_report_orders RENAME COLUMN ${oldReportIdCol} TO ${newReportIdCol};`);
      console.log(`✅ تم: إعادة تسمية العمود "${oldReportIdCol}" إلى "${newReportIdCol}".`);
    } else if (await columnExists('commission_report_orders', newReportIdCol)) {
      console.log(`ℹ️ معلومة: العمود "${newReportIdCol}" موجود بالفعل.`);
    } else {
      console.log(`⚠️ تحذير: لم يتم العثور على العمود "${oldReportIdCol}" لإعادة تسميته، والعمود "${newReportIdCol}" غير موجود أيضًا. قد تحتاج لمراجعة يدوية إذا كانت هناك حاجة لعمود معرّف التقرير.`);
    }

    // 2. Rename commission_on_order_amount to commission_on_order
    const oldCommissionCol = 'commission_on_order_amount';
    const newCommissionCol = 'commission_on_order';
    if (await columnExists('commission_report_orders', oldCommissionCol) && !(await columnExists('commission_report_orders', newCommissionCol))) {
      await client.query(`ALTER TABLE commission_report_orders RENAME COLUMN ${oldCommissionCol} TO ${newCommissionCol};`);
      console.log(`✅ تم: إعادة تسمية العمود "${oldCommissionCol}" إلى "${newCommissionCol}".`);
    } else if (await columnExists('commission_report_orders', newCommissionCol)) {
      console.log(`ℹ️ معلومة: العمود "${newCommissionCol}" موجود بالفعل.`);
    } else {
      console.log(`⚠️ تحذير: لم يتم العثور على العمود "${oldCommissionCol}" لإعادة تسميته، والعمود "${newCommissionCol}" غير موجود أيضًا. قد تحتاج لمراجعة يدوية إذا كانت هناك حاجة لعمود مبلغ العمولة.`);
    }

    // 3. Add order_placed_at if not exists
    const orderPlacedAtCol = 'order_placed_at';
    if (!(await columnExists('commission_report_orders', orderPlacedAtCol))) {
      await client.query(`ALTER TABLE commission_report_orders ADD COLUMN ${orderPlacedAtCol} TIMESTAMP WITH TIME ZONE NOT NULL;`);
      console.log(`✅ تم: إضافة عمود "${orderPlacedAtCol}" (NOT NULL).`);
    } else {
      console.log(`ℹ️ معلومة: العمود "${orderPlacedAtCol}" موجود بالفعل.`);
    }

    // 4. Add customer_id if not exists
    const customerIdCol = 'customer_id';
    if (!(await columnExists('commission_report_orders', customerIdCol))) {
      await client.query(`ALTER TABLE commission_report_orders ADD COLUMN ${customerIdCol} INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
      console.log(`✅ تم: إضافة عمود "${customerIdCol}" مع مفتاح أجنبي.`);
    } else {
      console.log(`ℹ️ معلومة: العمود "${customerIdCol}" موجود بالفعل.`);
    }

    await client.query('COMMIT'); // Commit transaction
    console.log('🎉 اكتملت عملية تصحيح مخطط جدول "commission_report_orders" بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    console.error('❌ حدث خطأ أثناء عملية تصحيح مخطط جدول "commission_report_orders":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

correctCommissionReportOrdersScript();
