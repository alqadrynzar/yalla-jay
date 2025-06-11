const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { sendPushNotification } = require('../services/notificationService.js');

const router = express.Router();

const ALLOWED_OWNER_OVERRIDE_STATUSES = ['AUTO', 'FORCE_CLOSED'];

const calculateDateRange = (period, startDateStr, endDateStr) => {
  let startDate = new Date();
  let endDate = new Date();
  let displayPeriod = period || 'last30days'; 

  if (startDateStr && endDateStr) {
    try {
      startDate = new Date(startDateStr);
      endDate = new Date(endDateStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date format');
      }
      startDate.setHours(0, 0, 0, 0); 
      endDate.setHours(23, 59, 59, 999); 
      displayPeriod = `custom: ${startDateStr} to ${endDateStr}`;
      return { startDate, endDate, displayPeriod };
    } catch (e) {
      console.warn("Invalid custom date range provided, falling back to default.");
      displayPeriod = 'last30days'; 
    }
  }

  switch (displayPeriod) { 
    case 'last7days':
      startDate = new Date(); 
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0,0,0,0);
      endDate = new Date();
      endDate.setHours(23,59,59,999);
      break;
    case 'current_month':
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(); 
      endDate.setHours(23,59,59,999);
      break;
    case 'previous_month':
      endDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0); 
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1, 0, 0, 0, 0);
      break;
    case 'all_time':
      startDate = new Date(0); 
      endDate = new Date(); 
      endDate.setHours(23,59,59,999);
      break;
    case 'last30days':
    default: 
      startDate = new Date(); 
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0,0,0,0);
      endDate = new Date();
      endDate.setHours(23,59,59,999);
      displayPeriod = 'last30days'; 
      break;
  }
  return { startDate, endDate, displayPeriod };
};

router.put(
  '/my-stores/:storeId/override-status',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId } = req.params;
    const ownerUserId = req.user.id;
    const { status } = req.body; 

    if (!status || !ALLOWED_OWNER_OVERRIDE_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({
        message: 'حقل الحالة (status) مطلوب ويجب أن يكون إحدى القيم: AUTO, FORCE_CLOSED.',
        allowed_statuses: ALLOWED_OWNER_OVERRIDE_STATUSES
      });
    }

    const parsedStoreId = parseInt(storeId);
    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id, owner_id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [parsedStoreId, ownerUserId]);

      if (storeCheckResult.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود أو لا تملك صلاحية تعديله.' });
      }

      const updateQuery = `
        UPDATE stores
        SET 
          owner_choice_status = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, name, default_opening_time, default_closing_time, admin_forced_status, owner_choice_status, updated_at;
      `;
      const result = await client.query(updateQuery, [status.toUpperCase(), parsedStoreId]);

      res.status(200).json({
        message: 'تم تحديث حالة التشغيل اليدوية للمتجر بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating store override status by owner:', err);
      if (err.code === '22P02') { 
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث حالة التشغيل اليدوية للمتجر.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/my-stores/:storeId/operational-settings',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId } = req.params;
    const ownerUserId = req.user.id;
    const parsedStoreId = parseInt(storeId);

    if (isNaN(parsedStoreId)) {
        return res.status(400).json({ message: 'معرف المتجر يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id, 
          name, 
          is_active,
          default_opening_time, 
          default_closing_time, 
          admin_forced_status, 
          owner_choice_status,
          updated_at
        FROM stores 
        WHERE id = $1 AND owner_id = $2;
      `;
      const result = await client.query(query, [parsedStoreId, ownerUserId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود أو لا تملك صلاحية عرضه.' });
      }

      res.status(200).json({
        message: 'تم استرجاع إعدادات التشغيل للمتجر بنجاح.',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error fetching store operational settings by owner:', err);
      if (err.code === '22P02') { 
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/orders',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const client = await pool.connect();

    try {
      const storesQuery = 'SELECT id FROM stores WHERE owner_id = $1';
      const storesResult = await client.query(storesQuery, [ownerId]);

      if (storesResult.rows.length === 0) {
        return res.status(200).json({
          message: 'لا تملك أي متاجر حالياً، وبالتالي لا توجد طلبات لعرضها.',
          orders: []
        });
      }

      const storeIds = storesResult.rows.map(store => store.id);

      const ordersQuery = `
        SELECT 
          o.id AS order_id, 
          o.user_id AS customer_id, 
          u.full_name AS customer_name, 
          o.store_id,
          s.name AS store_name,
          o.status, 
          o.grand_total, 
          o.items_subtotal,
          o.order_placed_at,
          o.last_status_update_at,
          o.made_ready_at
        FROM orders AS o
        JOIN users AS u ON o.user_id = u.id
        JOIN stores AS s ON o.store_id = s.id 
        WHERE o.store_id = ANY($1::int[])
        ORDER BY o.order_placed_at DESC;
      `;
      const ordersResult = await client.query(ordersQuery, [storeIds]);

      res.status(200).json({
        message: 'تم استرجاع قائمة الطلبات الخاصة بمتاجرك بنجاح.',
        orders: ordersResult.rows
      });

    } catch (err) {
      console.error('Error fetching store owner orders:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب قائمة الطلبات.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/orders/:orderId',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
      const orderQuery = `
        SELECT 
          o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
          o.store_id, s.name AS store_name, 
          o.status, o.delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
          o.order_placed_at, o.last_status_update_at, o.made_ready_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        JOIN users AS u ON o.user_id = u.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1 AND s.owner_id = $2;
      `;
      const orderResult = await client.query(orderQuery, [orderId, ownerId]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ message: 'الطلب غير موجود أو لا يتبع لأحد متاجرك.' });
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
      console.error('Error fetching order details for store owner:', err);
      if (err.code === '22P02') {
          return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب تفاصيل الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/orders/:orderId/accept',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { orderId } = req.params;
    const { preparation_time_estimate_minutes } = req.body;

    if (preparation_time_estimate_minutes === undefined || !Number.isInteger(preparation_time_estimate_minutes) || preparation_time_estimate_minutes <= 0) {
      return res.status(400).json({ message: 'حقل "مدة التحضير التقديرية بالدقائق" مطلوب ويجب أن يكون رقماً صحيحاً موجباً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderCheckQuery = `
        SELECT o.id, o.status, o.user_id FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.id = $1 AND s.owner_id = $2;
      `;
      const orderCheckResult = await client.query(orderCheckQuery, [orderId, ownerId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود أو لا تملك صلاحية تعديله.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.status !== 'waiting') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن قبول هذا الطلب لأنه في حالة "${currentOrder.status}" وليس "waiting".` });
      }
      const customerId = currentOrder.user_id;

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'preparing', 
            preparation_time_estimate_minutes = $1,
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
        RETURNING id; 
      `;
      await client.query(updateOrderQuery, [preparation_time_estimate_minutes, orderId]);

      const notificationMessage = `تم قبول طلبك رقم #${orderId}، وهو الآن قيد التحضير.`;
      const notificationLink = `/api/orders/${orderId}`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4);`;
      await client.query(notificationQuery, [customerId, notificationMessage, notificationLink, orderId]);

      sendPushNotification(
          customerId,
          'طلبك قيد التحضير',
          `تم قبول طلبك #${orderId} من المتجر وهو الآن قيد التحضير.`,
          { orderId: orderId.toString(), newStatus: 'preparing' }
      ).catch(err => console.error('Failed to send push notification on order accept:', err));

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
          o.store_id, st.name AS store_name, 
          o.status, o.delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes, o.made_ready_at,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS st ON o.store_id = st.id
        JOIN users AS u ON o.user_id = u.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم قبول الطلب وجاري تحضيره.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error accepting order:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء قبول الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/orders/:orderId/ready',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderCheckQuery = `
        SELECT o.id, o.status, o.user_id, o.made_ready_at FROM orders AS o 
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.id = $1 AND s.owner_id = $2;
      `;
      const orderCheckResult = await client.query(orderCheckQuery, [orderId, ownerId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود أو لا تملك صلاحية تعديله.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.status !== 'preparing') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن تحديث حالة الطلب إلى "جاهز للتوصيل" إلا إذا كان في حالة "preparing". الحالة الحالية: "${currentOrder.status}".` });
      }
      const customerId = currentOrder.user_id;

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'ready_for_delivery', 
            made_ready_at = COALESCE(made_ready_at, CURRENT_TIMESTAMP),
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
        RETURNING id, status, made_ready_at; 
      `;
      await client.query(updateOrderQuery, [orderId]);

      const notificationMessage = `طلبك رقم #${orderId} جاهز الان وسيتم توصيله قريبا`;
      const notificationLink = `/api/orders/${orderId}`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4);`;
      await client.query(notificationQuery, [customerId, notificationMessage, notificationLink, orderId]);

      sendPushNotification(
          customerId,
          'طلبك جاهز!',
          `طلبك #${orderId} أصبح جاهزًا للتوصيل.`,
          { orderId: orderId.toString(), newStatus: 'ready_for_delivery' }
      ).catch(err => console.error('Failed to send push notification on order ready:', err));

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
          o.store_id, st.name AS store_name, 
          o.status, o.delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes, o.made_ready_at,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS st ON o.store_id = st.id
        JOIN users AS u ON o.user_id = u.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث حالة الطلب إلى "جاهز للتوصيل".',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error marking order as ready:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث حالة الطلب.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/store-owner/orders/:orderId/reject
router.put(
  '/orders/:orderId/reject',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { orderId } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason || typeof rejection_reason !== 'string' || rejection_reason.trim() === '') {
      return res.status(400).json({ message: 'حقل "سبب الرفض" مطلوب ولا يمكن أن يكون فارغاً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderCheckQuery = `
        SELECT o.id, o.status, o.store_id, o.user_id FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.id = $1 AND s.owner_id = $2;
      `;
      const orderCheckResult = await client.query(orderCheckQuery, [orderId, ownerId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود أو لا تملك صلاحية تعديله.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.status !== 'waiting') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن رفض هذا الطلب إلا إذا كان في حالة "waiting". الحالة الحالية: "${currentOrder.status}".` });
      }
      const customerId = currentOrder.user_id;

      const orderItemsQuery = 'SELECT product_id, quantity FROM order_items WHERE order_id = $1;';
      const orderItemsResult = await client.query(orderItemsQuery, [orderId]);

      for (const item of orderItemsResult.rows) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND stock_quantity IS NOT NULL;',
          [item.quantity, item.product_id]
        );
      }

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'rejected', 
            rejection_reason = $1,
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
        RETURNING id; 
      `;
      await client.query(updateOrderQuery, [rejection_reason, orderId]);

      const notificationMessage = `للأسف، تم رفض طلبك رقم #${orderId} من قبل المتجر. سبب الرفض: ${rejection_reason}`;
      const notificationLink = `/api/orders/${orderId}`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4);`;
      await client.query(notificationQuery, [customerId, notificationMessage, notificationLink, orderId]);

      sendPushNotification(
          customerId,
          'تم رفض طلبك',
          `للأسف، تم رفض طلبك #${orderId}. سبب الرفض: ${rejection_reason}`,
          { orderId: orderId.toString(), newStatus: 'rejected' }
      ).catch(err => console.error('Failed to send push notification on order reject:', err));

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
          o.store_id, st.name AS store_name, 
          o.status, o.delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes, o.made_ready_at,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS st ON o.store_id = st.id
        JOIN users AS u ON o.user_id = u.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم رفض الطلب بنجاح.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error rejecting order:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء رفض الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/dashboard/stats',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { storeId, period, startDate: startDateStr, endDate: endDateStr } = req.query;
    if (!storeId) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) مطلوب.' });
    }
    const numStoreId = parseInt(storeId);
    if (isNaN(numStoreId)) {
        return res.status(400).json({ message: 'معرف المتجر (storeId) يجب أن يكون رقماً.' });
    }
    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [numStoreId, ownerId]);
      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: المتجر غير موجود أو لا تملكه.' });
      }
      const { startDate, endDate, displayPeriod } = calculateDateRange(period, startDateStr, endDateStr);
      const statsQuery = `
        SELECT
          COALESCE(SUM(items_subtotal), 0) AS "totalRevenue", 
          COUNT(id) AS "totalOrders"
        FROM orders
        WHERE store_id = $1
          AND status IN ('ready_for_delivery', 'assigned_for_delivery', 'out_for_delivery', 'delivered')
          AND order_placed_at >= $2 
          AND order_placed_at <= $3;
      `;
      const statsResult = await client.query(statsQuery, [numStoreId, startDate, endDate]);
      let { totalRevenue, totalOrders } = statsResult.rows[0];
      totalRevenue = parseFloat(totalRevenue);
      totalOrders = parseInt(totalOrders);
      const averageOrderValue = totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0;
      res.status(200).json({
        storeId: numStoreId,
        period: displayPeriod,
        filtersApplied: { 
            startDate: startDate.toISOString().split('T')[0], 
            endDate: endDate.toISOString().split('T')[0]   
        },
        totalRevenue,
        totalOrders,
        averageOrderValue,
      });
    } catch (err) {
      console.error(`Error fetching dashboard stats for store ${storeId}:`, err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب إحصائيات المتجر.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/dashboard/most-ordered-products',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const { storeId, period, startDate: startDateStr, endDate: endDateStr, limit = 5 } = req.query;
    if (!storeId) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) مطلوب.' });
    }
    const numStoreId = parseInt(storeId);
    if (isNaN(numStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) يجب أن يكون رقماً.' });
    }
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit <= 0) {
      return res.status(400).json({ message: 'معامل limit يجب أن يكون رقماً صحيحاً موجباً.' });
    }
    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [numStoreId, ownerId]);
      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: المتجر غير موجود أو لا تملكه.' });
      }
      const { startDate, endDate, displayPeriod } = calculateDateRange(period, startDateStr, endDateStr);
      const productsQuery = `
        SELECT
          p.id AS "productId",
          p.name AS "productName",
          COUNT(oi.order_id) AS "orderCount",
          SUM(oi.quantity) AS "totalQuantitySold",
          SUM(oi.item_subtotal) AS "revenueGenerated" 
        FROM products p
        JOIN order_items oi ON p.id = oi.product_id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.store_id = $1
          AND o.status IN ('ready_for_delivery', 'assigned_for_delivery', 'out_for_delivery', 'delivered')
          AND o.order_placed_at >= $2
          AND o.order_placed_at <= $3
        GROUP BY p.id, p.name
        ORDER BY "orderCount" DESC, "revenueGenerated" DESC
        LIMIT $4;
      `;
      const productsResult = await client.query(productsQuery, [numStoreId, startDate, endDate, numLimit]);
      res.status(200).json({
        storeId: numStoreId,
        period: displayPeriod,
        filtersApplied: { 
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0] 
        },
        limit: numLimit,
        products: productsResult.rows.map(p => ({
          ...p,
          orderCount: parseInt(p.orderCount),
          totalQuantitySold: parseInt(p.totalQuantitySold),
          revenueGenerated: parseFloat(p.revenueGenerated)
        }))
      });
    } catch (err) {
      console.error(`Error fetching most ordered products for store ${storeId}:`, err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب المنتجات الأكثر طلباً.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
