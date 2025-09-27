// controllers/ProductController.js
const ProductModel = require('../models/Product');

class ProductController {
  constructor() {
    this.productModel = new ProductModel();
  }

  async getProducts(req, res) {
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
      const where = this.productModel.buildSearchFilter(search, category);

      const [products, totalCount] = await Promise.all([
        this.productModel.findMany({
          where,
          skip,
          take,
          orderBy: { [sortBy]: sortOrder }
        }),
        this.productModel.count(where)
      ]);

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
  }

  async getProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await this.productModel.findById(id);

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
  }

  async createProduct(req, res) {
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
        minimumOrderQuantity: req.body.minimumOrderQuantity
          ? parseInt(req.body.minimumOrderQuantity)
          : 1,
        availabilityStatus: parseInt(req.body.stock) > 0 ? 'In Stock' : 'Out of Stock'
      };

      const product = await this.productModel.create(productData);

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
  }

  async updateProduct(req, res) {
    try {
      const { id } = req.params;

      const existingProduct = await this.productModel.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          error: 'Product not found',
          message: 'The requested product does not exist'
        });
      }

      const updateData = {};
      Object.keys(req.body).forEach(key => {
        if (req.body[key] !== undefined) {
          if (key === 'price') updateData[key] = parseFloat(req.body[key]);
          else if (key === 'stock' || key === 'minimumOrderQuantity')
            updateData[key] = parseInt(req.body[key]);
          else if (key === 'rating') updateData[key] = parseFloat(req.body[key]);
          else updateData[key] = req.body[key];
        }
      });

      if ('stock' in updateData) {
        updateData.availabilityStatus =
          updateData.stock > 0 ? 'In Stock' : 'Out of Stock';
      }

      const product = await this.productModel.update(id, updateData);

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
  }

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;

      const existingProduct = await this.productModel.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          error: 'Product not found',
          message: 'The requested product does not exist'
        });
      }

      await this.productModel.delete(id);

      res.json({
        message: 'Product deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting product:', error);

      if (error.code === 'P2003') {
        return res.status(400).json({
          error: 'Cannot delete product',
          message:
            'This product is referenced in existing bills and cannot be deleted'
        });
      }

      res.status(500).json({
        error: 'Failed to delete product',
        message: error.message
      });
    }
  }

  async getCategories(req, res) {
    try {
      const categories = await this.productModel.getCategories();
      res.json({ categories });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        error: 'Failed to fetch categories',
        message: error.message
      });
    }
  }
}

// 👉 export an instance, not the class
module.exports = new ProductController();
