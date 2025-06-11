const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. البحث عن التوكن في هيدر الطلب
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

  // 2. إذا لم يكن هناك توكن، أرجع خطأ "غير مصرح له"
  if (token == null) {
    return res.status(401).json({ message: 'الوصول مرفوض: لا يوجد توكن.' });
  }

  // 3. التحقق من صحة التوكن
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // إذا كان التوكن غير صالح أو منتهي الصلاحية، أرجع خطأ
    if (err) {
      return res.status(401).json({ message: 'الوصول مرفوض: التوكن غير صالح.' });
    }

    // 4. إذا كان التوكن صالحاً، أضف بيانات المستخدم إلى كائن الطلب
    req.user = user;

    // 5. اسمح للطلب بالمرور إلى الخطوة التالية (المسار المحمي)
    next();
  });
};

module.exports = authMiddleware;
