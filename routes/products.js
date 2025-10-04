const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();
const { checkSubscription } = require('../middleware/subscription');

// Protect all routes
router.use(checkSubscription);
// Validation middleware
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

// GET /api/products - Get all products with pagination and search
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('sortBy').optional().isIn(['title', 'price', 'stock', 'createdAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      category,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    // Get total count for pagination
    const totalCount = await prisma.product.count({ where });
    
    // Get products
    const products = await prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: {
        [sortBy]: sortOrder
      }
    });

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

// GET /api/products/:id - Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    res.json({ product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

// POST /api/products - Create new product
router.post('/', [
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
], handleValidationErrors, async (req, res) => {
  try {
    const productData = {
      title: req.body.title,
      price: parseFloat(req.body.price),
      stock: parseInt(req.body.stock),
      description: req.body.description || null,
      category: req.body.category || null,
      brand: req.body.brand || null,
      thumbnail: req.body.thumbnail || null,
      images: req.body.images || [],
      rating: req.body.rating ? parseFloat(req.body.rating) : 0,
      tags: req.body.tags || [],
      warrantyInformation: req.body.warrantyInformation || null,
      shippingInformation: req.body.shippingInformation || null,
      returnPolicy: req.body.returnPolicy || null,
      minimumOrderQuantity: req.body.minimumOrderQuantity ? parseInt(req.body.minimumOrderQuantity) : 1,
      availabilityStatus: parseInt(req.body.stock) > 0 ? 'In Stock' : 'Out of Stock'
    };

    const product = await prisma.product.create({
      data: productData
    });

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', [
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
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    // Update only provided fields
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        if (key === 'price') updateData[key] = parseFloat(req.body[key]);
        else if (key === 'stock' || key === 'minimumOrderQuantity') updateData[key] = parseInt(req.body[key]);
        else if (key === 'rating') updateData[key] = parseFloat(req.body[key]);
        else updateData[key] = req.body[key];
      }
    });

    // Update availability status based on stock
    if ('stock' in updateData) {
      updateData.availabilityStatus = updateData.stock > 0 ? 'In Stock' : 'Out of Stock';
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData
    });

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

// DELETE /api/products/:id - Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    await prisma.product.delete({
      where: { id }
    });

    res.json({
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Cannot delete product',
        message: 'This product is referenced in existing bills and cannot be deleted'
      });
    }
    
    res.status(500).json({
      error: 'Failed to delete product',
      message: error.message
    });
  }
});

// GET /api/products/categories/list - Get all categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await prisma.product.findMany({
      where: {
        category: {
          not: null
        }
      },
      select: {
        category: true
      },
      distinct: ['category']
    });

    const categoryList = categories.map(item => item.category).filter(Boolean);
    
    res.json({ categories: categoryList });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

module.exports = router;