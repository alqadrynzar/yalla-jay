const express = require('express');
const pool =require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { sendPushNotification } = require('../services/notificationService.js');

const router = express.Router();
const ALLOWED_OVERRIDE_STATUSES = ['AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'];

const isValidTimeFormat = (timeString) => {
  if (timeString === null || timeString === '') return true;
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
  return timeRegex.test(timeString);
};

// GET /api/branch-manager/orders - عرض الطلبات ضمن مناطق خدمة مدير الفرع
router.get(
  '/orders',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { managedRegions } = req.user;

    if (!managedRegions || managedRegions.length === 0) {
      return res.status(200).json({
        message: 'أنت غير معين لإدارة أي منطقة خدمة حاليًا.',
        orders: []
      });
    }

    const client = await pool.connect();
    try {
      const query = `
        SELECT
          o.id AS order_id,
          o.status,
          o.grand_total,
          o.order_placed_at,
          s.name AS store_name,
          s.id AS store_id,
          u.full_name AS customer_name
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN stores s ON o.store_id = s.id
        WHERE s.id IN (
          SELECT store_id FROM store_service_regions WHERE region_id = ANY($1::int[])
        )
        ORDER BY o.order_placed_at DESC;
      `;
      
      const result = await client.query(query, [managedRegions]);

      res.status(200).json({
        message: 'تم استرجاع الطلبات ضمن مناطق الخدمة الخاصة بك بنجاح.',
        orders: result.rows
      });

    } catch (err) {
      console.error('Error fetching orders for branch manager:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/branch-manager/stores/:storeId/activation - تفعيل أو إلغاء تفعيل متجر
router.put(
  '/stores/:storeId/activation',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { storeId } = req.params;
    const { is_active } = req.body;
    const { managedRegions } = req.user;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'حقل "is_active" مطلوب ويجب أن يكون قيمة منطقية (true/false).' });
    }
    
    if (!managedRegions || managedRegions.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: أنت غير معين لإدارة أي منطقة خدمة.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const authCheckQuery = `
        SELECT EXISTS (
          SELECT 1
          FROM store_service_regions
          WHERE store_id = $1 AND region_id = ANY($2::int[])
        );
      `;
      const authCheckResult = await client.query(authCheckQuery, [storeId, managedRegions]);
      const isAuthorized = authCheckResult.rows[0].exists;

      if (!isAuthorized) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: لا تملك صلاحية إدارة هذا المتجر.' });
      }

      const updateQuery = `
        UPDATE stores
        SET is_active = $1
        WHERE id = $2
        RETURNING id, name, is_active;
      `;
      const updateResult = await client.query(updateQuery, [is_active, storeId]);

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      await client.query('COMMIT');
      res.status(200).json({
        message: `تم تحديث حالة تفعيل المتجر بنجاح.`,
        store: updateResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating store activation by branch manager:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/branch-manager/stores/:storeId/override-status - فرض حالة الفتح أو الإغلاق
router.put(
  '/stores/:storeId/override-status',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { storeId } = req.params;
    const { status } = req.body;
    const { managedRegions } = req.user;

    if (!status || !ALLOWED_OVERRIDE_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({
        message: 'حقل الحالة (status) مطلوب ويجب أن يكون إحدى القيم: AUTO, FORCE_OPEN, FORCE_CLOSED.',
        allowed_statuses: ALLOWED_OVERRIDE_STATUSES
      });
    }

    if (!managedRegions || managedRegions.length === 0) {
      return res.status(403).json({ message: 'الوصول مرفوض: أنت غير معين لإدارة أي منطقة خدمة.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const authCheckQuery = `
        SELECT EXISTS (
          SELECT 1
          FROM store_service_regions
          WHERE store_id = $1 AND region_id = ANY($2::int[])
        );
      `;
      const authCheckResult = await client.query(authCheckQuery, [storeId, managedRegions]);
      const isAuthorized = authCheckResult.rows[0].exists;

      if (!isAuthorized) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: لا تملك صلاحية إدارة هذا المتجر.' });
      }
      
      const updateQuery = `
        UPDATE stores
        SET admin_forced_status = $1
        WHERE id = $2
        RETURNING id, name, admin_forced_status;
      `;
      const updateResult = await client.query(updateQuery, [status.toUpperCase(), storeId]);

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث حالة التحكم اليدوي للمتجر بنجاح.',
        store: updateResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating store override status by branch manager:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/branch-manager/stores/:storeId/schedule - تحديد أوقات العمل الافتراضية
router.put(
  '/stores/:storeId/schedule',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { storeId } = req.params;
    let { default_opening_time, default_closing_time } = req.body;
    const { managedRegions } = req.user;

    if (default_opening_time !== undefined && !isValidTimeFormat(default_opening_time)) {
      return res.status(400).json({ message: 'صيغة وقت الفتح الافتراضي غير صالحة. استخدم HH:MM.' });
    }
    if (default_closing_time !== undefined && !isValidTimeFormat(default_closing_time)) {
      return res.status(400).json({ message: 'صيغة وقت الإغلاق الافتراضي غير صالحة. استخدم HH:MM.' });
    }

    if (default_opening_time === '') default_opening_time = null;
    if (default_closing_time === '') default_closing_time = null;

    if (!managedRegions || managedRegions.length === 0) {
      return res.status(403).json({ message: 'الوصول مرفوض: أنت غير معين لإدارة أي منطقة خدمة.' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const authCheckQuery = `
        SELECT EXISTS (
          SELECT 1
          FROM store_service_regions
          WHERE store_id = $1 AND region_id = ANY($2::int[])
        );
      `;
      const authCheckResult = await client.query(authCheckQuery, [storeId, managedRegions]);
      const isAuthorized = authCheckResult.rows[0].exists;

      if (!isAuthorized) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: لا تملك صلاحية إدارة هذا المتجر.' });
      }

      const updateQuery = `
        UPDATE stores
        SET
          default_opening_time = $1,
          default_closing_time = $2
        WHERE id = $3
        RETURNING id, name, default_opening_time, default_closing_time;
      `;
      const result = await client.query(updateQuery, [default_opening_time, default_closing_time, storeId]);
      
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }
      
      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث الجدول الزمني الافتراضي للمتجر بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating store schedule by branch manager:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر أو إحدى قيم الوقت غير صالحة.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/branch-manager/orders/:orderId/assign-delivery - إسناد طلب لموظف توصيل
router.put(
  '/orders/:orderId/assign-delivery',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { orderId } = req.params;
    const { delivery_worker_id } = req.body;
    const { managedRegions } = req.user;

    if (!delivery_worker_id || !Number.isInteger(delivery_worker_id) || delivery_worker_id <= 0) {
      return res.status(400).json({ message: 'معرف موظف التوصيل مطلوب ويجب أن يكون رقماً صحيحياً موجباً.' });
    }

    if (!managedRegions || managedRegions.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: أنت غير معين لإدارة أي منطقة خدمة.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderCheckQuery = 'SELECT id, status, store_id, user_id FROM orders WHERE id = $1;';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }
      
      const currentOrder = orderCheckResult.rows[0];
      const storeId = currentOrder.store_id;
      
      const authCheckQuery = `
        SELECT EXISTS (
          SELECT 1 FROM store_service_regions WHERE store_id = $1 AND region_id = ANY($2::int[])
        );
      `;
      const authCheckResult = await client.query(authCheckQuery, [storeId, managedRegions]);
      if (!authCheckResult.rows[0].exists) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: هذا الطلب لا يقع ضمن مناطق الخدمة الخاصة بك.' });
      }

      if (currentOrder.status !== 'ready_for_delivery') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إسناد هذا الطلب. يجب أن يكون في حالة "ready_for_delivery".` });
      }

      const workerCheckQuery = 'SELECT user_role, id FROM users WHERE id = $1';
      const workerCheckResult = await client.query(workerCheckQuery, [delivery_worker_id]);

      if (workerCheckResult.rows.length === 0 || workerCheckResult.rows[0].user_role !== 'delivery_worker') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `المستخدم بالمعرف ${delivery_worker_id} ليس موظف توصيل صالح.` });
      }

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'assigned_for_delivery',
            delivery_worker_id = $1,
            last_status_update_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const updatedOrderResult = await client.query(updateOrderQuery, [delivery_worker_id, orderId]);
      const updatedOrder = updatedOrderResult.rows[0];

      const dwNotificationMessage = `تم إسناد مهمة توصيل جديدة لك (طلب رقم #${updatedOrder.id}).`;
      const customerNotificationMessage = `طلبك رقم #${updatedOrder.id} تم إسناده لموظف التوصيل وهو في طريقه إليك قريباً.`;
      
      sendPushNotification(delivery_worker_id, 'مهمة توصيل جديدة', dwNotificationMessage, { orderId: updatedOrder.id.toString() }).catch(console.error);
      sendPushNotification(updatedOrder.user_id, 'طلبك قيد التوصيل', customerNotificationMessage, { orderId: updatedOrder.id.toString(), newStatus: 'assigned_for_delivery' }).catch(console.error);
      
      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم إسناد الطلب إلى موظف التوصيل بنجاح.',
        order: updatedOrder
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error assigning order by branch manager:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب أو معرف موظف التوصيل غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// PUT /api/branch-manager/orders/:orderId/force-cancel - إلغاء طلب قيد التوصيل
router.put(
  '/orders/:orderId/force-cancel',
  authMiddleware,
  checkRole('branch_manager'),
  async (req, res) => {
    const { orderId } = req.params;
    const { cancellation_reason } = req.body;
    const { managedRegions } = req.user;

    if (!cancellation_reason || cancellation_reason.trim() === '') {
      return res.status(400).json({ message: 'سبب الإلغاء حقل مطلوب.' });
    }

    if (!managedRegions || managedRegions.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: أنت غير معين لإدارة أي منطقة خدمة.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderQuery = 'SELECT id, status, user_id, delivery_worker_id, store_id FROM orders WHERE id = $1 FOR UPDATE';
      const orderResult = await client.query(orderQuery, [orderId]);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }
      
      const currentOrder = orderResult.rows[0];
      const storeId = currentOrder.store_id;

      const authCheckQuery = `
        SELECT EXISTS (
          SELECT 1 FROM store_service_regions WHERE store_id = $1 AND region_id = ANY($2::int[])
        );
      `;
      const authCheckResult = await client.query(authCheckQuery, [storeId, managedRegions]);
      if (!authCheckResult.rows[0].exists) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: هذا الطلب لا يقع ضمن مناطق الخدمة الخاصة بك.' });
      }
      
      if (!['assigned_for_delivery', 'out_for_delivery', 'ready_for_delivery'].includes(currentOrder.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إلغاء هذا الطلب قسرياً. الحالة الحالية للطلب هي: "${currentOrder.status}".` });
      }
      
      let reasonForDb = `(إلغاء من مدير الفرع): ${cancellation_reason}`;

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'cancelled_by_admin',
            rejection_reason = $1,
            last_status_update_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const updatedOrderResult = await client.query(updateOrderQuery, [reasonForDb, orderId]);
      const cancelledOrder = updatedOrderResult.rows[0];

      // إرسال الإشعارات للأطراف المعنية
      const { user_id, delivery_worker_id } = currentOrder;
      sendPushNotification(user_id, 'تم إلغاء طلبك', `للأسف، تم إلغاء طلبك رقم #${cancelledOrder.id} لأسباب تشغيلية.`, { orderId: cancelledOrder.id.toString(), newStatus: 'cancelled_by_admin' }).catch(console.error);
      if (delivery_worker_id) {
        sendPushNotification(delivery_worker_id, 'تم إلغاء مهمة', `تم إلغاء مهمة التوصيل للطلب رقم #${cancelledOrder.id}.`, { orderId: cancelledOrder.id.toString() }).catch(console.error);
      }
      
      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم إلغاء الطلب بنجاح.',
        order: cancelledOrder
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error force-cancelling order by branch manager:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);


module.exports = router;
