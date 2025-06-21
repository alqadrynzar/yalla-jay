const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');

const router = express.Router();
const ALLOWED_OVERRIDE_STATUSES = ['AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'];

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


module.exports = router;
