const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { sendPushNotification } = require('../services/notificationService.js');

const router = express.Router();

// GET /api/delivery/my-orders - موظف التوصيل يعرض الطلبات المسندة إليه
router.get(
  '/my-orders',
  authMiddleware,
  checkRole('delivery_worker'),
  async (req, res) => {
    const deliveryWorkerId = req.user.id;
    const client = await pool.connect();

    try {
      const query = `
        SELECT 
          o.id AS order_id,
          u_cust.full_name AS customer_name, 
          u_cust.phone_number AS customer_phone,
          s.name AS store_name, 
          s.address AS store_address, 
          s.phone_number AS store_phone,
          o.delivery_address AS customer_delivery_address,
          o.status, 
          o.grand_total, 
          o.special_notes,
          o.preparation_time_estimate_minutes, 
          o.delivery_estimated_at, 
          o.order_placed_at,
          o.last_status_update_at
        FROM orders AS o
        JOIN users AS u_cust ON o.user_id = u_cust.id
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.delivery_worker_id = $1 
          AND o.status IN ('assigned_for_delivery', 'out_for_delivery')
        ORDER BY o.last_status_update_at ASC;
      `;
      const result = await client.query(query, [deliveryWorkerId]);

      res.status(200).json({
        message: 'تم استرجاع قائمة الطلبات المسندة إليك بنجاح.',
        orders: result.rows
      });

    } catch (err) {
      console.error('Error fetching delivery worker orders:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب قائمة الطلبات المسندة.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/delivery/my-orders/:orderId/confirm-and-start-delivery - موظف التوصيل يؤكد استلام الطلب ويبدأ التوصيل
router.put(
  '/my-orders/:orderId/confirm-and-start-delivery',
  authMiddleware,
  checkRole('delivery_worker'),
  async (req, res) => {
    const deliveryWorkerId = req.user.id;
    const { orderId } = req.params;
    const { estimated_delivery_at } = req.body; 

    if (!estimated_delivery_at) {
      return res.status(400).json({ message: 'حقل "الوقت التقديري للتوصيل" (estimated_delivery_at) مطلوب.' });
    }
    const etaDate = new Date(estimated_delivery_at);
    if (isNaN(etaDate.getTime())) {
      return res.status(400).json({ message: 'صيغة "الوقت التقديري للتوصيل" غير صالحة. يرجى استخدام صيغة تاريخ ووقت قياسية (ISO 8601).' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderCheckQuery = 'SELECT id, status, delivery_worker_id, user_id FROM orders WHERE id = $1';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.delivery_worker_id !== deliveryWorkerId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض. هذا الطلب غير مسند إليك.' });
      }
      if (currentOrder.status !== 'assigned_for_delivery') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن بدء توصيل هذا الطلب. يجب أن تكون حالته "assigned_for_delivery". الحالة الحالية: "${currentOrder.status}".` });
      }
      const customerId = currentOrder.user_id;

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'out_for_delivery', 
            delivery_estimated_at = $1,
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
        RETURNING id; 
      `;
      await client.query(updateOrderQuery, [etaDate, orderId]); 

      const notificationMessage = `يلا جاي وطلبك رقم #${orderId} معي`;
      const notificationLink = `/api/orders/${orderId}`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3);`;
      await client.query(notificationQuery, [customerId, notificationMessage, notificationLink]);

      sendPushNotification(
          customerId,
          'طلبك في الطريق!',
          `موظف التوصيل في طريقه إليك بالطلب #${orderId}.`,
          { orderId: orderId.toString(), newStatus: 'out_for_delivery' }
      ).catch(err => console.error('Failed to send push notification on order out for delivery:', err));

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u_cust.full_name AS customer_name, u_cust.email AS customer_email, u_cust.phone_number AS customer_phone,
          o.store_id, s.name AS store_name, s.address AS store_address, s.phone_number AS store_phone,
          o.status, o.delivery_address AS customer_delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name, o.delivery_estimated_at, o.delivery_worker_rejection_reason,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        JOIN users AS u_cust ON o.user_id = u_cust.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تأكيد الطلب وهو الآن قيد التوصيل.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error confirming and starting delivery:', err);
      if (err.code === '22P02' || err.code === '22007' || err.code === '22008' ) { 
        return res.status(400).json({ message: 'معرف الطلب أو صيغة الوقت التقديري للتوصيل غير صالحة.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تأكيد بدء التوصيل.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/delivery/my-orders/:orderId/reject-assignment - موظف التوصيل يرفض مهمة مسندة
router.put(
  '/my-orders/:orderId/reject-assignment',
  authMiddleware,
  checkRole('delivery_worker'),
  async (req, res) => {
    const deliveryWorkerId = req.user.id;
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({ message: 'حقل "سبب الرفض" (reason) مطلوب ولا يمكن أن يكون فارغاً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderCheckQuery = 'SELECT id, status, delivery_worker_id FROM orders WHERE id = $1';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.delivery_worker_id !== deliveryWorkerId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض. هذا الطلب غير مسند إليك حالياً.' });
      }
      if (currentOrder.status !== 'assigned_for_delivery') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن رفض هذه المهمة. يجب أن تكون حالة الطلب "assigned_for_delivery". الحالة الحالية: "${currentOrder.status}".` });
      }

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'ready_for_delivery', 
            delivery_worker_id = NULL,
            delivery_worker_rejection_reason = $1,
            delivery_estimated_at = NULL, 
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
        RETURNING id; 
      `;
      await client.query(updateOrderQuery, [reason, orderId]);

      const adminsResult = await client.query("SELECT id FROM users WHERE user_role = 'admin';");
      const admins = adminsResult.rows;
      const notificationMessage = `رفض موظف التوصيل مهمة الطلب #${orderId}، والطلب الآن بحاجة لإعادة إسناد.`;
      const notificationLink = `/api/admin/orders`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3);`;
      for (const admin of admins) {
          await client.query(notificationQuery, [admin.id, notificationMessage, notificationLink]);

          sendPushNotification(
              admin.id,
              'تنبيه إداري: رفض مهمة',
              notificationMessage,
              { orderId: orderId.toString() }
          ).catch(err => console.error('Failed to send push notification to admin on DW reject:', err));
      }

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u_cust.full_name AS customer_name, u_cust.email AS customer_email, u_cust.phone_number AS customer_phone,
          o.store_id, s.name AS store_name, s.address AS store_address, s.phone_number AS store_phone,
          o.status, o.delivery_address AS customer_delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name, o.delivery_estimated_at, o.delivery_worker_rejection_reason,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        JOIN users AS u_cust ON o.user_id = u_cust.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم رفض مهمة التوصيل وإعادة الطلب للمراجعة من قبل الإدارة.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error rejecting delivery assignment:', err);
      if (err.code === '22P02') { 
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء رفض مهمة التوصيل.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/delivery/my-orders/:orderId/delivered - موظف التوصيل يؤكد تسليم الطلب
router.put(
  '/my-orders/:orderId/delivered',
  authMiddleware,
  checkRole('delivery_worker'),
  async (req, res) => {
    const deliveryWorkerId = req.user.id;
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderCheckQuery = 'SELECT id, status, delivery_worker_id, user_id FROM orders WHERE id = $1';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.delivery_worker_id !== deliveryWorkerId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض. هذا الطلب غير مسند إليك.' });
      }
      if (currentOrder.status !== 'out_for_delivery') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن تحديث حالة الطلب إلى "تم التوصيل" إلا إذا كان في حالة "out_for_delivery". الحالة الحالية: "${currentOrder.status}".` });
      }
      const customerId = currentOrder.user_id;

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'delivered', 
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
        RETURNING id; 
      `;
      await client.query(updateOrderQuery, [orderId]);

      const notificationMessage = `تم توصيل طلبك رقم #${orderId} بنجاح. شكراً لاستخدامك Yalla-Jay!`;
      const notificationLink = `/api/orders/${orderId}`;
      const notificationQuery = `INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3);`;
      await client.query(notificationQuery, [customerId, notificationMessage, notificationLink]);

      sendPushNotification(
          customerId,
          'تم توصيل طلبك!',
          `تم توصيل طلبك #${orderId} بنجاح. بالهناء والشفاء!`,
          { orderId: orderId.toString(), newStatus: 'delivered' }
      ).catch(err => console.error('Failed to send push notification on order delivered:', err));

      const fullOrderDetailsQuery = `
        SELECT 
          o.id, o.user_id, u_cust.full_name AS customer_name, u_cust.email AS customer_email, u_cust.phone_number AS customer_phone,
          o.store_id, s.name AS store_name, s.address AS store_address, s.phone_number AS store_phone,
          o.status, o.delivery_address AS customer_delivery_address, o.special_notes, 
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name, o.delivery_estimated_at, o.delivery_worker_rejection_reason,
          o.order_placed_at, o.last_status_update_at,
          o.created_at AS order_created_at, o.updated_at AS order_updated_at
        FROM orders AS o
        JOIN stores AS s ON o.store_id = s.id
        JOIN users AS u_cust ON o.user_id = u_cust.id
        LEFT JOIN users AS u_dw ON o.delivery_worker_id = u_dw.id
        WHERE o.id = $1;
      `;
      const finalOrderResult = await client.query(fullOrderDetailsQuery, [orderId]);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث حالة الطلب إلى "تم التوصيل" بنجاح.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error marking order as delivered:', err);
      if (err.code === '22P02') { 
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث حالة الطلب.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
