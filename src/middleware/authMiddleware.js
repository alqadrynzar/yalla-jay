const jwt = require('jsonwebtoken');
const pool = require('../config/database.js');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      return res.status(401).json({ message: 'الوصول مرفوض: لا يوجد توكن.' });
    }

    const decodedUser = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodedUser;

    if (req.user.role === 'branch_manager') {
      const query = 'SELECT region_id FROM branch_manager_regions WHERE user_id = $1';
      const result = await pool.query(query, [req.user.id]);
      
      const managedRegions = result.rows.map(row => row.region_id);
      req.user.managedRegions = managedRegions;
    }

    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'الوصول مرفوض: التوكن غير صالح أو منتهي الصلاحية.' });
    }
    console.error("Error in auth middleware:", err);
    return res.status(500).json({ message: "حدث خطأ في الخادم أثناء المصادقة." });
  }
};

module.exports = authMiddleware;
