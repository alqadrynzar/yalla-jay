const express = require('express');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');

const router = express.Router();

// GET /api/products/search - البحث عن منتجات مع فلترة وترتيب وترقيم صفحات باستخدام FTS
router.get('/search', authMiddleware, async (req, res) => {
  const {
    q,
    categoryId,
    storeId,
    minPrice,
    maxPrice,
    isAvailable,
    sortBy,
    page = 1,
    limit = 10
  } = req.query;

  const client = await pool.connect();
  try {
    let baseQuery = `
      SELECT
        p.id, p.name, p.description, p.price, p.stock_quantity,
        p.image_url, p.is_available, p.store_id, s.name as store_name,
        p.category_id, c.name as category_name, p.created_at, p.updated_at
      FROM products p
      JOIN stores s ON p.store_id = s.id
      JOIN categories c ON p.category_id = c.id
    `;
    const countQueryBase = `
      SELECT COUNT(p.id)
      FROM products p
      JOIN stores s ON p.store_id = s.id
      JOIN categories c ON p.category_id = c.id
    `;

    const whereClauses = ["s.is_active = true"];
    const queryParams = [];
    let paramIndex = 1;

    if (q) {
      whereClauses.push(`to_tsvector('arabic', COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')) @@ websearch_to_tsquery('arabic', $${paramIndex})`);
      queryParams.push(q);
      paramIndex++;
    }
    if (categoryId) {
      whereClauses.push(`p.category_id = $${paramIndex}`);
      queryParams.push(parseInt(categoryId));
      paramIndex++;
    }
    if (storeId) {
      whereClauses.push(`p.store_id = $${paramIndex}`);
      queryParams.push(parseInt(storeId));
      paramIndex++;
    }
    if (minPrice) {
      whereClauses.push(`p.price >= $${paramIndex}`);
      queryParams.push(parseFloat(minPrice));
      paramIndex++;
    }
    if (maxPrice) {
      whereClauses.push(`p.price <= $${paramIndex}`);
      queryParams.push(parseFloat(maxPrice));
      paramIndex++;
    }

    const isOwnerRequest = req.user && req.user.role === 'store_owner';
    if (isOwnerRequest) {
      if (isAvailable === 'false') {
        whereClauses.push(`p.is_available = false`);
      } else if (isAvailable === 'true') {
        whereClauses.push(`p.is_available = true`);
      }
    } else {
      whereClauses.push(`p.is_available = true`);
    }

    let queryWithConditions = baseQuery;
    let countQueryWithConditions = countQueryBase;

    if (whereClauses.length > 0) {
      const whereString = " WHERE " + whereClauses.join(" AND ");
      queryWithConditions += whereString;
      countQueryWithConditions += whereString;
    }

    const totalResult = await client.query(countQueryWithConditions, queryParams);
    const totalItems = parseInt(totalResult.rows[0].count);

    let orderByClause = " ORDER BY p.created_at DESC";
    if (sortBy) {
      switch (sortBy) {
        case 'price_asc':
          orderByClause = " ORDER BY p.price ASC";
          break;
        case 'price_desc':
          orderByClause = " ORDER BY p.price DESC";
          break;
        case 'name_asc':
          orderByClause = " ORDER BY p.name ASC";
          break;
        case 'name_desc':
          orderByClause = " ORDER BY p.name DESC";
          break;
      }
    }
    queryWithConditions += orderByClause;

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const offset = (pageInt - 1) * limitInt;

    const finalQueryParams = [...queryParams];
    finalQueryParams.push(limitInt, offset);
    queryWithConditions += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

    const productsResult = await client.query(queryWithConditions, finalQueryParams);

    res.status(200).json({
      message: "تم استرجاع المنتجات بنجاح.",
      products: productsResult.rows,
      pagination: {
        totalItems: totalItems,
        totalPages: Math.ceil(totalItems / limitInt),
        currentPage: pageInt,
        limit: limitInt
      }
    });

  } catch (err) {
    console.error('Error searching products:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء البحث عن المنتجات.' });
  } finally {
    client.release();
  }
});


// POST /api/products - إنشاء منتج جديد
router.post(
  '/',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { name, price, description, stock_quantity, image_url, store_id, category_id } = req.body;
    const ownerId = req.user.id;

    if (!name || price === undefined || !store_id || !category_id) {
      return res.status(400).json({ message: 'الحقول (name, price, store_id, category_id) مطلوبة.' });
    }

    const client = await pool.connect();
    try {
      const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND owner_id = $2';
      const storeCheckResult = await client.query(storeCheckQuery, [store_id, ownerId]);

      if (storeCheckResult.rows.length === 0) {
        return res.status(403).json({ message: 'الوصول مرفوض: لا تملك صلاحية إضافة منتجات لهذا المتجر أو أن المتجر غير موجود.' });
      }

      const categoryCheckQuery = 'SELECT id FROM categories WHERE id = $1 AND store_id = $2';
      const categoryCheckResult = await client.query(categoryCheckQuery, [category_id, store_id]);

      if (categoryCheckResult.rows.length === 0) {
        return res.status(400).json({ message: 'القسم المحدد غير صحيح أو لا ينتمي لهذا المتجر.' });
      }

      const insertProductQuery = `
        INSERT INTO products (name, price, description, stock_quantity, image_url, store_id, category_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const values = [name, price, description, stock_quantity, image_url, store_id, category_id];
      const result = await client.query(insertProductQuery, values);

      res.status(201).json({
        message: 'تم إنشاء المنتج بنجاح!',
        product: result.rows[0]
      });

    } catch (err) {
      console.error('Error creating product:', err);
      if (err.code === '23503') {
          return res.status(400).json({ message: 'معرف المتجر أو القسم المحدد في الطلب غير صالح.' });
      }
      res.status(500).json({ message: 'حدث خطأ في الخادم أثناء إنشاء المنتج.' });
    } finally {
      client.release();
    }
  }
);

// GET /api/products/for-store/:storeId - عرض كل منتجات متجر معين (عام)
router.get('/for-store/:storeId', async (req, res) => {
    const { storeId } = req.params;

    const client = await pool.connect();
    try {
        const storeCheckQuery = 'SELECT id FROM stores WHERE id = $1 AND is_active = true';
        const storeCheckResult = await client.query(storeCheckQuery, [storeId]);

        if (storeCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'المتجر غير موجود أو غير نشط حالياً.' });
        }

        const getProductsQuery = `
            SELECT id, name, description, price, stock_quantity, image_url, category_id
            FROM products
            WHERE store_id = $1 AND is_available = true
            ORDER BY name ASC;
        `;
        const productsResult = await client.query(getProductsQuery, [storeId]);

        res.status(200).json({
            message: 'تم استرجاع منتجات المتجر بنجاح.',
            products: productsResult.rows
        });

    } catch (err) {
        console.error('Error fetching products for store:', err);
        if (err.code === '22P02') {
            return res.status(400).json({ message: 'معرف المتجر غير صالح.' });
        }
        res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب المنتجات.' });
    } finally {
        client.release();
    }
});

// GET /api/products/:productId - عرض منتج واحد محدد (عام)
router.get('/:productId', async (req, res) => {
    const { productId } = req.params;

    const client = await pool.connect();
    try {
        const query = `
            SELECT p.id, p.name, p.description, p.price, p.stock_quantity, p.image_url, p.is_available, p.store_id, s.name as store_name, p.category_id, c.name as category_name, p.created_at, p.updated_at
            FROM products AS p
            JOIN stores AS s ON p.store_id = s.id
            JOIN categories c ON p.category_id = c.id
            WHERE p.id = $1 AND s.is_active = true;
        `;
        const result = await client.query(query, [productId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'المنتج غير موجود أو ينتمي لمتجر غير نشط.' });
        }

        res.status(200).json({
            message: 'تم استرجاع المنتج بنجاح.',
            product: result.rows[0]
        });

    } catch (err) {
        console.error('Error fetching product by ID:', err);
        if (err.code === '22P02') {
            return res.status(400).json({ message: 'معرف المنتج غير صالح.' });
        }
        res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب المنتج.' });
    } finally {
        client.release();
    }
});

// PUT /api/products/:productId - تحديث بيانات منتج
router.put(
  '/:productId',
  authMiddleware,
  checkRole('store_owner'),
  async (req, res) => {
    const { productId } = req.params;
    const ownerId = req.user.id;
    const client = await pool.connect();

    try {
      const ownershipCheckQuery = `
        SELECT p.id FROM products AS p
        JOIN stores AS s ON p.store_id = s.id
        WHERE p.id = $1 AND s.owner_id = $2;
      `;
      const ownershipResult = await client.query(ownershipCheckQuery, [productId, ownerId]);

      if (ownershipResult.rows.length === 0) {
        return res.
