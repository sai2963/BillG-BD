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

// GET /api/customers - Get all customers with pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim()
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get total count
    const totalCount = await prisma.customer.count({ where });
    
    // Get customers with bill count
    const customers = await prisma.customer.findMany({
      where,
      skip,
      take,
      include: {
        _count: {
          select: { bills: true }
        },
        bills: {
          select: {
            finalAmount: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate total spent for each customer
    const customersWithStats = customers.map(customer => ({
      ...customer,
      totalSpent: customer.bills.reduce((sum, bill) => sum + bill.finalAmount, 0),
      bills: undefined // Remove bills array from response
    }));

    res.json({
      customers: customersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: error.message
    });
  }
});

// GET /api/customers/:id - Get single customer with bills
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        bills: {
          include: {
            items: {
              include: {
                product: {
                  select: {
                    title: true,
                    price: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'The requested customer does not exist'
      });
    }

    // Calculate customer stats
    const totalSpent = customer.bills.reduce((sum, bill) => sum + bill.finalAmount, 0);
    const totalBills = customer.bills.length;

    res.json({
      customer: {
        ...customer,
        stats: {
          totalSpent,
          totalBills
        }
      }
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
});

// POST /api/customers - Create new customer
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('address').optional().trim()
], handleValidationErrors, async (req, res) => {
  try {
    const { name, mobileNumber, email, address } = req.body;

    // Check if customer already exists
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        AND: [
          { name: name },
          { mobileNumber: mobileNumber }
        ]
      }
    });

    if (existingCustomer) {
      return res.status(400).json({
        error: 'Customer already exists',
        message: 'A customer with this name and mobile number already exists'
      });
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        mobileNumber,
        email: email || null,
        address: address || null
      }
    });

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      error: 'Failed to create customer',
      message: error.message
    });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobileNumber').optional().trim().notEmpty().withMessage('Mobile number cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('address').optional().trim()
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingCustomer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'The requested customer does not exist'
      });
    }

    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key] || null;
      }
    });

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData
    });

    res.json({
      message: 'Customer updated successfully',
      customer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      error: 'Failed to update customer',
      message: error.message
    });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingCustomer = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bills: true }
        }
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'The requested customer does not exist'
      });
    }

    if (existingCustomer._count.bills > 0) {
      return res.status(400).json({
        error: 'Cannot delete customer',
        message: 'This customer has existing bills and cannot be deleted'
      });
    }

    await prisma.customer.delete({
      where: { id }
    });

    res.json({
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      error: 'Failed to delete customer',
      message: error.message
    });
  }
});

module.exports = router;