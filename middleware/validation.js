// middleware/validation.js
const { body, query, validationResult } = require('express-validator');

// Generic validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Product validation rules
const productValidation = {
  create: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('brand').optional().trim(),
    body('thumbnail').optional().isURL().withMessage('Thumbnail must be a valid URL'),
    body('images').optional().isArray().withMessage('Images must be an array'),
    body('images.*').optional().isURL().withMessage('Each image must be a valid URL'),
    body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('warrantyInformation').optional().trim(),
    body('shippingInformation').optional().trim(),
    body('returnPolicy').optional().trim(),
    body('minimumOrderQuantity').optional().isInt({ min: 1 }).withMessage('Minimum order quantity must be at least 1')
  ],
  
  update: [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('brand').optional().trim(),
    body('thumbnail').optional().isURL().withMessage('Thumbnail must be a valid URL'),
    body('images').optional().isArray().withMessage('Images must be an array'),
    body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
    body('tags').optional().isArray().withMessage('Tags must be an array')
  ],

  query: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().trim(),
    query('category').optional().trim(),
    query('sortBy').optional().isIn(['title', 'price', 'stock', 'createdAt']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ]
};

// Bill validation rules
const billValidation = {
  create: [
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('address').optional().trim(),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('discountPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount must be between 0 and 100'),
    body('paymentMethod').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER']),
    body('paymentStatus').optional().isIn(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE'])
  ],

  update: [
    body('paymentStatus').optional().isIn(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE']),
    body('paymentMethod').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'])
  ],

  query: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().trim(),
    query('status').optional().isIn(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE']),
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],

  dashboardStats: [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ]
};

// Customer validation rules
const customerValidation = {
  create: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('address').optional().trim()
  ],

  update: [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('mobileNumber').optional().trim().notEmpty().withMessage('Mobile number cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('address').optional().trim()
  ],

  query: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().trim()
  ]
};

module.exports = {
  handleValidationErrors,
  productValidation,
  billValidation,
  customerValidation
};