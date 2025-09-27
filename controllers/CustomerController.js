const CustomerModel = require('../models/Customer');
const customerModel = new CustomerModel();

const CustomerController = {
  async getCustomers(req, res) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      const skip = (page - 1) * limit;

      const where = customerModel.buildSearchFilter(search);
      const customers = await customerModel.findMany({ where, skip, take: Number(limit) });
      const total = await customerModel.count(where);

      res.json({ customers, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  },

  async getCustomer(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerModel.findById(id);

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json(customer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch customer' });
    }
  },

  async createCustomer(req, res) {
    try {
      const newCustomer = await customerModel.create(req.body);
      res.status(201).json(newCustomer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create customer' });
    }
  },

  async updateCustomer(req, res) {
    try {
      const { id } = req.params;
      const updatedCustomer = await customerModel.update(id, req.body);
      res.json(updatedCustomer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  },

  async deleteCustomer(req, res) {
    try {
      const { id } = req.params;
      await customerModel.delete(id);
      res.json({ message: 'Customer deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  }
};

module.exports = CustomerController;
