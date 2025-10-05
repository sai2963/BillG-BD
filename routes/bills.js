const express = require("express");
const { body, validationResult, query } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const {
  checkSubscription,
  trackBillUsage,
} = require("../middleware/subscription");

const router = express.Router();
const prisma = new PrismaClient();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

// Generate unique bill number
const generateBillNumber = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const datePrefix = `BILL${year}${month}${day}`;

  const lastBill = await prisma.bill.findFirst({
    where: {
      billNumber: {
        startsWith: datePrefix,
      },
    },
    orderBy: {
      billNumber: "desc",
    },
  });

  let sequence = 1;
  if (lastBill) {
    const lastSequence = parseInt(lastBill.billNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${datePrefix}${String(sequence).padStart(4, "0")}`;
};

// GET /api/bills - Get all bills with pagination (Protected)
router.get(
  "/",
  checkSubscription,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("search").optional().trim(),
    query("status").optional().isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE"]),
    query("startDate").optional().isISO8601().toDate(),
    query("endDate").optional().isISO8601().toDate(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        status,
        startDate,
        endDate,
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      // Build where clause - filter by userId
      const where = {
        userId: req.user.id,
      };

      if (search) {
        where.OR = [
          { billNumber: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
          {
            customer: {
              mobileNumber: { contains: search, mode: "insensitive" },
            },
          },
        ];
      }

      if (status) {
        where.paymentStatus = status;
      }

      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      } else if (startDate) {
        where.createdAt = {
          gte: new Date(startDate),
        };
      } else if (endDate) {
        where.createdAt = {
          lte: new Date(endDate),
        };
      }

      const totalCount = await prisma.bill.count({ where });

      const bills = await prisma.bill.findMany({
        where,
        skip,
        take,
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json({
        bills,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching bills:", error);
      res.status(500).json({
        error: "Failed to fetch bills",
        message: error.message,
      });
    }
  }
);

// GET /api/bills/:id - Get single bill (Protected)
router.get("/:id", checkSubscription, async (req, res) => {
  try {
    const { id } = req.params;

    const bill = await prisma.bill.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!bill) {
      return res.status(404).json({
        error: "Bill not found",
        message: "The requested bill does not exist",
      });
    }

    res.json({ bill });
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({
      error: "Failed to fetch bill",
      message: error.message,
    });
  }
});

// POST /api/bills - Create new bill (Protected + Track Usage)
router.post(
  "/",
  checkSubscription,
  trackBillUsage,
  [
    body("id").trim().notEmpty().withMessage("id is required"),
    body("customerName")
      .trim()
      .notEmpty()
      .withMessage("Customer name is required"),
    body("mobileNumber")
      .trim()
      .notEmpty()
      .withMessage("Mobile number is required"),
    body("email").optional().isEmail().withMessage("Invalid email format"),
    body("address").optional().trim(),
    body("items")
      .isArray({ min: 1 })
      .withMessage("At least one item is required"),
    body("items.*.productId")
      .notEmpty()
      .withMessage("Product ID is required for each item"),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be at least 1"),
    body("discountPercent")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Discount must be between 0 and 100"),
    body("paymentMethod")
      .optional()
      .isIn(["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"]),
    body("paymentStatus")
      .optional()
      .isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE"]),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        id,
        customerName,
        mobileNumber,
        email,
        address,
        items,
        discountPercent = 0,
        paymentMethod = "CASH",
        paymentStatus = "PENDING",
      } = req.body;

      const result = await prisma.$transaction(async (tx) => {
        let customer = await tx.customer.findFirst({
          where: {
            AND: [{ name: customerName }, { mobileNumber: mobileNumber }],
          },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              name: customerName,
              mobileNumber: mobileNumber,
              email: email || null,
              address: address || null,
            },
          });
        }

        let totalAmount = 0;
        const billItems = [];

        for (const item of items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found`);
          }

          if (product.stock < item.quantity) {
            throw new Error(
              `Insufficient stock for product ${product.title}. Available: ${product.stock}, Requested: ${item.quantity}`
            );
          }

          const itemTotal = product.price * item.quantity;
          totalAmount += itemTotal;

          billItems.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: product.price,
            totalPrice: itemTotal,
          });

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: product.stock - item.quantity,
              availabilityStatus:
                product.stock - item.quantity > 0 ? "In Stock" : "Out of Stock",
            },
          });
        }

        const discountAmount = (totalAmount * discountPercent) / 100;
        const finalAmount = totalAmount - discountAmount;
        const billNumber = await generateBillNumber();

        const bill = await tx.bill.create({
          data: {
            id,
            billNumber,
            customerId: customer.id,
            userId: req.user.id,
            totalAmount,
            discountPercent,
            discountAmount,
            finalAmount,
            paymentMethod,
            paymentStatus,
            items: {
              create: billItems,
            },
          },
          include: {
            customer: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        return bill;
      });

      res.status(201).json({
        message: "Bill created successfully",
        bill: result,
      });
    } catch (error) {
      console.error("Error creating bill:", error);
      res.status(500).json({
        error: "Failed to create bill",
        message: error.message,
      });
    }
  }
);

// PUT /api/bills/:id - Update bill (Protected)
router.put(
  "/:id",
  checkSubscription,
  [
    body("paymentStatus")
      .optional()
      .isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE"]),
    body("paymentMethod")
      .optional()
      .isIn(["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"]),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { paymentStatus, paymentMethod } = req.body;

      const existingBill = await prisma.bill.findFirst({
        where: {
          id,
          userId: req.user.id,
        },
      });

      if (!existingBill) {
        return res.status(404).json({
          error: "Bill not found",
          message: "The requested bill does not exist",
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
              product: true,
            },
          },
        },
      });

      res.json({
        message: "Bill updated successfully",
        bill,
      });
    } catch (error) {
      console.error("Error updating bill:", error);
      res.status(500).json({
        error: "Failed to update bill",
        message: error.message,
      });
    }
  }
);

// GET /api/bills/stats/dashboard - Get dashboard statistics (Protected)
router.get(
  "/stats/dashboard",
  checkSubscription,
  [
    query("startDate").optional().isISO8601().toDate(),
    query("endDate").optional().isISO8601().toDate(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const dateFilter = {
        userId: req.user.id,
      };

      if (startDate && endDate) {
        dateFilter.createdAt = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      } else {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
        dateFilter.createdAt = {
          gte: startOfMonth,
          lte: endOfMonth,
        };
      }

      const [
        totalBills,
        totalRevenue,
        paidBills,
        pendingBills,
        todayBills,
        todayRevenue,
      ] = await Promise.all([
        prisma.bill.count({ where: dateFilter }),
        prisma.bill.aggregate({
          where: dateFilter,
          _sum: { finalAmount: true },
        }),
        prisma.bill.count({
          where: { ...dateFilter, paymentStatus: "PAID" },
        }),
        prisma.bill.count({
          where: { ...dateFilter, paymentStatus: "PENDING" },
        }),
        prisma.bill.count({
          where: {
            userId: req.user.id,
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        }),
        prisma.bill.aggregate({
          where: {
            userId: req.user.id,
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
          _sum: { finalAmount: true },
        }),
      ]);

      res.json({
        stats: {
          totalBills,
          totalRevenue: totalRevenue._sum.finalAmount || 0,
          paidBills,
          pendingBills,
          todayBills,
          todayRevenue: todayRevenue._sum.finalAmount || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({
        error: "Failed to fetch dashboard statistics",
        message: error.message,
      });
    }
  }
);

module.exports = router;
