const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');

const router = express.Router();

// GET /api/notifications - جلب كل إشعارات المستخدم المسجل دخوله
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    const query = `
      SELECT id, message, link, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await client.query(query, [userId]);

    res.status(200).json({
      message: 'تم استرجاع الإشعارات بنجاح.',
      notifications: result.rows,
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب الإشعارات.' });
  } finally {
    client.release();
  }
});

// PUT /api/notifications/:notificationId/read - تعليم إشعار معين كمقروء
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { notificationId } = req.params;
  const client = await pool.connect();

  try {
    const query = `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *;
    `;
    const result = await client.query(query, [notificationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'الإشعار غير موجود أو لا تملك صلاحية تعديله.' });
    }

    res.status(200).json({
      message: 'تم تعليم الإشعار كمقروء بنجاح.',
      notification: result.rows[0],
    });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الإشعار غير صالح.' });
    }
    res.status(500).json({ message: 'حدث خطأ في الخادم.' });
  } finally {
    client.release();
  }
});

// PUT /api/notifications/read-all - تعليم كل الإشعارات كمقروءة
router.put('/read-all', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
  
    try {
      const query = `
        UPDATE notifications
        SET is_read = true
        WHERE user_id = $1 AND is_read = false
        RETURNING id;
      `;
      const result = await client.query(query, [userId]);
  
      res.status(200).json({
        message: `تم تعليم كل الإشعارات الجديدة كمقروءة.`,
        count: result.rowCount
      });
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  });

module.exports = router;
