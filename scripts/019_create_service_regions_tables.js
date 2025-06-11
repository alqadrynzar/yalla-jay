const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createServiceRegionsTablesScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدولي "service_regions" و "store_service_regions"...');
    await client.query('BEGIN');

    // الخطوة 1: إنشاء جدول "service_regions"
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_regions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "service_regions" أو التأكد من وجوده.');

    // الخطوة 2: إنشاء مُحفِّز (Trigger) لتحديث updated_at على جدول service_regions
    // نفترض أن دالة trigger_set_timestamp() موجودة من سكربتات سابقة (003 أو 012)
    await client.query(`
      DROP TRIGGER IF EXISTS set_service_regions_timestamp ON service_regions;
    `);
    await client.query(`
      CREATE TRIGGER set_service_regions_timestamp
      BEFORE UPDATE ON service_regions
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء الزناد "set_service_regions_timestamp" لجدول "service_regions".');

    // الخطوة 3: إنشاء جدول "store_service_regions"
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_service_regions (
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        region_id INTEGER NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (store_id, region_id)
      );
    `);
    console.log('✅ تم: إنشاء جدول "store_service_regions" أو التأكد من وجوده.');

    // الخطوة 4: إنشاء فهارس (Indexes) لتحسين الأداء (اختياري ولكن موصى به)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_store_service_regions_store_id ON store_service_regions(store_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_store_service_regions_region_id ON store_service_regions(region_id);`);
    console.log('✅ تم: إنشاء فهارس لجدول "store_service_regions".');


    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية إنشاء جداول مناطق الخدمة بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية إنشاء جداول مناطق الخدمة:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createServiceRegionsTablesScript();
