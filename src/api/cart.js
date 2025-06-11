const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { isStoreCurrentlyAcceptingOrders } = require('../utils/storeAvailability.js');

const router = express.Router();

// Helper function to get a detailed cart item by its ID
const getDetailedCartItemById = async (client, cartItemId) => {
    const query = `
        SELECT
            ci.id AS cart_item_id, 
            ci.product_id,
            p.name AS product_name,
            p.price AS product_price,
            p.image_url AS product_image_url,
            s.id AS store_id,
            s.name AS store_name,
            ci.quantity,
            (p.price * ci.quantity) AS item_total
        FROM cart_items AS ci
        JOIN products AS p ON ci.product_id = p.id
        JOIN stores AS s ON p.store_id = s.id
        WHERE ci.id = $1;
    `;
    const result = await client.query(query, [cartItemId]);
    return result.rows[0];
};

// POST /api/cart/items - Add a product to the shopping cart
router.post(
  '/items',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const { productId, quantity } = req.body;
    const userId = req.user.id;

    if (!productId || !quantity || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'معرف المنتج والكمية (يجب أن تكون عدداً صحيحاً أكبر من صفر) حقول مطلوبة.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const productQuery = 'SELECT id, name, is_available, stock_quantity, store_id FROM products WHERE id = $1';
      const productResult = await client.query(productQuery, [productId]);

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المنتج المطلوب غير موجود.' });
      }
      const product = productResult.rows[0];

      const storeQuery = `SELECT id, name, is_active, default_opening_time, default_closing_time, admin_forced_status, owner_choice_status FROM stores WHERE id = $1;`;
      const storeResult = await client.query(storeQuery, [product.store_id]);

      if (storeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر المرتبط بالمنتج غير موجود.' });
      }
      const store = storeResult.rows[0];
      
      if (!isStoreCurrentlyAcceptingOrders(store, new Date())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `المتجر "${store.name}" مغلق حاليًا ولا يستقبل الطلبات.` });
      }

      if (!product.is_available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `منتج "${product.name}" غير متاح حالياً.` });
      }

      let cartId;
      const cartQuery = 'SELECT id FROM shopping_carts WHERE user_id = $1';
      const cartResult = await client.query(cartQuery, [userId]);

      if (cartResult.rows.length > 0) {
        cartId = cartResult.rows[0].id;
      } else {
        const newCartQuery = 'INSERT INTO shopping_carts (user_id) VALUES ($1) RETURNING id';
        const newCartResult = await client.query(newCartQuery, [userId]);
        cartId = newCartResult.rows[0].id;
      }

      const existingItemQuery = 'SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2';
      const existingItemResult = await client.query(existingItemQuery, [cartId, productId]);
      
      let finalCartItemId;
      let responseStatus = 200;
      let responseMessage = 'تم تحديث كمية المنتج في السلة بنجاح.';

      if (existingItemResult.rows.length > 0) {
        const existingItem = existingItemResult.rows[0];
        const newQuantity = existingItem.quantity + quantity;

        if (product.stock_quantity !== null && newQuantity > product.stock_quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `الكمية الإجمالية المطلوبة لمنتج "${product.name}" (${newQuantity}) تتجاوز المخزون المتاح (${product.stock_quantity}).` });
        }

        const updateItemQuery = 'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id';
        const updatedResult = await client.query(updateItemQuery, [newQuantity, existingItem.id]);
        finalCartItemId = updatedResult.rows[0].id;

      } else {
        if (product.stock_quantity !== null && quantity > product.stock_quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `الكمية المطلوبة لمنتج "${product.name}" (${quantity}) تتجاوز المخزون المتاح (${product.stock_quantity}).` });
        }

        const insertItemQuery = 'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING id';
        const insertedResult = await client.query(insertItemQuery, [cartId, productId, quantity]);
        finalCartItemId = insertedResult.rows[0].id;
        responseStatus = 201;
        responseMessage = 'تمت إضافة المنتج إلى السلة بنجاح!';
      }
      
      const detailedCartItem = await getDetailedCartItemById(client, finalCartItemId);

      await client.query('COMMIT');
      res.status(responseStatus).json({ message: responseMessage, item: detailedCartItem });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error adding item to cart:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إضافة المنتج إلى السلة.' });
    } finally {
      client.release();
    }
  }
);

// GET /api/cart - View shopping cart contents
router.get(
    '/',
    authMiddleware,
    checkRole('customer'),
    async (req, res) => {
        const userId = req.user.id;
        const client = await pool.connect();
        try {
            const cartQuery = 'SELECT id FROM shopping_carts WHERE user_id = $1';
            const cartResult = await client.query(cartQuery, [userId]);

            if (cartResult.rows.length === 0) {
                return res.status(200).json({
                    message: 'سلة المشتريات فارغة.',
                    cart: { items: [], subtotal: "0.00" }
                });
            }
            const cartId = cartResult.rows[0].id;

            const itemsQuery = `
                SELECT
                    ci.id AS cart_item_id, 
                    ci.product_id,
                    p.name AS product_name,
                    p.price AS product_price,
                    p.image_url AS product_image_url,
                    s.id AS store_id,
                    s.name AS store_name,
                    ci.quantity,
                    (p.price * ci.quantity) AS item_total
                FROM cart_items AS ci
                JOIN products AS p ON ci.product_id = p.id
                JOIN stores AS s ON p.store_id = s.id
                WHERE ci.cart_id = $1
                ORDER BY ci.created_at;
            `;
            const itemsResult = await client.query(itemsQuery, [cartId]);

            const subtotal = itemsResult.rows.reduce((sum, item) => {
                return sum + parseFloat(item.item_total);
            }, 0);

            res.status(200).json({
                message: 'تم استرجاع محتويات السلة بنجاح.',
                cart: {
                    id: cartId,
                    user_id: userId,
                    items: itemsResult.rows,
                    subtotal: subtotal.toFixed(2)
                }
            });

        } catch (err) {
            console.error('Error fetching cart:', err);
            res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب السلة.' });
        } finally {
            client.release();
        }
    }
);

// PUT /api/cart/items/:productId - Update quantity of a specific product in the cart
router.put(
  '/items/:productId',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر.' });
    }
    const parsedProductId = parseInt(productId);
     if (isNaN(parsedProductId)) {
      return res.status(400).json({ message: 'معرف المنتج غير صالح.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cartQuery = 'SELECT id FROM shopping_carts WHERE user_id = $1';
      const cartResult = await client.query(cartQuery, [userId]);

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'لم يتم العثور على سلة مشتريات لهذا المستخدم.' });
      }
      const cartId = cartResult.rows[0].id;

      const cartItemSearchQuery = 'SELECT id FROM cart_items WHERE cart_id = $1 AND product_id = $2';
      const cartItemSearchResult = await client.query(cartItemSearchQuery, [cartId, parsedProductId]);

      if (cartItemSearchResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المنتج غير موجود في سلة المشتريات.' });
      }
      const cartItemId = cartItemSearchResult.rows[0].id;
      
      const productDetailsQuery = 'SELECT name, is_available, stock_quantity, store_id FROM products WHERE id = $1';
      const productDetailsResult = await client.query(productDetailsQuery, [parsedProductId]);

      if (productDetailsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المنتج المرتبط بهذا البند في السلة لم يعد موجوداً.' });
      }
      const product = productDetailsResult.rows[0];

      const storeQuery = `SELECT id, name, is_active, default_opening_time, default_closing_time, admin_forced_status, owner_choice_status FROM stores WHERE id = $1;`;
      const storeResult = await client.query(storeQuery, [product.store_id]);
      if (storeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر المرتبط بالمنتج غير موجود.' });
      }
      const store = storeResult.rows[0];
      if (!isStoreCurrentlyAcceptingOrders(store, new Date())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `المتجر "${store.name}" مغلق حاليًا ولا يستقبل الطلبات.` });
      }

      if (!product.is_available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `منتج "${product.name}" غير متاح حالياً للبيع.` });
      }
      if (product.stock_quantity !== null && quantity > product.stock_quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `الكمية المطلوبة لمنتج "${product.name}" (${quantity}) تتجاوز المخزون المتاح (${product.stock_quantity}).` });
      }

      const updateQuery = 'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id';
      const updatedItemResult = await client.query(updateQuery, [quantity, cartItemId]);

      const detailedCartItem = await getDetailedCartItemById(client, updatedItemResult.rows[0].id);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث كمية المنتج في السلة بنجاح.',
        item: detailedCartItem
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating cart item quantity:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث كمية المنتج.' });
    } finally {
      client.release();
    }
  }
);

// DELETE /api/cart/items/:productId - حذف منتج من السلة
router.delete(
  '/items/:productId',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const parsedProductId = parseInt(productId);
    if (isNaN(parsedProductId)) {
     return res.status(400).json({ message: 'معرف المنتج غير صالح.' });
   }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cartQuery = 'SELECT id FROM shopping_carts WHERE user_id = $1';
      const cartResult = await client.query(cartQuery, [userId]);

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المنتج غير موجود في سلة المشتريات ليتم حذفه أو لا توجد سلة مشتريات.' });
      }
      const cartId = cartResult.rows[0].id;

      const deleteQuery = 'DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2 RETURNING id';
      const deleteResult = await client.query(deleteQuery, [cartId, parsedProductId]);

      if (deleteResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المنتج غير موجود في سلة المشتريات ليتم حذفه.' });
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'تم حذف المنتج من السلة بنجاح.' });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error removing item from cart:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حذف المنتج من السلة.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
