const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/database.js');

const createCartTablesScript = async () => {
  const client = await pool.connect();
  try {
    console.log('بدء عملية الإنشاء: إنشاء جداول سلة المشتريات...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS shopping_carts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ تم: إنشاء جدول "shopping_carts" أو التأكد من وجوده.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL PRIMARY KEY,
        cart_id INTEGER NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cart_id, product_id)
      );
    `);
    console.log('✅ تم: إنشاء جدول "cart_items" أو التأكد من وجوده.');
    
    await client.query(`
      DROP TRIGGER IF EXISTS set_shopping_carts_timestamp ON shopping_carts;
      CREATE TRIGGER set_shopping_carts_timestamp
      BEFORE UPDATE ON shopping_carts
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء الزناد لجدول "shopping_carts".');

    await client.query(`
      DROP TRIGGER IF EXISTS set_cart_items_timestamp ON cart_items;
      CREATE TRIGGER set_cart_items_timestamp
      BEFORE UPDATE ON cart_items
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_timestamp();
    `);
    console.log('✅ تم: إنشاء أو إعادة إنشاء الزناد لجدول "cart_items".');

    console.log('🎉 اكتملت عملية إنشاء جداول سلة المشتريات بنجاح!');

  } catch (err) {
    console.error('❌ حدث خطأ أثناء عملية الإنشاء:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('تم إغلاق الاتصال بقاعدة البيانات.');
  }
};

createCartTablesScript();
