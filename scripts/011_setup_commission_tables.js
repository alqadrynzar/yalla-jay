const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const setupCommissionTablesScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل قاعدة البيانات لدعم نظام حساب العمولة...');

    // الخطوة 1: تعديل جدول stores لإضافة حقل commission_rate
    await client.query(`
      ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) DEFAULT 0.00 NOT NULL;
    `);
    console.log('✅ تم: إضافة عمود "commission_rate" إلى جدول "stores" أو التأكد من وجوده.');

    // الخطوة 2: إنشاء جدول commission_reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_reports (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        report_period_start_date DATE NOT NULL,
        report_period_end_date DATE NOT NULL,
        total_sales_subject_to_commission NUMERIC(12, 2) NOT NULL,
        commission_rate_applied NUMERIC(5, 2) NOT NULL,
        commission_amount_calculated NUMERIC(10, 2) NOT NULL,
        calculated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        is_finalized BOOLEAN DEFAULT false NOT NULL,
        finalized_at TIMESTAMPTZ DEFAULT NULL,
        calculated_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        CONSTRAINT uq_commission_report_period UNIQUE (store_id, report_period_start_date, report_period_end_date)
      );
    `);
    console.log('✅ تم: إنشاء جدول "commission_reports" أو التأكد من وجوده.');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_reports_store_id ON commission_reports(store_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_reports_period ON commission_reports(report_period_start_date, report_period_end_date);`);
    console.log('✅ تم: إنشاء فهارس لجدول "commission_reports".');


    // الخطوة 3: إنشاء جدول commission_report_orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_report_orders (
        id SERIAL PRIMARY KEY,
        commission_report_id INTEGER NOT NULL REFERENCES commission_reports(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, 
        order_grand_total NUMERIC(10, 2) NOT NULL,
        commission_on_order_amount NUMERIC(10, 2) NOT NULL, 
        CONSTRAINT uq_commission_report_order UNIQUE (commission_report_id, order_id)
      );
    `);
    console.log('✅ تم: إنشاء جدول "commission_report_orders" أو التأكد من وجوده.');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_report_orders_report_id ON commission_report_orders(commission_report_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_report_orders_order_id ON commission_report_orders(order_id);`);
    console.log('✅ تم: إنشاء فهارس لجدول "commission_report_orders".');

    console.log('🎉 اكتملت عملية تهيئة الجداول لنظام حساب العمولة بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية تهيئة جداول العمولة:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

setupCommissionTablesScript();
