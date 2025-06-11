const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { isStoreCurrentlyAcceptingOrders } = require('../utils/storeAvailability.js');
const { sendPushNotification } = require('../services/notificationService.js');

const router = express.Router();

// POST /api/orders/calculate-delivery-fee - حساب أجور التوصيل
router.post(
  '/calculate-delivery-fee',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const { items_subtotal } = req.body;

    if (items_subtotal === undefined || typeof items_subtotal !== 'number' || items_subtotal < 0) {
      return res.status(400).json({ message: "حقل 'items_subtotal' مطلوب ويجب أن يكون رقماً غير سالب." });
    }

    const client = await pool.connect();
    try {
      const configQuery = 'SELECT active_rule_type, percentage_rate, fixed_fee_amount, threshold_for_free_delivery FROM platform_delivery_configs WHERE id = 1;';
      const configResult = await client.query(configQuery);

      if (configResult.rows.length === 0) {
        console.error('CRITICAL: Delivery fee configuration not found in database.');
        return res.status(500).json({ message: 'خطأ في النظام: لم يتم العثور على إعدادات أجور التوصيل. يرجى مراجعة مسؤول النظام.' });
      }

      const config = configResult.rows[0];
      let deliveryFee = 0;

      if (config.active_rule_type === 'PERCENTAGE') {
        if (config.percentage_rate !== null) {
          deliveryFee = items_subtotal * parseFloat(config.percentage_rate);
        } else {
          console.warn('Delivery fee config: PERCENTAGE type but percentage_rate is NULL. Defaulting to 0 fee.');
          deliveryFee = 0;
        }
      } else if (config.active_rule_type === 'FIXED_THRESHOLD') {
        const threshold = parseFloat(config.threshold_for_free_delivery);
        const fixedAmount = parseFloat(config.fixed_fee_amount);

        if (items_subtotal >= threshold) {
          deliveryFee = 0; // Free delivery
        } else {
          deliveryFee = fixedAmount;
        }
      }

      deliveryFee = parseFloat(deliveryFee.toFixed(2));

      res.status(200).json({
        message: 'تم حساب أجور التوصيل بنجاح.',
        items_subtotal: parseFloat(items_subtotal.toFixed(2)),
        delivery_fee: deliveryFee,
        estimated_grand_total: parseFloat((items_subtotal + deliveryFee).toFixed(2))
      });

    } catch (err) {
      console.error('Error calculating delivery fee:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حساب أجور التوصيل.' });
    } finally {
      client.release();
    }
  }
);

// POST /api/orders - إنشاء طلب جديد من سلة المشتريات لمتجر محدد
router.post(
  '/',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const userId = req.user.id;
    const { store_id, delivery_address, special_notes } = req.body;

    if (!store_id || !delivery_address ) {
      return res.status(400).json({ message: 'معرف المتجر وعنوان التوصيل حقول مطلوبة.' });
    }
    const parsedStoreId = parseInt(store_id);
    if (isNaN(parsedStoreId)) {
        return res.status(400).json({ message: 'معرف المتجر يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storeDetailsQuery = `
        SELECT id, name, owner_id, is_active,
               default_opening_time, default_closing_time,
               admin_forced_status, owner_choice_status
        FROM stores
        WHERE id = $1;
      `;
      const storeDetailsResult = await client.query(storeDetailsQuery, [parsedStoreId]);
      if (storeDetailsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `المتجر المحدد (ID: ${parsedStoreId}) لم يتم العثور عليه.` });
      }
      const store = storeDetailsResult.rows[0];
      const storeOwnerId = store.owner_id;

      if (!isStoreCurrentlyAcceptingOrders(store, new Date())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إنشاء طلب، المتجر "${store.name}" مغلق حاليًا ولا يستقبل الطلبات.` });
      }

      const cartQuery = 'SELECT id FROM shopping_carts WHERE user_id = $1';
      const cartResult = await client.query(cartQuery, [userId]);
      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'سلة المشتريات فارغة أو غير موجودة. لا يمكن إنشاء طلب.' });
      }
      const cartId = cartResult.rows[0].id;

      const cartItemsQuery = `
        SELECT
            ci.product_id,
            ci.quantity,
            p.name AS product_name,
            p.price AS price_at_purchase,
            p.is_available,
            p.stock_quantity
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.cart_id = $1 AND p.store_id = $2;
      `;
      const cartItemsResult = await client.query(cartItemsQuery, [cartId, parsedStoreId]);

      if (cartItemsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا توجد منتجات في سلتك تابعة للمتجر المحدد (ID: ${parsedStoreId}).` });
      }

      const orderableItems = [];
      let itemsSubtotal = 0;

      for (const item of cartItemsResult.rows) {
        if (!item.is_available) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `منتج "${item.product_name}" (ID: ${item.product_id}) لم يعد متاحاً.` });
        }
        if (item.stock_quantity !== null && item.quantity > item.stock_quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `الكمية المطلوبة لمنتج "${item.product_name}" (ID: ${item.product_id}) <span class="math-inline">\{item\.quantity\} تتجاوز المخزون المتاح \(</span>{item.stock_quantity}).` });
        }
        const currentItemSubtotal = parseFloat(item.price_at_purchase) * item.quantity;
        orderableItems.push({
            product_id: item.product_id,
            quantity: item.quantity,
            price_at_purchase: parseFloat(item.price_at_purchase),
            item_subtotal: currentItemSubtotal
        });
        itemsSubtotal += currentItemSubtotal;
      }
      itemsSubtotal = parseFloat(itemsSubtotal.toFixed(2));

      const configQuery = 'SELECT active_rule_type, percentage_rate, fixed_fee_amount, threshold_for_free_delivery FROM platform_delivery_configs WHERE id = 1;';
      const configResult = await client.query(configQuery);
      if (configResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.error('CRITICAL: Delivery fee configuration not found during order creation.');
        return res.status(500).json({ message: 'خطأ في النظام: لم يتم العثور على إعدادات أجور التوصيل. لا يمكن إكمال الطلب.' });
      }
      const config = configResult.rows[0];
      let platformDeliveryFee = 0;
      if (config.active_rule_type === 'PERCENTAGE') {
        if (config.percentage_rate !== null) {
          platformDeliveryFee = itemsSubtotal * parseFloat(config.percentage_rate);
        }
      } else if (config.active_rule_type === 'FIXED_THRESHOLD') {
        const threshold = parseFloat(config.threshold_for_free_delivery);
        const fixedAmount = parseFloat(config.fixed_fee_amount);
        if (itemsSubtotal >= threshold) {
          platformDeliveryFee = 0;
        } else {
          platformDeliveryFee = fixedAmount;
        }
      }
      platformDeliveryFee = parseFloat(platformDeliveryFee.toFixed(2));

      const grandTotal = itemsSubtotal + platformDeliveryFee;

      const orderInsertQuery = `
        INSERT INTO orders
          (user_id, store_id, status, delivery_address, special_notes, items_subtotal, delivery_fee, grand_total, order_placed_at, last_status_update_at)
        VALUES ($1, $2, 'waiting', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, status, order_placed_at, items_subtotal, delivery_fee, grand_total, created_at, updated_at;
      `;
      const orderResult = await client.query(orderInsertQuery, [
        userId, parsedStoreId, delivery_address, special_notes, itemsSubtotal, platformDeliveryFee, grandTotal
      ]);
      const newOrder = orderResult.rows[0];
      const newOrderId = newOrder.id;

      const createdOrderItems = [];
      for (const item of orderableItems) {
        const orderItemInsertQuery = `
          INSERT INTO order_items
            (order_id, product_id, quantity, price_at_purchase, item_subtotal)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *;
        `;
        const orderItemResult = await client.query(orderItemInsertQuery, [
          newOrderId, item.product_id, item.quantity, item.price_at_purchase.toFixed(2), item.item_subtotal.toFixed(2)
        ]);
        createdOrderItems.push(orderItemResult.rows[0]);

        const productDetails = cartItemsResult.rows.find(p => p.product_id === item.product_id);
        if (productDetails.stock_quantity !== null) {
            const newStock = productDetails.stock_quantity - item.quantity;
            await client.query('UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStock, item.product_id]);
        }
      }

      const productIdsToClearFromCart = orderableItems.map(item => item.product_id);
      if (productIdsToClearFromCart.length > 0) {
        const deleteCartItemsQuery = `
            DELETE FROM cart_items
            WHERE cart_id = $1 AND product_id = ANY($2::int[]);
        `;
        await client.query(deleteCartItemsQuery, [cartId, productIdsToClearFromCart]);
      }

      if (storeOwnerId) {
        const notificationMessage = `طلب جديد برقم #${newOrderId} في انتظار المراجعة.`;
        const notificationLink = `/api/store-owner/orders/${newOrderId}`;
        const notificationQuery = `
          INSERT INTO notifications (user_id, message, link, order_id)
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(notificationQuery, [storeOwnerId, notificationMessage, notificationLink, newOrderId]);

        sendPushNotification(
          storeOwnerId, 
          'طلب جديد!', 
          `لقد تلقيت طلبًا جديدًا برقم #${newOrderId}.`,
          { orderId: newOrderId.toString() }
        ).catch(err => console.error('Failed to send push notification on new order:', err));
      }

      await client.query('COMMIT');
      res.status(201).json({
        message: 'تم إنشاء طلبك بنجاح!',
        order: {
            id: newOrder.id,
            status: newOrder.status,
            order_placed_at: newOrder.order_placed_at,
            delivery_address: delivery_address,
            special_notes: special_notes,
            items_subtotal: newOrder.items_subtotal,
            delivery_fee: newOrder.delivery_fee,
            grand_total: newOrder.grand_total,
            created_at: newOrder.created_at,
            updated_at: newOrder.updated_at,
            items: createdOrderItems
        }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating order:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
      const query = `
        SELECT
          o.id,
          o.store_id,
          s.name AS store_name,
          o.status,
          o.items_subtotal,
          o.delivery_fee,
          o.grand_total,
          o.order_placed_at,
          o.last_status_update_at,
          o.made_ready_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.user_id = $1
        ORDER BY o.order_placed_at DESC;
      `;
      const result = await client.query(query, [userId]);
      res.status(200).json({
        message: 'تم استرجاع قائمة طلباتك بنجاح.',
        orders: result.rows
      });
    } catch (err) {
      console.error('Error fetching customer orders:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب قائمة الطلبات.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/:orderId',
  authMiddleware,
  checkRole('customer'),
  async (req, res) => {
    const userId = req.user.id;
    const { orderId } = req.params;
    const client = await pool.connect();
    try {
      const orderQuery = `
        SELECT
          o.id, o.store_id, s.name AS store_name, o.status, o.delivery_address,
          o.special_notes, o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes, o.made_ready_at,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        JOIN users AS u_cust ON o.user_id = u_cust.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1 AND o.user_id = $2;
      `;
      const orderResult = await client.query(orderQuery, [orderId, userId]);
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ message: 'الطلب غير موجود أو لا تملك صلاحية عرضه.' });
      }
      const orderDetails = orderResult.rows[0];
      const orderItemsQuery = `
        SELECT
          oi.product_id, p.name AS product_name, p.image_url AS product_image_url,
          oi.quantity, oi.price_at_purchase, oi.item_subtotal
        FROM order_items AS oi
        JOIN products AS p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY p.name ASC;
      `;
      const orderItemsResult = await client.query(orderItemsQuery, [orderId]);
      orderDetails.items = orderItemsResult.rows;
      res.status(200).json({
        message: 'تم استرجاع تفاصيل الطلب بنجاح.',
        order: orderDetails
      });
    } catch (err) {
      console.error('Error fetching order details:', err);
      if (err.code === '22P02') {
          return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب تفاصيل الطلب.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
