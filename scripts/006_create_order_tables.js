const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createOrderTablesScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء نوع حالة الطلب وجداول الطلبات...');

    // 1. إنشاء نوع بيانات لحالة الطلب (order_status_enum)
    await client.query(`
      DO $$ BEGIN
          CREATE TYPE order_status_enum AS ENUM (
              'waiting', 
              'preparing', 
              'ready_for_delivery', 
              'assigned_for_delivery', 
              'out_for_delivery', 
              'delivered', 
              'rejected', 
              'cancelled_by_admin'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ تم: إنشاء نوع "order_status_enum" أو التأكد من وجوده.');

    // 2. إنشاء جدول الطلبات (orders)
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        status order_status_enum NOT NULL DEFAULT 'waiting',
        delivery_address TEXT NOT NULL,
        special_notes TEXT,
        items_subtotal NUMERIC(10, 2) NOT NULL,
        delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        grand_total NUMERIC(10, 2) NOT NULL,
        rejection_reason TEXT,
        preparation_time_estimate_minutes INTEGER,
        delivery_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        order_placed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_status_update_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "orders" أو التأكد من وجوده.');

    // 3. إنشاء جدول بنود الطلب (order_items)
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price_at_purchase NUMERIC(10, 2) NOT NULL,
        item_subtotal NUMERIC(10, 2) NOT NULL, 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "order_items" أو التأكد من وجوده.');
    
    // 4. تطبيق الزناد (trigger) لتحديث حقل updated_at في جدول orders
    await client.query(`
      DROP TRIGGER IF EXISTS set_orders_timestamp ON orders;
      CREATE TRIGGER set_orders_timestamp
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء الزناد لجدول "orders".');

    console.log('🎉 اكتملت عملية إنشاء جداول الطلبات وملحقاتها بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createOrderTablesScript();
