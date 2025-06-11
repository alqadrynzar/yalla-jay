require('dotenv').config();
const express = require('express');
const cors = require('cors');

const usersRoutes = require('./src/api/users.js');
const storesRoutes = require('./src/api/stores.js');
const adminRoutes = require('./src/api/admin.js');
const productsRoutes = require('./src/api/products.js');
const cartRoutes = require('./src/api/cart.js');
const orderRoutes = require('./src/api/orders.js');
const storeOwnerRoutes = require('./src/api/storeOwner.js');
const deliveryRoutes = require('./src/api/delivery.js');
const notificationsRoutes = require('./src/api/notifications.js');
const publicRoutes = require('./src/api/public.js'); // <-- السطر الجديد

const app = express();
const PORT = 3000;

// تفعيل CORS
app.use(cors({
  origin: [
    'https://admin-panel-gamma-ivory.vercel.app', // إضافة رابط الواجهة الأمامية
    'https://admin-panel-dkqpiazmq-nizars-projects-a72b7b18.vercel.app' // إضافة رابط الواجهة الأمامية الثاني
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

app.use('/api/users', usersRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/store-owner', storeOwnerRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api', publicRoutes); // <-- السطر الجديد (لاحظ المسار /api)

app.listen(PORT, () => {
  console.log(`الخادم يعمل الآن على الرابط http://localhost:${PORT}`);
});

