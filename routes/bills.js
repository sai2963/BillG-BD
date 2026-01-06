const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

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

// Generate unique bill number
const generateBillNumber = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const datePrefix = `BILL${year}${month}${day}`;
  
  // Find the last bill of today
  const lastBill = await prisma.bill.findFirst({
    where: {
      billNumber: {
        startsWith: datePrefix
      }
    },
    orderBy: {
      billNumber: 'desc'
    }
  });
  
  let sequence = 1;
  if (lastBill) {
    const lastSequence = parseInt(lastBill.billNumber.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `${datePrefix}${String(sequence).padStart(4, '0')}`;
};

// GET /api/bills - Get all bills with pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('status').optional().isIn(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE']),
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate()
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};
    
    if (search) {
      where.OR = [
        { billNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { mobileNumber: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (status) {
      where.paymentStatus = status;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (startDate) {
      where.createdAt = {
        gte: new Date(startDate)
      };
    } else if (endDate) {
      where.createdAt = {
        lte: new Date(endDate)
      };
    }

    // Get total count
    const totalCount = await prisma.bill.count({ where });
    
    // Get bills with customer and items
    const bills = await prisma.bill.findMany({
      where,
      skip,
      take,
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      bills,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({
      error: 'Failed to fetch bills',
      message: error.message
    });
  }
});

// GET /api/bills/:id - Get single bill
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!bill) {
      return res.status(404).json({
        error: 'Bill not found',
        message: 'The requested bill does not exist'
      });
    }

    res.json({ bill });
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({
      error: 'Failed to fetch bill',
      message: error.message
    });
  }
});

// POST /api/bills - Create new bill
router.post('/', [
  body('id').trim().notEmpty().withMessage('id is required'),
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
], handleValidationErrors, async (req, res) => {
  try {
    const {
      id,
      customerName,
      mobileNumber,
      email,
      address,
      items,
      discountPercent = 0,
      paymentMethod = 'CASH',
      paymentStatus = 'PENDING'
    } = req.body;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if customer exists, if not create new one
      let customer = await tx.customer.findFirst({
        where: {
          AND: [
            { name: customerName },
            { mobileNumber: mobileNumber }
          ]
        }
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: customerName,
            mobileNumber: mobileNumber,
            email: email || null,
            address: address || null
          }
        });
      }

      // Validate products and calculate amounts
      let totalAmount = 0;
      const billItems = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${product.title}. Available: ${product.stock}, Requested: ${item.quantity}`);
        }

        const itemTotal = product.price * item.quantity;
        totalAmount += itemTotal;

        billItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: itemTotal
        });

        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: product.stock - item.quantity,
            availabilityStatus: (product.stock - item.quantity) > 0 ? 'In Stock' : 'Out of Stock'
          }
        });
      }

      // Calculate final amounts
      const discountAmount = (totalAmount * discountPercent) / 100;
      const finalAmount = totalAmount - discountAmount;

      // Generate bill number
      const billNumber = await generateBillNumber();

      // Create bill
      const bill = await tx.bill.create({
        data: {
          id,
          billNumber,
          customerId: customer.id,
          totalAmount,
          discountPercent,
          discountAmount,
          finalAmount,
          paymentMethod,
          paymentStatus :"PAID",
          items: {
            create: billItems
          }
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true
            }
          }
        }
      });

      return bill;
    });

    res.status(201).json({
      message: 'Bill created successfully',
      bill: result
    });
  } catch (error) {
    console.error('Error creating bill:', error);
    res.status(500).json({
      error: 'Failed to create bill',
      message: error.message
    });
  }
});

// PUT /api/bills/:id - Update bill (mainly payment status)
router.put('/:id', [
  body('paymentStatus').optional().isIn(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE']),
  body('paymentMethod').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'])
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod } = req.body;
    
    const existingBill = await prisma.bill.findUnique({
      where: { id }
    });

    if (!existingBill) {
      return res.status(404).json({
        error: 'Bill not found',
        message: 'The requested bill does not exist'
      });
    }

    const updateData = {};
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (paymentMethod) updateData.paymentMethod = paymentMethod;

    const bill = await prisma.bill.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.json({
      message: 'Bill updated successfully',
      bill
    });
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({
      error: 'Failed to update bill',
      message: error.message
    });
  }
});

/// GET /api/bills/stats/dashboard - Get dashboard statistics
router.get('/stats/dashboard', [
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate()
], handleValidationErrors, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else {
      // Default to current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      dateFilter.createdAt = {
        gte: startOfMonth,
        lte: endOfMonth
      };
    }

    // Get statistics
    const [
      totalBills,
      totalRevenue,
      paidBills,
      pendingBills,
      todayBills,
      todayRevenue
    ] = await Promise.all([
      // Total bills in period
      prisma.bill.count({
        where: dateFilter
      }),
      
      // Total revenue in period
      prisma.bill.aggregate({
        where: dateFilter,
        _sum: {
          finalAmount: true
        }
      }),
      
      // Paid bills count
      prisma.bill.count({
        where: {
          ...dateFilter,
          paymentStatus: 'PAID'
        }
      }),
      
      // Pending bills count
      prisma.bill.count({
        where: {
          ...dateFilter,
          paymentStatus: 'PENDING'
        }
      }),
      
      // Today's bills
      prisma.bill.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      
      // Today's revenue
      prisma.bill.aggregate({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        },
        _sum: {
          finalAmount: true
        }
      })
    ]);

    // Get top products
    const topProducts = await prisma.billItem.groupBy({
      by: ['productId'],
      where: {
        bill: dateFilter
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 5
    });

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { title: true, price: true }
        });
        return {
          product,
          quantitySold: item._sum.quantity,
          revenue: item._sum.totalPrice
        };
      })
    );

    res.json({
      stats: {
        totalBills,
        totalRevenue: totalRevenue._sum.finalAmount || 0,
        paidBills,
        pendingBills,
        todayBills,
        todayRevenue: todayRevenue._sum.finalAmount || 0
      },
      topProducts: topProductsWithDetails
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

module.exports = router;