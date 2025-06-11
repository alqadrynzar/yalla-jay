const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createPlatformDeliveryConfigsTableScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جدول "platform_delivery_configs"...');
    await client.query('BEGIN');

    // الخطوة 1: إنشاء الجدول
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_delivery_configs (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        active_rule_type VARCHAR(25) NOT NULL CHECK (active_rule_type IN ('PERCENTAGE', 'FIXED_THRESHOLD')),
        percentage_rate NUMERIC(5, 4) NULL, -- e.g., 0.0500 for 5%
        fixed_fee_amount NUMERIC(10, 2) NULL,
        threshold_for_free_delivery NUMERIC(10, 2) NULL, -- items_subtotal >= this value means free delivery for FIXED_THRESHOLD type
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "platform_delivery_configs" أو التأكد من وجوده.');

    // الخطوة 2: إنشاء أو إعادة إنشاء المُحفِّز لجدول "platform_delivery_configs"
    // نفترض أن دالة trigger_set_timestamp() موجودة من سكربتات سابقة (003 أو 012)
    await client.query(`
      DROP TRIGGER IF EXISTS set_platform_delivery_configs_timestamp ON platform_delivery_configs;
    `);
    await client.query(`
      CREATE TRIGGER set_platform_delivery_configs_timestamp
      BEFORE UPDATE ON platform_delivery_configs
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء المُحفِّز "set_platform_delivery_configs_timestamp".');

    // الخطوة 3: إضافة صف افتراضي إذا كان الجدول فارغاً (تم إنشاؤه للتو)
    // هذه القيم الافتراضية تعني "توصيل مجاني" كإعداد أولي يمكن للمدير تعديله لاحقاً.
    const { rowCount } = await client.query('SELECT id FROM platform_delivery_configs WHERE id = 1;');
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO platform_delivery_configs (
          id,
          active_rule_type,
          percentage_rate,
          fixed_fee_amount,
          threshold_for_free_delivery
        ) VALUES (
          1,
          'FIXED_THRESHOLD', -- النوع الافتراضي
          NULL,              -- لا توجد نسبة افتراضية لهذا النوع
          0.00,              -- أجور توصيل ثابتة افتراضية (مجاني)
          0.00               -- حد التوصيل المجاني (كل الطلبات مجانية بهذا الإعداد)
        );
      `);
      console.log('✅ تم: إضافة صف إعدادات افتراضي إلى "platform_delivery_configs".');
    } else {
      console.log('ℹ️ معلومة: جدول "platform_delivery_configs" يحتوي على بيانات بالفعل، تم تجاوز إضافة الصف الافتراضي.');
    }

    await client.query('COMMIT');
    console.log('🎉 اكتملت عملية إنشاء جدول "platform_delivery_configs" وإعداداته الأولية بنجاح!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ حدث خطأ أثناء عملية إنشاء جدول "platform_delivery_configs":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createPlatformDeliveryConfigsTableScript();
