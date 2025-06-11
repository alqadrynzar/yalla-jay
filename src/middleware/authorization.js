const checkRole = (requiredRole) => {
  return (req, res, next) => {
    // هذا الوسيط يفترض أن الوسيط authMiddleware قد عمل قبله
    // وقام بإضافة كائن المستخدم إلى الطلب (req.user)
    if (!req.user) {
      return res.status(401).json({ message: 'خطأ في المصادقة، لم يتم العثور على المستخدم.' });
    }

    const userRole = req.user.role;

    if (userRole === requiredRole) {
      // إذا كان المستخدم يمتلك الدور المطلوب، اسمح للطلب بالمرور
      next();
    } else {
      // إذا كان المستخدم لا يمتلك الدور المطلوب، أرجع خطأ "ممنوع"
      res.status(403).json({ 
        message: `الوصول مرفوض. يتطلب دور '${requiredRole}'.` 
      });
    }
  };
};

module.exports = checkRole;
