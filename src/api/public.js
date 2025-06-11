const express = require('express');
const pool = require('../config/database.js');
const router = express.Router();

router.get('/service-regions', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, name, description, support_phone_number
      FROM service_regions
      WHERE is_active = true
      ORDER BY name ASC;
    `;
    const result = await client.query(query);
    res.status(200).json({
      message: 'تم استرجاع مناطق الخدمة النشطة بنجاح.',
      service_regions: result.rows
    });
  } catch (err) {
    console.error('Error fetching active service regions:', err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب مناطق الخدمة.' });
  } finally {
    client.release();
  }
});

router.get('/store-types', async (req, res) => {
  const storeTypeEnumValues = [
    'grocery_supermarket', 
    'restaurant', 
    'sweets_hospitality', 
    'home_appliances_supplies', 
    'clothing_accessories', 
    'other'
  ];

  const storeTypes = storeTypeEnumValues.map(enumValue => {
    let arabicName = enumValue;
    let iconIdentifier = enumValue; 
    switch (enumValue) {
      case 'grocery_supermarket':
        arabicName = 'بقالة وسوبر ماركت';
        iconIdentifier = 'ic_storetype_grocery';
        break;
      case 'restaurant':
        arabicName = 'مطاعم';
        iconIdentifier = 'ic_storetype_restaurant';
        break;
      case 'sweets_hospitality':
        arabicName = 'حلويات وضيافة';
        iconIdentifier = 'ic_storetype_sweets';
        break;
      case 'home_appliances_supplies':
        arabicName = 'أجهزة ومستلزمات منزلية';
        iconIdentifier = 'ic_storetype_appliances';
        break;
      case 'clothing_accessories':
        arabicName = 'ملابس واكسسوارات';
        iconIdentifier = 'ic_storetype_clothing';
        break;
      case 'other':
        arabicName = 'أخرى';
        iconIdentifier = 'ic_storetype_other';
        break;
    }
    return {
      id: enumValue,
      name: arabicName,
      icon_identifier: iconIdentifier
    };
  });

  res.status(200).json({
    message: 'تم استرجاع أنواع المتاجر بنجاح.',
    store_types: storeTypes
  });
});

module.exports = router;
