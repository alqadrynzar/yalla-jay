const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');
const { isStoreCurrentlyAcceptingOrders } = require('../utils/storeAvailability.js');

const router = express.Router();

// POST /api/stores - إنشاء متجر جديد (محمي لصاحب المتجر، ينتظر موافقة المدير)
router.post(
  '/',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { name, description, address, phoneNumber, logoUrl, store_type } = req.body;
    const ownerId = req.user.id; 

    if (!name) {
      return res.status(400).json({ message: 'اسم المتجر حقل مطلوب.' });
    }

    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO stores (owner_id, name, description, address, phone_number, logo_url, is_active, store_type)
        VALUES ($1, $2, $3, $4, $5, $6, false, $7) 
        RETURNING *; 
      `;
      const values = [ownerId, name, description, address, phoneNumber, logoUrl, store_type];
      const result = await client.query(query, values);

      res.status(201).json({
        message: 'تم إرسال طلب إنشاء المتجر بنجاح. سيتم مراجعته من قبل الإدارة قريباً.',
        store: result.rows[0]
      });
    } catch (err) {
      console.error('Error creating store:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء المتجر.' });
    } finally {
      client.release();
    }
  }
);

// GET /api/stores/my-store - استرجاع متاجر صاحب المتجر المسجل دخوله (مع حالة التشغيل)
router.get(
  '/my-store',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const ownerId = req.user.id;
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, description, address, phone_number, logo_url, is_active, store_type,
               default_opening_time, default_closing_time, admin_forced_status, owner_choice_status,
               created_at, updated_at 
        FROM stores 
        WHERE owner_id = $1 
        ORDER BY created_at DESC
      `;
      const result = await client.query(query, [ownerId]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          message: 'لم يتم العثور على متاجر لهذا المستخدم.',
          stores: [] 
        });
      }

      const now = new Date();
      const storesWithOperationalStatus = result.rows.map(store => {
        const { 
          admin_forced_status, owner_choice_status, default_opening_time, default_closing_time, is_active, 
          ...publicStoreData 
        } = store;
        return {
          ...publicStoreData, 
          is_active: store.is_active, 
          default_opening_time: store.default_opening_time, 
          default_closing_time: store.default_closing_time, 
          admin_forced_status: store.admin_forced_status, 
          owner_choice_status: store.owner_choice_status,   
          is_currently_accepting_orders: isStoreCurrentlyAcceptingOrders(store, now)
        };
      });

      res.status(200).json({
        message: 'تم استرجاع بيانات متاجر المالك بنجاح مع حالة التشغيل.',
        stores: storesWithOperationalStatus
      });

    } catch (err) {
      console.error('Error fetching user stores:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء استرجاع بيانات المتاجر.' });
    } finally {
      client.release();
    }
  }
);

// GET /api/stores - استرجاع قائمة بجميع المتاجر النشطة (عام، مع حالة التشغيل، مع فلترة بالمنطقة ونوع المتجر)
router.get('/', async (req, res) => {
  const { region_id, store_type } = req.query;
  const client = await pool.connect();
  try {
    const queryParams = [];
    let selectClause = `
      SELECT s.id, s.name, s.description, s.address, s.phone_number, s.logo_url, s.created_at, s.store_type,
             s.default_opening_time, s.default_closing_time, s.admin_forced_status, s.owner_choice_status, s.is_active 
      FROM stores s
    `;
    let whereConditions = ['s.is_active = true'];
    let joinClause = '';
    const orderByClause = 'ORDER BY s.name ASC';

    if (region_id) {
      const parsedRegionId = parseInt(region_id);
      if (isNaN(parsedRegionId) || parsedRegionId <= 0) {
        return res.status(400).json({ message: 'معرف المنطقة (region_id) يجب أن يكون رقماً صحيحاً موجباً.' });
      }

      const regionCheck = await client.query('SELECT id FROM service_regions WHERE id = $1 AND is_active = true', [parsedRegionId]);
      if (regionCheck.rows.length === 0) {
          return res.status(200).json({
              message: `منطقة الخدمة المحددة (ID: ${parsedRegionId}) غير موجودة، غير نشطة، أو لا توجد متاجر مرتبطة بها حالياً.`,
              stores: []
          });
      }

      joinClause = 'JOIN store_service_regions ssr ON s.id = ssr.store_id';
      whereConditions.push(`ssr.region_id = $${queryParams.length + 1}`);
      queryParams.push(parsedRegionId);
    }

    if (store_type) {
        if (typeof store_type !== 'string' || store_type.trim() === '') {
            return res.status(400).json({ message: 'نوع المتجر (store_type) يجب أن يكون نصاً غير فارغ.' });
        }
        whereConditions.push(`s.store_type = $${queryParams.length + 1}`);
        queryParams.push(store_type.trim());
    }

    const queryText = `${selectClause} ${joinClause} WHERE ${whereConditions.join(' AND ')} ${orderByClause}`;

    const result = await client.query(queryText, queryParams);
    const now = new Date();

    const storesWithStatus = result.rows.map(store => {
      const acceptingOrders = isStoreCurrentlyAcceptingOrders(store, now);
      return {
        id: store.id,
        name: store.name,
        description: store.description,
        address: store.address,
        phone_number: store.phone_number,
        logo_url: store.logo_url,
        store_type: store.store_type,
        created_at: store.created_at,
        is_currently_accepting_orders: acceptingOrders
      };
    });

    res.status(200).json({
      message: 'تم استرجاع قائمة المتاجر النشطة بنجاح.',
      stores: storesWithStatus
    });
  } catch (err) {
    console.error('Error fetching active stores:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء استرجاع المتاجر.' });
  } finally {
    client.release();
  }
});

// GET /api/stores/:storeId - استرجاع تفاصيل متجر معين (عام، مع حالة التشغيل)
router.get('/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const client = await pool.connect();
  try {
    const query = `
      SELECT s.id, s.name, s.description, s.address, s.phone_number, s.logo_url, s.created_at, s.store_type,
             s.default_opening_time, s.default_closing_time, s.admin_forced_status, s.owner_choice_status, s.is_active,
             ARRAY_AGG(ssr.region_id) FILTER (WHERE ssr.region_id IS NOT NULL) as service_region_ids
      FROM stores s
      LEFT JOIN store_service_regions ssr ON s.id = ssr.store_id
      WHERE s.id = $1 AND s.is_active = true
      GROUP BY s.id
    `;
    const result = await client.query(query, [storeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'المتجر غير موجود أو غير نشط.' });
    }
    const store = result.rows[0];
    const now = new Date();
    const acceptingOrders = isStoreCurrentlyAcceptingOrders(store, now);

    res.status(200).json({
      message: 'تم استرجاع تفاصيل المتجر بنجاح.',
      store: {
        id: store.id,
        name: store.name,
        description: store.description,
        address: store.address,
        phone_number: store.phone_number,
        logo_url: store.logo_url,
        store_type: store.store_type,
        created_at: store.created_at,
        default_opening_time: store.default_opening_time,
        default_closing_time: store.default_closing_time,
        is_currently_accepting_orders: acceptingOrders,
        service_region_ids: store.service_region_ids || []
      }
    });
  } catch (err) {
    console.error('Error fetching store by ID:', err.message);
    if (err.code && (err.code === '22P02' || err.code.startsWith('22'))){ 
         return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
    }
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء استرجاع المتجر.' });
  } finally {
    client.release();
  }
});

// GET /api/stores/:storeId/categories - استرجاع أقسام متجر معين
router.get('/:storeId/categories', async (req, res) => {
  const { storeId } = req.params;
  const client = await pool.connect();
  try {
    const parsedStoreId = parseInt(storeId);
    if (isNaN(parsedStoreId)) {
      return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
    }

    const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND is_active = true';
    const storeCheckResult = await client.query(storeCheckQuery, [parsedStoreId]);
    if (storeCheckResult.rows.length === 0) {
      return res.status(404).json({ message: 'المتجر غير موجود أو غير نشط.' });
    }

    const query = 'SELECT id, name, description, image_url, created_at, updated_at FROM categories WHERE store_id = $1 ORDER BY name ASC';
    const result = await client.query(query, [parsedStoreId]);

    res.status(200).json({
      message: 'تم استرجاع أقسام المتجر بنجاح.',
      categories: result.rows
    });
  } catch (err) {
    console.error('Error fetching categories for store:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء استرجاع الأقسام.' });
  } finally {
    client.release();
  }
});


// PUT /api/stores/:storeId - تحديث بيانات متجر (محمي لمالك المتجر فقط)
router.put(
  '/:storeId',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId } = req.params;
    const ownerId = req.user.id;
    // نستقبل حقل جديد لمناطق الخدمة
    const { name, description, address, phoneNumber, logoUrl, serviceRegionIds } = req.body;

    if (name !== undefined && (name === null || name.trim() === '')) {
      return res.status(400).json({ message: 'اسم المتجر لا يمكن أن يكون فارغاً إذا تم إرساله للتعديل.' });
    }

    const client = await pool.connect();
    try {
      // بدء معاملة قاعدة البيانات
      await client.query('BEGIN');

      const checkOwnerQuery = 'SELECT owner_id FROM stores WHERE id = $1';
      const checkOwnerResult = await client.query(checkOwnerQuery, [storeId]);

      if (checkOwnerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'المتجر غير موجود.' });
      }
      if (checkOwnerResult.rows[0].owner_id !== ownerId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'الوصول مرفوض: لا تملك صلاحية تعديل هذا المتجر.' });
      }

      // --- تحديث الحقول الأساسية للمتجر ---
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) { updateFields.push(`name = $${paramIndex++}`); values.push(name); }
      if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); values.push(description); }
      if (address !== undefined) { updateFields.push(`address = $${paramIndex++}`); values.push(address); }
      if (phoneNumber !== undefined) { updateFields.push(`phone_number = $${paramIndex++}`); values.push(phoneNumber); }
      if (logoUrl !== undefined) { updateFields.push(`logo_url = $${paramIndex++}`); values.push(logoUrl); }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(storeId); 

        const updateQuery = `
          UPDATE stores 
          SET ${updateFields.join(', ')} 
          WHERE id = $${paramIndex} 
        `;
        await client.query(updateQuery, values);
      }

      // --- تحديث مناطق الخدمة المرتبطة بالمتجر ---
      if (serviceRegionIds && Array.isArray(serviceRegionIds)) {
        // 1. حذف كل الارتباطات الحالية للمتجر
        await client.query('DELETE FROM store_service_regions WHERE store_id = $1', [storeId]);

        // 2. إضافة الارتباطات الجديدة
        if (serviceRegionIds.length > 0) {
          const insertRegionPromises = serviceRegionIds.map(regionId => {
            const insertQuery = 'INSERT INTO store_service_regions (store_id, region_id) VALUES ($1, $2)';
            return client.query(insertQuery, [storeId, regionId]);
          });
          await Promise.all(insertRegionPromises);
        }
      }

      // تأكيد المعاملة
      await client.query('COMMIT');

      // استرجاع بيانات المتجر المحدثة لإعادتها
      const finalResultQuery = 'SELECT * FROM stores WHERE id = $1';
      const finalResult = await client.query(finalResultQuery, [storeId]);

      res.status(200).json({
        message: 'تم تحديث بيانات المتجر بنجاح.',
        store: finalResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating store:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث المتجر.' });
    } finally {
      client.release();
    }
  }
);


// --- Categories Management (by Store Owner) ---
router.post(
  '/:storeId/categories',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId } = req.params; 
    const ownerId = req.user.id;   
    const { name, description, imageUrl } = req.body; 
    if (!name) {
      return res.status(400).json({ message: 'اسم القسم حقل مطلوب.' });
    }
    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId, ownerId]);
      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: المتجر غير موجود أو لا تملك صلاحية إضافة قسم إليه.' });
      }
      const insertCategoryQuery = `
        INSERT INTO categories (store_id, name, description, image_url)
        VALUES ($1, $2, $3, $4)
        RETURNING *; 
      `;
      const values = [storeId, name, description, imageUrl];
      const result = await client.query(insertCategoryQuery, values);
      res.status(201).json({
        message: 'تم إنشاء القسم بنجاح!',
        category: result.rows[0]
      });
    } catch (err) {
      console.error('Error creating category:', err);
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء القسم.' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/:storeId/categories/:categoryId',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId, categoryId } = req.params;
    const ownerId = req.user.id;
    const { name, description, imageUrl } = req.body;
    if (name !== undefined && (name === null || name.trim() === '')) {
      return res.status(400).json({ message: 'اسم القسم لا يمكن أن يكون فارغاً إذا تم إرساله للتعديل.' });
    }
    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId, ownerId]);
      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: المتجر غير موجود أو لا تملك صلاحية تعديل أقسام هذا المتجر.' });
      }
      const categoryCheckQuery = 'SELECT * FROM categories WHERE id = $1 AND store_id = $2';
      const categoryCheckResult = await client.query(categoryCheckQuery, [categoryId, storeId]);
      if (categoryCheckResult.rows.length === 0) {
        return res.status(404).json({ message: 'القسم غير موجود في هذا المتجر.' });
      }
      const currentCategory = categoryCheckResult.rows[0];
      const updateFields = [];
      const values = [];
      let paramIndex = 1;
      if (name !== undefined) { updateFields.push(`name = $${paramIndex++}`); values.push(name); }
      if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); values.push(description); }
      if (imageUrl !== undefined) { updateFields.push(`image_url = $${paramIndex++}`); values.push(imageUrl); }
      if (updateFields.length === 0) {
        return res.status(200).json({ message: 'لا توجد بيانات لتحديث القسم.', category: currentCategory });
      }
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(categoryId); 
      values.push(storeId);    
      const updateQuery = `
        UPDATE categories 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND store_id = $${paramIndex++}
        RETURNING *;
      `;
      const result = await client.query(updateQuery, values);
      res.status(200).json({
        message: 'تم تحديث القسم بنجاح.',
        category: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating category:', err);
      if (err.code && (err.code === '22P02' || err.code.startsWith('22'))){ 
        return res.status(400).json({ message: 'معرف المتجر أو القسم غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث القسم.' });
    } finally {
      client.release();
    }
  }
);

router.delete(
  '/:storeId/categories/:categoryId',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { storeId, categoryId } = req.params;
    const ownerId = req.user.id; 
    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [storeId, ownerId]);
      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: المتجر غير موجود أو لا تملك صلاحية حذف أقسام هذا المتجر.' });
      }
      const deleteCategoryQuery = 'DELETE FROM categories WHERE id = $1 AND store_id = $2 RETURNING id';
      const deleteResult = await client.query(deleteCategoryQuery, [categoryId, storeId]);
      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ message: 'القسم غير موجود في هذا المتجر أو تم حذفه بالفعل.' });
      }
      res.status(200).json({ message: 'تم حذف القسم بنجاح.' });
    } catch (err) {
      console.error('Error deleting category:', err);
      if (err.code && (err.code === '22P02' || err.code.startsWith('22'))){ 
        return res.status(400).json({ message: 'معرف المتجر أو القسم غير صالح.' });
      }
      if (err.code === '23503') { // Foreign key violation
        return res.status(409).json({ message: 'لا يمكن حذف القسم لأنه يحتوي على منتجات. يرجى حذف المنتجات أولاً أو نقلها.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حذف القسم.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
