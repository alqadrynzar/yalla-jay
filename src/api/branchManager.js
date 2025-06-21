const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');

const router = express.Router();

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

module.exports = router;
