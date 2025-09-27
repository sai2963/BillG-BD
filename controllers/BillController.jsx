// controllers/BillController.js
const BillModel = require('../models/Bill');
const CustomerModel = require('../models/Customer');
const ProductModel = require('../models/Product');

class BillController {
  constructor() {
    this.billModel = new BillModel();
    this.customerModel = new CustomerModel();
    this.productModel = new ProductModel();
  }

  async getBills(req, res) {
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
      const where = this.billModel.buildSearchFilter(search, status, startDate, endDate);

      const [bills, totalCount] = await Promise.all([
        this.billModel.findMany({ where, skip, take }),
        this.billModel.count(where)
      ]);

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
  }

  async getBill(req, res) {
    try {
      const { id } = req.params;
      const bill = await this.billModel.findById(id);

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
  }

  async createBill(req, res) {
    try {
      const {
        customerName,
        mobileNumber,
        email,
        address,
        items,
        discountPercent = 0,
        paymentMethod = 'CASH',
        paymentStatus = 'PENDING'
      } = req.body;

      const result = await this.billModel.executeTransaction(async (tx) => {
        // Find or create customer
        let customer = await this.customerModel.findByNameAndMobile(customerName, mobileNumber);

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
        const billNumber = await this.billModel.generateBillNumber();

        // Create bill
        return await tx.bill.create({
          data: {
            billNumber,
            customerId: customer.id,
            totalAmount,
            discountPercent,
            discountAmount,
            finalAmount,
            paymentMethod,
            paymentStatus,
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
  }

  async updateBill(req, res) {
    try {
      const { id } = req.params;
      const { paymentStatus, paymentMethod } = req.body;
      
      const existingBill = await this.billModel.findById(id);
      if (!existingBill) {
        return res.status(404).json({
          error: 'Bill not found',
          message: 'The requested bill does not exist'
        });
      }

      const updateData = {};
      if (paymentStatus) updateData.paymentStatus = paymentStatus;
      if (paymentMethod) updateData.paymentMethod = paymentMethod;

      const bill = await this.billModel.update(id, updateData);

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
  }

  async getDashboardStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = this.billModel.buildDateFilter(startDate, endDate);

      const [stats, topProducts] = await Promise.all([
        this.billModel.getDashboardStats(dateFilter),
        this.billModel.getTopProducts(dateFilter)
      ]);

      res.json({
        stats,
        topProducts
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard statistics',
        message: error.message
      });
    }
  }
}

module.exports = BillController;