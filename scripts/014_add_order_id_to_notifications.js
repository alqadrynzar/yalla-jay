const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const addOrderIdToNotificationsScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية تعديل جدول "notifications": إضافة عمود "order_id"...');

    // الاستعلام للتحقق مما إذا كان العمود موجودًا بالفعل
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'order_id';
    `;
    const { rows } = await client.query(checkColumnQuery);

    if (rows.length === 0) {
      // العمود غير موجود، قم بإضافته
      await client.query(`
        ALTER TABLE notifications
        ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;
      `);
      console.log('✅ تم بنجاح: إضافة عمود "order_id" إلى جدول "notifications".');
    } else {
      // العمود موجود بالفعل
      console.log('ℹ️ معلومة: عمود "order_id" موجود بالفعل في جدول "notifications". لا يلزم إجراء أي تغيير.');
    }

    console.log('🎉 اكتملت عملية فحص/تعديل جدول "notifications" بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية فحص/تعديل جدول "notifications":', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

addOrderIdToNotificationsScript();
