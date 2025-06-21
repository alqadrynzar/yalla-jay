const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database.js');
const authMiddleware = require('../middleware/authMiddleware.js');
const checkRole = require('../middleware/authorization.js');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { fullName, email, phoneNumber, password } = req.body;
  if (!fullName || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: 'الرجاء إدخال جميع الحقول المطلوبة.' });
  }
  const client = await pool.connect();
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const query = `
      INSERT INTO users (full_name, email, phone_number, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, user_role, created_at;
    `;
    const values = [fullName, email, phoneNumber, passwordHash];
    const result = await client.query(query, values);
    res.status(201).json({
      message: 'تم تسجيل المستخدم بنجاح!',
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'البريد الإلكتروني أو رقم الهاتف مسجل مسبقاً.' });
    }
    console.error('Error during registration:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم.' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
  }
  const client = await pool.connect();
  try {
    const userQuery = 'SELECT * FROM users WHERE email = $1';
    const userResult = await client.query(userQuery, [email]);
    const user = userResult.rows[0];

    if (!user) {
      if(client) client.release();
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      if(client) client.release();
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const accessTokenPayload = { id: user.id, role: user.user_role };
    const accessToken = jwt.sign(
      accessTokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshTokenPayload = { id: user.id, type: 'refresh' };
    const refreshToken = jwt.sign(
      refreshTokenPayload,
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '30d' }
    );

    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 30);

    await client.query(
      'UPDATE user_refresh_tokens SET is_revoked = true WHERE user_id = $1 AND is_revoked = false',
      [user.id]
    );

    const insertRefreshTokenQuery = `
      INSERT INTO user_refresh_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3);
    `;
    await client.query(insertRefreshTokenQuery, [user.id, refreshToken, refreshTokenExpiresAt]);

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح!',
      accessToken: accessToken,
      refreshToken: refreshToken
    });

  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم.' });
  } finally {
    if (client) client.release();
  }
});

router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'توكن التحديث (refreshToken) مطلوب.' });
  }

  const client = await pool.connect();
  try {
    let decodedPayload;
    try {
      decodedPayload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      if(client) client.release();
      return res.status(403).json({ message: 'توكن التحديث غير صالح أو منتهي الصلاحية (فشل التحقق).' });
    }

    const userId = decodedPayload.id;

    const tokenQuery = 'SELECT user_id, is_revoked, expires_at FROM user_refresh_tokens WHERE token = $1 AND user_id = $2';
    const tokenResult = await client.query(tokenQuery, [refreshToken, userId]);

    if (tokenResult.rows.length === 0) {
      if(client) client.release();
      return res.status(403).json({ message: 'توكن التحديث غير موجود في قاعدة البيانات أو لا يخص هذا المستخدم.' });
    }

    const storedToken = tokenResult.rows[0];
    if (storedToken.is_revoked) {
      if(client) client.release();
      return res.status(403).json({ message: 'توكن التحديث تم إبطاله. يرجى تسجيل الدخول مرة أخرى.' });
    }
    if (new Date(storedToken.expires_at) < new Date()) {
      if(client) client.release();
      return res.status(403).json({ message: 'توكن التحديث منتهي الصلاحية. يرجى تسجيل الدخول مرة أخرى.' });
    }

    await client.query('UPDATE user_refresh_tokens SET is_revoked = true WHERE token = $1', [refreshToken]);

    const userQuery = 'SELECT id, user_role FROM users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);
    if (userResult.rows.length === 0) {
        if(client) client.release();
        return res.status(404).json({ message: 'المستخدم المرتبط بهذا التوكن غير موجود.'})
    }
    const user = userResult.rows[0];

    const newAccessTokenPayload = { id: user.id, role: user.user_role };
    const newAccessToken = jwt.sign(
      newAccessTokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const newRefreshTokenPayload = { id: user.id, type: 'refresh' };
    const newRefreshToken = jwt.sign(
      newRefreshTokenPayload,
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '30d' }
    );
    const newRefreshTokenExpiresAt = new Date();
    newRefreshTokenExpiresAt.setDate(newRefreshTokenExpiresAt.getDate() + 30);
    await client.query(
      'INSERT INTO user_refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3);',
      [userId, newRefreshToken, newRefreshTokenExpiresAt]
    );

    res.status(200).json({
      message: 'تم تحديث التوكن بنجاح.',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error('Error during token refresh:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث التوكن.' });
  } finally {
    if (client) client.release();
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, full_name, email, phone_number, user_role, created_at 
      FROM users 
      WHERE id = $1;
    `;
    const result = await client.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'المستخدم غير موجود.' });
    }
    const userProfile = result.rows[0];
    res.status(200).json({
      message: 'تم استرجاع بيانات الملف الشخصي بنجاح.',
      user: userProfile 
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب الملف الشخصي.' });
  } finally {
    client.release();
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { fullName, phoneNumber } = req.body;
  const client = await pool.connect();

  try {
    const currentProfileQuery = 'SELECT full_name, phone_number FROM users WHERE id = $1';
    const currentProfileResult = await client.query(currentProfileQuery, [userId]);

    if (currentProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'المستخدم غير موجود.' }); 
    }

    const currentFullName = currentProfileResult.rows[0].full_name;
    const currentPhoneNumber = currentProfileResult.rows[0].phone_number;

    const newFullName = fullName !== undefined ? fullName.trim() : currentFullName;
    const newPhoneNumber = phoneNumber !== undefined ? phoneNumber.trim() : currentPhoneNumber;

    if (fullName !== undefined && newFullName === '') {
      return res.status(400).json({ message: 'الاسم الكامل لا يمكن أن يكون فارغاً إذا تم توفيره.' });
    }

    if (newFullName === currentFullName && newPhoneNumber === currentPhoneNumber) {
        const userProfileQuery = `SELECT id, full_name, email, phone_number, user_role, created_at FROM users WHERE id = $1;`;
        const userProfileResult = await client.query(userProfileQuery, [userId]);
        return res.status(200).json({ 
            message: 'لا توجد بيانات لتحديثها. تم إرجاع الملف الشخصي الحالي.', 
            user: userProfileResult.rows[0] 
        });
    }

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (fullName !== undefined) {
        updateFields.push(`full_name = $${paramIndex++}`);
        values.push(newFullName);
    }
    if (phoneNumber !== undefined) {
        updateFields.push(`phone_number = $${paramIndex++}`);
        values.push(newPhoneNumber);
    }

    if (updateFields.length === 0) {
        const userProfileQuery = `SELECT id, full_name, email, phone_number, user_role, created_at FROM users WHERE id = $1;`;
        const userProfileResult = await client.query(userProfileQuery, [userId]);
        return res.status(200).json({ 
            message: 'لم يتم توفير أي بيانات قابلة للتحديث.', 
            user: userProfileResult.rows[0]
        });
    }

    values.push(userId); 

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} 
      RETURNING id, full_name, email, phone_number, user_role, created_at; 
    `;

    const result = await client.query(updateQuery, values);

    res.status(200).json({
      message: 'تم تحديث الملف الشخصي بنجاح.',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('Error updating user profile:', err.stack);
    if (err.code === '23505' && err.constraint && err.constraint.includes('phone_number')) {
        return res.status(409).json({ message: 'رقم الهاتف هذا مستخدم بالفعل.' });
    }
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث الملف الشخصي.' });
  } finally {
    client.release();
  }
});

router.put('/profile/change-password', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'كلمة المرور الحالية والجديدة حقول مطلوبة.' });
  }

  if (newPassword.length < 6) { 
    return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.' });
  }

  const client = await pool.connect();
  try {
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'المستخدم غير موجود.' }); 
    }
    const storedPasswordHash = userResult.rows[0].password_hash;

    const isMatch = await bcrypt.compare(currentPassword, storedPasswordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    const updatePasswordQuery = 'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    await client.query(updatePasswordQuery, [newPasswordHash, userId]);

    res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح.' });

  } catch (err) {
    console.error('Error changing password:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تغيير كلمة المرور.' });
  } finally {
    client.release();
  }
});

const MAX_SAVED_ADDRESSES = 3;

router.post('/profile/addresses', authMiddleware, checkRole('customer'), async (req, res) => {
  const userId = req.user.id;
  const { address_label, full_address } = req.body;

  if (!full_address || typeof full_address !== 'string' || full_address.trim() === '') {
    return res.status(400).json({ message: 'حقل العنوان الكامل (full_address) مطلوب.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const countQuery = 'SELECT COUNT(*) AS address_count FROM customer_addresses WHERE user_id = $1';
    const countResult = await client.query(countQuery, [userId]);
    const addressCount = parseInt(countResult.rows[0].address_count);

    if (addressCount >= MAX_SAVED_ADDRESSES) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `لا يمكن حفظ أكثر من ${MAX_SAVED_ADDRESSES} عناوين. يرجى حذف عنوان موجود أولاً.` });
    }

    const insertQuery = `
      INSERT INTO customer_addresses (user_id, address_label, full_address, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [userId, address_label, full_address.trim()]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'تم حفظ العنوان بنجاح.', address: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding saved address:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حفظ العنوان.' });
  } finally {
    client.release();
  }
});

router.get('/profile/addresses', authMiddleware, checkRole('customer'), async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, address_label, full_address, created_at, updated_at
      FROM customer_addresses
      WHERE user_id = $1
      ORDER BY created_at ASC; 
    `;
    const result = await client.query(query, [userId]);
    res.status(200).json({ message: 'تم استرجاع العناوين المحفوظة بنجاح.', addresses: result.rows });
  } catch (err) {
    console.error('Error fetching saved addresses:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب العناوين المحفوظة.' });
  } finally {
    client.release();
  }
});

router.put('/profile/addresses/:addressId', authMiddleware, checkRole('customer'), async (req, res) => {
  const userId = req.user.id;
  const { addressId } = req.params;
  const requestBody = req.body;

  const parsedAddressId = parseInt(addressId);
  if (isNaN(parsedAddressId)) {
    return res.status(400).json({ message: 'معرف العنوان غير صالح.' });
  }

  const client = await pool.connect();
  try {
    const ownershipCheck = await client.query('SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2', [parsedAddressId, userId]);
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ message: 'العنوان غير موجود أو لا تملك صلاحية تعديله.' });
    }

    const setClauses = [];
    const queryValues = [];
    let placeholderIndex = 1;

    if (requestBody.hasOwnProperty('address_label')) {
        setClauses.push(`address_label = $${placeholderIndex++}`);
        queryValues.push(requestBody.address_label === null ? null : String(requestBody.address_label).trim());
    }
    if (requestBody.hasOwnProperty('full_address')) {
        const faValue = String(requestBody.full_address).trim();
        if (faValue === '') {
            return res.status(400).json({ message: 'العنوان الكامل (full_address) لا يمكن أن يكون فارغاً إذا تم توفيره للتحديث.' });
        }
        setClauses.push(`full_address = $${placeholderIndex++}`);
        queryValues.push(faValue);
    }

    if (setClauses.length === 0) {
        const currentAddress = await client.query('SELECT * FROM customer_addresses WHERE id = $1 AND user_id = $2', [parsedAddressId, userId]);
        return res.status(200).json({ message: 'لم يتم توفير بيانات قابلة للتحديث.', address: currentAddress.rows[0]});
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    queryValues.push(parsedAddressId);
    queryValues.push(userId);

    const updateQuery = `
      UPDATE customer_addresses
      SET ${setClauses.join(', ')}
      WHERE id = $${placeholderIndex++} AND user_id = $${placeholderIndex++} 
      RETURNING *;
    `;

    const result = await client.query(updateQuery, queryValues);

    res.status(200).json({ message: 'تم تحديث العنوان المحفوظ بنجاح.', address: result.rows[0] });
  } catch (err) {
    console.error('Error updating saved address:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء تحديث العنوان المحفوظ.' });
  } finally {
    client.release();
  }
});

router.delete('/profile/addresses/:addressId', authMiddleware, checkRole('customer'), async (req, res) => {
  const userId = req.user.id;
  const { addressId } = req.params;
  const parsedAddressId = parseInt(addressId);

  if (isNaN(parsedAddressId)) {
    return res.status(400).json({ message: 'معرف العنوان غير صالح.' });
  }

  const client = await pool.connect();
  try {
    const deleteQuery = 'DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING id';
    const result = await client.query(deleteQuery, [parsedAddressId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'العنوان غير موجود أو لا تملك صلاحية حذفه.' });
    }
    res.status(200).json({ message: 'تم حذف العنوان المحفوظ بنجاح.' });
  } catch (err) {
    console.error('Error deleting saved address:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حذف العنوان المحفوظ.' });
  } finally {
    client.release();
  }
});

router.put(
  '/:userId/role',
  authMiddleware,
  checkRole('admin'),
  async (req, res) => {
    const { userId } = req.params;
    const { newRole } = req.body;

    const allowedRoles = ['customer', 'store_owner', 'delivery_worker', 'admin', 'branch_manager'];
    if (!newRole || !allowedRoles.includes(newRole)) {
      return res.status(400).json({ message: 'الدور المحدد غير صالح.' });
    }

    const client = await pool.connect();
    try {
      const query = 'UPDATE users SET user_role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, full_name, email, user_role';
      const result = await client.query(query, [newRole, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'المستخدم غير موجود.' });
      }

      res.status(200).json({
        message: `تم تحديث دور المستخدم بنجاح.`,
        user: result.rows[0]
      });

    } catch (err) {
      console.error('Error updating user role:', err.stack);
      res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    } finally {
      client.release();
    }
  }
);

// ROUTE TO SAVE FCM TOKEN
router.post('/fcm-token', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { token } = req.body;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(400).json({ message: 'حقل التوكن (token) مطلوب.' });
  }

  const client = await pool.connect();
  try {
    const upsertQuery = `
      INSERT INTO user_fcm_tokens (user_id, token)
      VALUES ($1, $2)
      ON CONFLICT (user_id, token)
      DO UPDATE SET updated_at = NOW();
    `;

    await client.query(upsertQuery, [userId, token.trim()]);

    res.status(200).json({ message: 'تم حفظ أو تحديث توكن الإشعارات بنجاح.' });

  } catch (err) {
    console.error('Error saving FCM token:', err.stack);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حفظ توكن الإشعارات.' });
  } finally {
    client.release();
  }
});


module.exports = router;
