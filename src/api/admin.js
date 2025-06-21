const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { sendPushNotification } = require('../services/notificationService.js');

const router = express.Router();

const ALLOWED_STORE_TYPES = [
  'grocery_supermarket',
  'restaurant',
  'sweets_hospitality',
  'home_appliances_supplies',
  'clothing_accessories',
  'other'
];

const ALLOWED_OVERRIDE_STATUSES = ['AUTO', 'FORCE_OPEN', 'FORCE_CLOSED'];

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

const isValidTimeFormat = (timeString) => {
  if (timeString === null || timeString === '') return true;
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
  return timeRegex.test(timeString);
};

router.put(
  '/stores/:storeId/approve',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const client = await pool.connect();
    try {
      const storeQuery = 'SELECT * FROM stores WHERE id = $1';
      const storeResult = await client.query(storeQuery, [storeId]);
      if (storeResult.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }
      const store = storeResult.rows[0];
      if (store.is_active) {
        return res.status(400).json({ message: 'هذا المتجر مفعل بالفعل.' });
      }
      const updateQuery = 'UPDATE stores SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *';
      const updateResult = await client.query(updateQuery, [storeId]);
      res.status(200).json({
        message: 'تم تفعيل المتجر بنجاح.',
        store: updateResult.rows[0]
      });
    } catch (err) {
      console.error('Error approving store:', err);
      if (err.code && (err.code === '22P02' || err.code.startsWith('22'))){
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء محاولة تفعيل المتجر.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/stores/:storeId/type',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const { store_type } = req.body;

    if (!store_type) {
      return res.status(400).json({ message: 'حقل "store_type" مطلوب في جسم الطلب.' });
    }

    if (!ALLOWED_STORE_TYPES.includes(store_type)) {
      return res.status(400).json({
        message: 'نوع المتجر المحدد غير صالح.',
        allowed_types: ALLOWED_STORE_TYPES,
      });
    }

    const client = await pool.connect();
    try {
      const updateQuery = `
        UPDATE stores
        SET store_type = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const result = await client.query(updateQuery, [store_type, storeId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      res.status(200).json({
        message: 'تم تحديث نوع المتجر بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating store type by admin:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/stores/:storeId/commission-rate',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const { commission_rate } = req.body;

    if (commission_rate === undefined || typeof commission_rate !== 'number' || commission_rate < 0 || commission_rate > 100) {
      return res.status(400).json({ message: 'حقل "commission_rate" مطلوب ويجب أن يكون رقماً بين 0 و 100 (يمثل نسبة مئوية).' });
    }

    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId]);

      if (storeCheckResult.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      const rateToStore = commission_rate / 100;

      const updateQuery = `
        UPDATE stores
        SET commission_rate = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const result = await client.query(updateQuery, [rateToStore, storeId]);

      res.status(200).json({
        message: 'تم تحديث نسبة العمولة للمتجر بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating store commission rate:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح أو نوع البيانات للعمولة غير صحيح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث نسبة العمولة للمتجر.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/stores/:storeId/schedule',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    let { default_opening_time, default_closing_time } = req.body;

    if (default_opening_time !== undefined && !isValidTimeFormat(default_opening_time)) {
      return res.status(400).json({ message: 'صيغة وقت الفتح الافتراضي غير صالحة. استخدم HH:MM أو HH:MM:SS أو اتركها فارغة/null.' });
    }
    if (default_closing_time !== undefined && !isValidTimeFormat(default_closing_time)) {
      return res.status(400).json({ message: 'صيغة وقت الإغلاق الافتراضي غير صالحة. استخدم HH:MM أو HH:MM:SS أو اتركها فارغة/null.' });
    }

    if (default_opening_time === '') default_opening_time = null;
    if (default_closing_time === '') default_closing_time = null;

    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId]);

      if (storeCheckResult.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      const updateQuery = `
        UPDATE stores
        SET
          default_opening_time = $1,
          default_closing_time = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, name, default_opening_time, default_closing_time, admin_forced_status, owner_choice_status, updated_at;
      `;
      const result = await client.query(updateQuery, [default_opening_time, default_closing_time, storeId]);

      res.status(200).json({
        message: 'تم تحديث الجدول الزمني الافتراضي للمتجر بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating store schedule:', err);
      if (err.code === '22P02' && err.message.includes('invalid input syntax for type time')) {
         return res.status(400).json({ message: 'إحدى قيم الوقت المدخلة غير صالحة.' });
      }
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث الجدول الزمني للمتجر.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/stores/:storeId/override-status',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_OVERRIDE_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({
        message: 'حقل الحالة (status) مطلوب ويجب أن يكون إحدى القيم: AUTO, FORCE_OPEN, FORCE_CLOSED.',
        allowed_statuses: ALLOWED_OVERRIDE_STATUSES
      });
    }

    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId]);

      if (storeCheckResult.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      const updateQuery = `
        UPDATE stores
        SET
          admin_forced_status = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, name, default_opening_time, default_closing_time, admin_forced_status, owner_choice_status, updated_at;
      `;
      const result = await client.query(updateQuery, [status.toUpperCase(), storeId]);

      res.status(200).json({
        message: 'تم تحديث حالة التحكم اليدوي للمتجر من قبل المدير بنجاح.',
        store: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating store override status by admin:', err);
       if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث حالة التحكم اليدوي للمتجر.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/stores/:storeId/operational-settings',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
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
        WHERE id = $1;
      `;
      const result = await client.query(query, [parsedStoreId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }

      res.status(200).json({
        message: 'تم استرجاع إعدادات التشغيل للمتجر بنجاح.',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error fetching store operational settings:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/commission-reports/generate',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId, periodStartDate, periodEndDate } = req.body;

    if (!storeId || !periodStartDate || !periodEndDate) {
      return res.status(400).json({ message: 'الحقول storeId, periodStartDate, periodEndDate مطلوبة.' });
    }

    const parsedStoreId = parseInt(storeId);
    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر storeId يجب أن يكون رقماً صحيحاً.' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(periodStartDate) || !dateRegex.test(periodEndDate)) {
        return res.status(400).json({ message: 'صيغة تاريخ بداية أو نهاية الفترة غير صالحة. استخدم "YYYY-MM-DD".' });
    }

    let pStartDateForQuery, pEndDateForQuery;
    try {
      pStartDateForQuery = new Date(periodStartDate);
      pStartDateForQuery.setUTCHours(0, 0, 0, 0);

      pEndDateForQuery = new Date(periodEndDate);
      pEndDateForQuery.setUTCHours(23, 59, 59, 999);

      if (isNaN(pStartDateForQuery.getTime()) || isNaN(pEndDateForQuery.getTime())) {
        throw new Error('Invalid date object created');
      }
      if (pStartDateForQuery > pEndDateForQuery) {
        return res.status(400).json({ message: 'تاريخ بداية الفترة يجب أن يكون قبل أو نفس تاريخ نهاية الفترة.' });
      }
    } catch (e) {
      return res.status(400).json({ message: 'صيغة تاريخ بداية أو نهاية الفترة غير صالحة أو مشكلة في تحويل التاريخ.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storeQuery = 'SELECT id, name, commission_rate FROM stores WHERE id = $1';
      const storeResult = await client.query(storeQuery, [parsedStoreId]);
      if (storeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `المتجر بالمعرف ${parsedStoreId} غير موجود.` });
      }
      const store = storeResult.rows[0];
      if (store.commission_rate === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لم يتم تحديد نسبة عمولة للمتجر ${store.name} (ID: ${store.id}). يرجى تحديدها أولاً.` });
      }
      const commissionRateSnapshot = parseFloat(store.commission_rate);

      const ordersQuery = `
        SELECT id, user_id, items_subtotal, grand_total, order_placed_at
        FROM orders
        WHERE store_id = $1
          AND made_ready_at IS NOT NULL
          AND order_placed_at >= $2
          AND order_placed_at <= $3
        ORDER BY order_placed_at ASC;
      `;
      const ordersResult = await client.query(ordersQuery, [parsedStoreId, pStartDateForQuery, pEndDateForQuery]);
      const commissionableOrders = ordersResult.rows;

      if (commissionableOrders.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `لا توجد طلبات تستحق العمولة للمتجر ${store.name} في الفترة المحددة.` });
      }

      let totalSalesForCommission = 0;
      let totalCommissionCalculated = 0;
      const reportOrderDetailsToInsert = [];

      for (const order of commissionableOrders) {
        const orderItemsSubtotal = parseFloat(order.items_subtotal);
        const actualOrderGrandTotal = parseFloat(order.grand_total);

        const commissionOnOrder = parseFloat((orderItemsSubtotal * commissionRateSnapshot).toFixed(2));

        totalSalesForCommission += orderItemsSubtotal;
        totalCommissionCalculated += commissionOnOrder;

        reportOrderDetailsToInsert.push({
          order_id: order.id,
          order_placed_at: order.order_placed_at,
          customer_id: order.user_id,
          order_grand_total: actualOrderGrandTotal,
          commission_on_order: commissionOnOrder
        });
      }
      totalSalesForCommission = parseFloat(totalSalesForCommission.toFixed(2));
      totalCommissionCalculated = parseFloat(totalCommissionCalculated.toFixed(2));

      const reportInsertQuery = `
        INSERT INTO commission_reports
          (store_id, report_period_start_date, report_period_end_date, total_sales_subject_to_commission, commission_rate_applied, commission_amount_calculated, calculated_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 'GENERATED')
        RETURNING id, calculated_at, status; 
      `;
      const reportInsertValues = [
        parsedStoreId,
        periodStartDate,
        periodEndDate,
        totalSalesForCommission,
        commissionRateSnapshot,
        totalCommissionCalculated
      ];
      const reportResult = await client.query(reportInsertQuery, reportInsertValues);
      const newReport = reportResult.rows[0];

      const orderDetailInsertPromises = reportOrderDetailsToInsert.map(detail => {
        const detailQuery = `
          INSERT INTO commission_report_orders
            (report_id, order_id, order_placed_at, customer_id, order_grand_total, commission_on_order)
          VALUES ($1, $2, $3, $4, $5, $6);
        `;
        return client.query(detailQuery, [
          newReport.id,
          detail.order_id,
          detail.order_placed_at,
          detail.customer_id,
          detail.order_grand_total,
          detail.commission_on_order
        ]);
      });
      await Promise.all(orderDetailInsertPromises);

      await client.query('COMMIT');
      res.status(201).json({
        message: `تم إنشاء تقرير العمولة للمتجر ${store.name} بنجاح للفترة من ${periodStartDate} إلى ${periodEndDate}.`,
        report_summary: {
          report_id: newReport.id,
          store_id: parsedStoreId,
          store_name: store.name,
          period_start_date: periodStartDate,
          period_end_date: periodEndDate,
          total_sales_subject_to_commission: totalSalesForCommission,
          commission_rate_applied: commissionRateSnapshot,
          total_commission_payable: totalCommissionCalculated,
          calculated_at: newReport.calculated_at,
          status: newReport.status,
          number_of_orders_included: commissionableOrders.length
        }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ message: 'تقرير عمولة لهذا المتجر وهذه الفترة موجود بالفعل.' });
      }
      console.error('Error generating commission report:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء تقرير العمولة.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/commission-reports/:reportId',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { reportId } = req.params;
    const parsedReportId = parseInt(reportId);

    if (isNaN(parsedReportId)) {
      return res.status(400).json({ message: 'معرف التقرير يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      const reportSummaryQuery = `
        SELECT 
          cr.id AS report_id, 
          cr.store_id, 
          s.name AS store_name,
          TO_CHAR(cr.report_period_start_date, 'YYYY-MM-DD') AS report_period_start_date,
          TO_CHAR(cr.report_period_end_date, 'YYYY-MM-DD') AS report_period_end_date,
          cr.total_sales_subject_to_commission, 
          cr.commission_rate_applied, 
          cr.commission_amount_calculated,
          cr.calculated_at, 
          cr.status AS report_status,
          cr.is_finalized,
          cr.finalized_at,
          u_admin.full_name AS calculated_by_admin_name,
          cr.notes AS report_notes
        FROM commission_reports cr
        JOIN stores s ON cr.store_id = s.id
        LEFT JOIN users u_admin ON cr.calculated_by_admin_id = u_admin.id
        WHERE cr.id = $1;
      `;
      const reportSummaryResult = await client.query(reportSummaryQuery, [parsedReportId]);

      if (reportSummaryResult.rows.length === 0) {
        return res.status(404).json({ message: `تقرير العمولة بالمعرف ${parsedReportId} غير موجود.` });
      }
      const reportSummary = reportSummaryResult.rows[0];

      const reportOrdersQuery = `
        SELECT 
          cro.id AS report_item_id,
          cro.order_id,
          o.items_subtotal AS order_items_subtotal, 
          o.delivery_fee AS order_delivery_fee,   
          cro.order_grand_total, 
          cro.commission_on_order, 
          o.delivery_address, 
          o.special_notes AS order_special_notes,
          cro.order_placed_at,
          cro.customer_id,
          u_cust.full_name AS customer_name,
          u_cust.phone_number AS customer_phone
        FROM commission_report_orders cro
        JOIN orders o ON cro.order_id = o.id
        LEFT JOIN users u_cust ON cro.customer_id = u_cust.id
        WHERE cro.report_id = $1
        ORDER BY cro.order_placed_at ASC;
      `;
      const reportOrdersResult = await client.query(reportOrdersQuery, [parsedReportId]);

      res.status(200).json({
        message: 'تم استرجاع تفاصيل تقرير العمولة بنجاح.',
        report: {
          summary: reportSummary,
          detailed_orders: reportOrdersResult.rows
        }
      });

    } catch (err) {
      console.error('Error fetching commission report details:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف التقرير غير صالح.'});
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء استرجاع تفاصيل تقرير العمولة.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/commission-reports/:reportId/finalize',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { reportId } = req.params;
    const adminUserId = req.user.id;
    const { notes } = req.body;

    const parsedReportId = parseInt(reportId);
    if (isNaN(parsedReportId)) {
      return res.status(400).json({ message: 'معرف التقرير يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reportCheckQuery = 'SELECT id, status, is_finalized FROM commission_reports WHERE id = $1 FOR UPDATE';
      const reportCheckResult = await client.query(reportCheckQuery, [parsedReportId]);

      if (reportCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `تقرير العمولة بالمعرف ${parsedReportId} غير موجود.` });
      }

      const currentReport = reportCheckResult.rows[0];
      if (currentReport.is_finalized) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `هذا التقرير (ID: ${parsedReportId}) قد تم إنهاؤه بالفعل.` });
      }

      const updateFields = [
        'status = $1',
        'is_finalized = $2',
        'finalized_at = CURRENT_TIMESTAMP',
        'calculated_by_admin_id = $3'
      ];
      const updateValues = ['FINALIZED', true, adminUserId];
      let paramIndex = 4;

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        updateValues.push(notes);
      }

      updateValues.push(parsedReportId);

      const updateQuery = `
        UPDATE commission_reports
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, store_id, TO_CHAR(report_period_start_date, 'YYYY-MM-DD') AS report_period_start_date, TO_CHAR(report_period_end_date, 'YYYY-MM-DD') AS report_period_end_date, total_sales_subject_to_commission, commission_rate_applied, commission_amount_calculated, calculated_at, status, is_finalized, finalized_at, calculated_by_admin_id, notes;
      `;

      const updateResult = await client.query(updateQuery, updateValues);

      await client.query('COMMIT');
      res.status(200).json({
        message: `تم إنهاء تقرير العمولة (ID: ${parsedReportId}) بنجاح.`,
        report: updateResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error finalizing commission report:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف التقرير غير صالح.'});
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنهاء تقرير العمولة.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/orders/waiting',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const query = `
        SELECT
          o.id AS order_id,
          u.full_name AS customer_name,
          s.name AS store_name,
          o.store_id,
          o.grand_total,
          o.status,
          o.order_placed_at,
          o.last_status_update_at
        FROM orders AS o
        JOIN users AS u ON o.user_id = u.id
        JOIN stores AS s ON o.store_id = s.id
        WHERE o.status = 'waiting'
        ORDER BY o.order_placed_at ASC;
      `;
      const result = await client.query(query);

      res.status(200).json({
        message: 'تم استرجاع قائمة الطلبات قيد الانتظار بنجاح.',
        orders: result.rows
      });

    } catch (err) {
      console.error('Error fetching waiting orders for admin:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب الطلبات قيد الانتظار.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/orders',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { regionIds, status, storeId, customerId } = req.query;

    const client = await pool.connect();
    try {
      let query = `
        SELECT DISTINCT
          o.id AS order_id,
          o.status,
          o.grand_total,
          o.created_at,
          s.id AS store_id,
          s.name AS store_name,
          u.id AS customer_id,
          u.full_name AS customer_name
        FROM
          orders o
        JOIN
          stores s ON o.store_id = s.id
        JOIN
          users u ON o.customer_id = u.id
        LEFT JOIN
          store_service_regions ssr ON o.store_id = ssr.store_id
      `;

      const whereClauses = [];
      const values = [];

      if (regionIds) {
        const regionIdsArray = regionIds.split(',').map(id => {
            const parsedId = parseInt(id.trim());
            if (isNaN(parsedId)) {
                return null;
            }
            return parsedId;
        }).filter(id => id !== null);
        
        if (regionIdsArray.length > 0) {
          whereClauses.push(`ssr.service_region_id = ANY($${values.length + 1})`);
          values.push(regionIdsArray);
        }
      }

      if (status) {
        whereClauses.push(`o.status = $${values.length + 1}`);
        values.push(status);
      }
      
      if (storeId) {
        whereClauses.push(`o.store_id = $${values.length + 1}`);
        values.push(parseInt(storeId));
      }

      if (customerId) {
        whereClauses.push(`o.customer_id = $${values.length + 1}`);
        values.push(parseInt(customerId));
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      query += ' ORDER BY o.created_at DESC';

      const result = await client.query(query, values);
      res.status(200).json(result.rows);
    } catch (err) {
      console.error('Error fetching orders for admin:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب الطلبات.' });
    } finally {
      client.release();
    }
  }
);


router.put(
  '/orders/:orderId/assign-delivery',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { orderId } = req.params;
    const { delivery_worker_id } = req.body;

    if (!delivery_worker_id || !Number.isInteger(delivery_worker_id) || delivery_worker_id <= 0) {
      return res.status(400).json({ message: 'معرف موظف التوصيل مطلوب ويجب أن يكون رقماً صحيحياً موجباً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workerCheckQuery = 'SELECT id, user_role FROM users WHERE id = $1';
      const workerCheckResult = await client.query(workerCheckQuery, [delivery_worker_id]);

      if (workerCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `موظف التوصيل بالمعرف ${delivery_worker_id} غير موجود.` });
      }
      if (workerCheckResult.rows[0].user_role !== 'delivery_worker') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `المستخدم بالمعرف ${delivery_worker_id} ليس من ضمن موظفي التوصيل.` });
      }

      const orderCheckQuery = 'SELECT id, status, user_id, store_id FROM orders WHERE id = $1;';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.status !== 'ready_for_delivery') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إسناد هذا الطلب لموظف توصيل. يجب أن يكون الطلب في حالة "ready_for_delivery". الحالة الحالية: "${currentOrder.status}".` });
      }

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'assigned_for_delivery',
            delivery_worker_id = $1,
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, status, delivery_worker_id, user_id, store_id, order_placed_at, grand_total;
      `;
      const updatedOrderResult = await client.query(updateOrderQuery, [delivery_worker_id, orderId]);
      const updatedOrder = updatedOrderResult.rows[0];

      const dwNotificationMessage = `تم إسناد مهمة توصيل جديدة لك (طلب رقم #${updatedOrder.id}).`;
      const dwNotificationLink = `/api/delivery/my-orders`;
      await client.query(
        'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
        [delivery_worker_id, dwNotificationMessage, dwNotificationLink, updatedOrder.id]
      );

      const customerNotificationMessage = `طلبك رقم #${updatedOrder.id} تم إسناده لموظف التوصيل وهو في طريقه إليك قريباً.`;
      const customerNotificationLink = `/api/orders/${updatedOrder.id}`;
      await client.query(
        'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
        [updatedOrder.user_id, customerNotificationMessage, customerNotificationLink, updatedOrder.id]
      );

      const storeOwnerQuery = 'SELECT owner_id FROM stores WHERE id = $1;';
      const storeOwnerResult = await client.query(storeOwnerQuery, [updatedOrder.store_id]);
      if (storeOwnerResult.rows.length > 0) {
          const storeOwnerId = storeOwnerResult.rows[0].owner_id;
          const soNotificationMessage = `تم إسناد الطلب رقم #${updatedOrder.id} من متجرك إلى موظف توصيل.`;
          const soNotificationLink = `/api/store-owner/orders/${updatedOrder.id}`;
          await client.query(
              'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
              [storeOwnerId, soNotificationMessage, soNotificationLink, updatedOrder.id]
          );
      }

      const fullOrderDetailsQuery = `
        SELECT
          o.id, o.user_id, u_cust.full_name AS customer_name, u_cust.email AS customer_email, u_cust.phone_number AS customer_phone,
          o.store_id, s.name AS store_name,
          o.status, o.delivery_address, o.special_notes,
          o.items_subtotal, o.delivery_fee, o.grand_total,
          o.rejection_reason, o.preparation_time_estimate_minutes,
          o.delivery_worker_id, u_dw.full_name AS delivery_worker_name,
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
        message: 'تم إسناد الطلب إلى موظف التوصيل بنجاح.',
        order: finalOrderResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error assigning order to delivery worker:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب أو معرف موظف التوصيل غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إسناد الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/orders/:orderId/cancel',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderCheckQuery = 'SELECT id, status, user_id, store_id FROM orders WHERE id = $1 FOR UPDATE;';
      const orderCheckResult = await client.query(orderCheckQuery, [orderId]);

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'الطلب غير موجود.' });
      }

      const currentOrder = orderCheckResult.rows[0];
      if (currentOrder.status !== 'waiting') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إلغاء هذا الطلب إلا إذا كان في حالة "waiting". الحالة الحالية: "${currentOrder.status}".` });
      }
      const customerId = currentOrder.user_id;
      const storeId = currentOrder.store_id;

      const orderItemsQuery = 'SELECT product_id, quantity FROM order_items WHERE order_id = $1;';
      const orderItemsResult = await client.query(orderItemsQuery, [orderId]);

      for (const item of orderItemsResult.rows) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND stock_quantity IS NOT NULL;',
          [item.quantity, item.product_id]
        );
      }

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'cancelled_by_admin',
            rejection_reason = 'تم الإلغاء من قبل الإدارة قبل موافقة المتجر.',
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `;
      const updatedOrderResult = await client.query(updateOrderQuery, [orderId]);
      const cancelledOrder = updatedOrderResult.rows[0];

      if (customerId) {
        const customerNotificationMessage = `للأسف، تم إلغاء طلبك رقم #${cancelledOrder.id} من قبل الإدارة.`;
        const customerNotificationLink = `/api/orders/${cancelledOrder.id}`;
        await client.query(
            'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
            [customerId, customerNotificationMessage, customerNotificationLink, cancelledOrder.id]
        );
      }

      const storeOwnerQuery = 'SELECT owner_id FROM stores WHERE id = $1;';
      const storeOwnerResult = await client.query(storeOwnerQuery, [storeId]);
      if (storeOwnerResult.rows.length > 0) {
          const storeOwnerId = storeOwnerResult.rows[0].owner_id;
          const soNotificationMessage = `تم إلغاء الطلب رقم #${cancelledOrder.id} (الذي كان موجهاً لمتجرك) من قبل الإدارة.`;
          const soNotificationLink = `/api/store-owner/orders/${cancelledOrder.id}`;
           await client.query(
              'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
              [storeOwnerId, soNotificationMessage, soNotificationLink, cancelledOrder.id]
          );
      }

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم إلغاء الطلب (الذي كان قيد الانتظار) من قبل المدير بنجاح.',
        order: cancelledOrder
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error cancelling order by admin:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إلغاء الطلب.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/orders/:orderId/force-cancel',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { orderId } = req.params;
    const { cancellation_reason } = req.body;
    const adminId = req.user.id;

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
      const customerId = currentOrder.user_id;
      const deliveryWorkerId = currentOrder.delivery_worker_id;
      const storeId = currentOrder.store_id;

      if (!['assigned_for_delivery', 'out_for_delivery'].includes(currentOrder.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `لا يمكن إلغاء هذا الطلب قسرياً إلا إذا كان مُسنداً للتوصيل أو قيد التوصيل الفعلي. الحالة الحالية: "${currentOrder.status}".` });
      }

      let reasonForDb = cancellation_reason ? `(إلغاء إداري قسري): ${cancellation_reason}` : 'تم الإلغاء قسرياً من قبل الإدارة أثناء مرحلة التوصيل.';

      const updateOrderQuery = `
        UPDATE orders
        SET status = 'cancelled_by_admin',
            rejection_reason = $1,
            last_status_update_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const updatedOrderResult = await client.query(updateOrderQuery, [reasonForDb, orderId]);
      const cancelledOrder = updatedOrderResult.rows[0];

      if (customerId) {
        const customerNotificationMessage = `للأسف، تم إلغاء طلبك رقم #${cancelledOrder.id} من قبل الإدارة لأسباب تشغيلية طارئة.`;
        const customerNotificationLink = `/api/orders/${cancelledOrder.id}`;
        await client.query(
          'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
          [customerId, customerNotificationMessage, customerNotificationLink, cancelledOrder.id]
        );
      }

      if (deliveryWorkerId) {
        const deliveryNotificationMessage = `تم إلغاء مهمة التوصيل للطلب رقم #${cancelledOrder.id} من قبل الإدارة.`;
        const deliveryNotificationLink = `/api/delivery/my-orders`;
        await client.query(
          'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
          [deliveryWorkerId, deliveryNotificationMessage, deliveryNotificationLink, cancelledOrder.id]
        );
      }

      const storeOwnerQuery = 'SELECT owner_id FROM stores WHERE id = $1;';
      const storeOwnerResult = await client.query(storeOwnerQuery, [storeId]);
      if (storeOwnerResult.rows.length > 0) {
          const storeOwnerId = storeOwnerResult.rows[0].owner_id;
          const soNotificationMessage = `تم إلغاء الطلب رقم #${cancelledOrder.id} (الذي كان من متجرك وفي مرحلة التوصيل) قسرياً من قبل الإدارة.`;
          const soNotificationLink = `/api/store-owner/orders/${cancelledOrder.id}`;
           await client.query(
              'INSERT INTO notifications (user_id, message, link, order_id) VALUES ($1, $2, $3, $4)',
              [storeOwnerId, soNotificationMessage, soNotificationLink, cancelledOrder.id]
          );
      }

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم إلغاء الطلب (قيد التوصيل) قسرياً من قبل المدير بنجاح.',
        order: cancelledOrder
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error force cancelling order by admin:', err);
      if (err.code === '22P02') {
        return res.status(400).json({ message: 'معرف الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء محاولة إلغاء الطلب.' });
    } finally {
      client.release();
    }
  }
);
// This is a new route handler for GET /orders-admin
router.post(
  '/service-regions',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { name, description, is_active = true, support_phone_number } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'اسم منطقة الخدمة (name) حقل نصي مطلوب.' });
    }
    if (description && typeof description !== 'string') {
      return res.status(400).json({ message: 'وصف منطقة الخدمة (description) يجب أن يكون نصياً إذا تم توفيره.' });
    }
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'حقل النشاط (is_active) يجب أن يكون قيمة منطقية (true/false).' });
    }

    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO service_regions (name, description, is_active, support_phone_number)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const result = await client.query(query, [name.trim(), description, is_active, support_phone_number]);
      res.status(201).json({
        message: 'تم إنشاء منطقة الخدمة بنجاح.',
        service_region: result.rows[0]
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ message: `اسم منطقة الخدمة '${name.trim()}' موجود بالفعل.` });
      }
      console.error('Error creating service region:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء منطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

// This is a new route handler for GET /service-regions
router.get(
  '/service-regions',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const query = 'SELECT id, name, description, is_active, created_at, updated_at, support_phone_number FROM service_regions ORDER BY name ASC;';
      const result = await client.query(query);
      res.status(200).json({
        message: 'تم استرجاع مناطق الخدمة بنجاح.',
        service_regions: result.rows
      });
    } catch (err) {
      console.error('Error fetching service regions:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب مناطق الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/service-regions/:regionId',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { regionId } = req.params;
    const parsedRegionId = parseInt(regionId);

    if (isNaN(parsedRegionId)) {
      return res.status(400).json({ message: 'معرف منطقة الخدمة يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      const query = 'SELECT id, name, description, is_active, created_at, updated_at, support_phone_number FROM service_regions WHERE id = $1;';
      const result = await client.query(query, [parsedRegionId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: `لم يتم العثور على منطقة خدمة بالمعرف ${parsedRegionId}.` });
      }
      res.status(200).json({
        message: 'تم استرجاع منطقة الخدمة بنجاح.',
        service_region: result.rows[0]
      });
    } catch (err) {
      console.error('Error fetching service region by ID:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب منطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/service-regions/:regionId',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { regionId } = req.params;
    const parsedRegionId = parseInt(regionId);
    const { name, description, is_active, support_phone_number } = req.body;

    if (isNaN(parsedRegionId)) {
      return res.status(400).json({ message: 'معرف منطقة الخدمة يجب أن يكون رقماً صحيحاً.' });
    }

    let updateFields = [];
    let values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ message: 'اسم منطقة الخدمة (name) يجب ألا يكون فارغاً إذا تم توفيره للتعديل.' });
      }
      updateFields.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: 'حقل النشاط (is_active) يجب أن يكون قيمة منطقية (true/false) إذا تم توفيره.' });
      }
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (support_phone_number !== undefined) {
        updateFields.push(`support_phone_number = $${paramIndex++}`);
        values.push(support_phone_number);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'لا توجد حقول لتحديثها. يرجى توفير حقل واحد على الأقل (name, description, is_active, support_phone_number).' });
    }

    values.push(parsedRegionId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const checkQuery = 'SELECT id FROM service_regions WHERE id = $1;';
      const checkResult = await client.query(checkQuery, [parsedRegionId]);
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `لم يتم العثور على منطقة خدمة بالمعرف ${parsedRegionId}.` });
      }

      const query = `
        UPDATE service_regions
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *;
      `;
      const result = await client.query(query, values);

      await client.query('COMMIT');
      res.status(200).json({
        message: 'تم تحديث منطقة الخدمة بنجاح.',
        service_region: result.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ message: `اسم منطقة الخدمة '${name ? name.trim() : ''}' موجود بالفعل لمنطقة أخرى.` });
      }
      console.error('Error updating service region:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث منطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.delete(
  '/service-regions/:regionId',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { regionId } = req.params;
    const parsedRegionId = parseInt(regionId);

    if (isNaN(parsedRegionId)) {
      return res.status(400).json({ message: 'معرف منطقة الخدمة يجب أن يكون رقماً صحيحاً.' });
    }

    const client = await pool.connect();
    try {
      const query = 'DELETE FROM service_regions WHERE id = $1 RETURNING *;';
      const result = await client.query(query, [parsedRegionId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: `لم يتم العثور على منطقة خدمة بالمعرف ${parsedRegionId} ليتم حذفها.` });
      }
      res.status(200).json({
        message: `تم حذف منطقة الخدمة (ID: ${parsedRegionId}) وكل الروابط المتعلقة بها بالمتاجر بنجاح.`,
        deleted_service_region: result.rows[0]
      });
    } catch (err) {
      console.error('Error deleting service region:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حذف منطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/stores/:storeId/service-regions',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const { region_id } = req.body;

    const parsedStoreId = parseInt(storeId);
    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) يجب أن يكون رقماً صحيحاً.' });
    }

    if (region_id === undefined || !Number.isInteger(region_id) || region_id <= 0) {
      return res.status(400).json({ message: 'معرف منطقة الخدمة (region_id) مطلوب في جسم الطلب ويجب أن يكون رقماً صحيحياً موجباً.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storeCheck = await client.query('SELECT id FROM stores WHERE id = $1', [parsedStoreId]);
      if (storeCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `المتجر بالمعرف ${parsedStoreId} غير موجود.` });
      }

      const regionCheck = await client.query('SELECT id FROM service_regions WHERE id = $1 AND is_active = true', [region_id]);
      if (regionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `منطقة الخدمة بالمعرف ${region_id} غير موجودة أو غير نشطة.` });
      }

      const associationCheck = await client.query(
        'SELECT store_id FROM store_service_regions WHERE store_id = $1 AND region_id = $2',
        [parsedStoreId, region_id]
      );
      if (associationCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'هذا المتجر مرتبط بالفعل بهذه المنطقة الخدمية.' });
      }

      const insertQuery = `
        INSERT INTO store_service_regions (store_id, region_id)
        VALUES ($1, $2)
        RETURNING store_id, region_id, created_at;
      `;
      const result = await client.query(insertQuery, [parsedStoreId, region_id]);

      await client.query('COMMIT');
      res.status(201).json({
        message: 'تم ربط المتجر بمنطقة الخدمة بنجاح.',
        association: result.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ message: 'هذا المتجر مرتبط بالفعل بهذه المنطقة الخدمية (خطأ قيد فريد).' });
      }
      if (err.code === '23503') {
           if (err.constraint && err.constraint.includes('store_id')) {
             return res.status(404).json({ message: `المتجر بالمعرف ${parsedStoreId} غير موجود (خطأ مفتاح أجنبي).` });
           }
           if (err.constraint && err.constraint.includes('region_id')) {
             return res.status(404).json({ message: `منطقة الخدمة بالمعرف ${region_id} غير موجودة (خطأ مفتاح أجنبي).` });
           }
      }
      console.error('Error linking store to service region:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء ربط المتجر بمنطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/stores/:storeId/service-regions',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId } = req.params;
    const parsedStoreId = parseInt(storeId);

    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) يجب أن يكون رقماً صحيحياً.' });
    }

    const client = await pool.connect();
    try {
      const storeCheck = await client.query('SELECT id, name FROM stores WHERE id = $1', [parsedStoreId]);
      if (storeCheck.rows.length === 0) {
        return res.status(404).json({ message: `المتجر بالمعرف ${parsedStoreId} غير موجود.` });
      }
      const storeName = storeCheck.rows[0].name;

      const query = `
        SELECT
          sr.id,
          sr.name,
          sr.description,
          sr.is_active,
          ssr.created_at AS linked_at
        FROM service_regions sr
        JOIN store_service_regions ssr ON sr.id = ssr.region_id
        WHERE ssr.store_id = $1
        ORDER BY sr.name ASC;
      `;
      const result = await client.query(query, [parsedStoreId]);

      res.status(200).json({
        message: `تم استرجاع مناطق الخدمة المرتبطة بالمتجر '${storeName}' (ID: ${parsedStoreId}) بنجاح.`,
        store_id: parsedStoreId,
        store_name: storeName,
        service_regions: result.rows
      });

    } catch (err) {
      console.error('Error fetching service regions for store:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب مناطق الخدمة للمتجر.' });
    } finally {
      client.release();
    }
  }
);

router.delete(
  '/stores/:storeId/service-regions/:regionId',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { storeId, regionId } = req.params;

    const parsedStoreId = parseInt(storeId);
    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر (storeId) يجب أن يكون رقماً صحيحياً.' });
    }

    const parsedRegionId = parseInt(regionId);
    if (isNaN(parsedRegionId)) {
      return res.status(400).json({ message: 'معرف منطقة الخدمة (regionId) يجب أن يكون رقماً صحيحياً.' });
    }

    const client = await pool.connect();
    try {
      const storeCheck = await client.query('SELECT id FROM stores WHERE id = $1', [parsedStoreId]);
      if (storeCheck.rows.length === 0) {
        return res.status(404).json({ message: `المتجر بالمعرف ${parsedStoreId} غير موجود.` });
      }
      const regionCheck = await client.query('SELECT id FROM service_regions WHERE id = $1', [parsedRegionId]);
      if (regionCheck.rows.length === 0) {
        return res.status(404).json({ message: `منطقة الخدمة بالمعرف ${parsedRegionId} غير موجودة.` });
      }

      const deleteQuery = `
        DELETE FROM store_service_regions
        WHERE store_id = $1 AND region_id = $2
        RETURNING *;
      `;
      const result = await client.query(deleteQuery, [parsedStoreId, parsedRegionId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'لم يتم العثور على ارتباط بين هذا المتجر وهذه المنطقة الخدمية ليتم حذفه.' });
      }

      res.status(200).json({
        message: 'تم إلغاء ربط المتجر بمنطقة الخدمة بنجاح.',
        unlinked_association: result.rows[0]
      });

    } catch (err) {
      console.error('Error unlinking store from service region:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إلغاء ربط المتجر بمنطقة الخدمة.' });
    } finally {
      client.release();
    }
  }
);

router.get('/test', authMiddleware, checkRole('admin'), (req, res) => {
  res.send('Admin route test is working!');
});

module.exports = router;
