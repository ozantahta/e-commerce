import mongoose, { Document, Schema } from 'mongoose';
import { OrderStatus, OrderItem } from '@e-commerce/shared';

export interface IOrder extends Document {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

const OrderItemSchema = new Schema<OrderItem>({
  productId: { type: String, required: true, index: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  name: { type: String, required: true }
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  orderId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  customerId: { 
    type: String, 
    required: true, 
    index: true 
  },
  items: { 
    type: [OrderItemSchema], 
    required: true, 
    validate: {
      validator: function(items: OrderItem[]) {
        return items && items.length > 0;
      },
      message: 'Order must have at least one item'
    }
  },
  total: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: Object.values(OrderStatus), 
    default: OrderStatus.PENDING,
    index: true
  },
  metadata: { 
    type: Schema.Types.Mixed, 
    default: {} 
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });

// Pre-save middleware to validate total matches items
OrderSchema.pre('save', function(next) {
  const calculatedTotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  if (Math.abs(calculatedTotal - this.total) > 0.01) {
    return next(new Error('Order total does not match sum of items'));
  }
  
  next();
});

// Instance method to update status
OrderSchema.methods.updateStatus = function(newStatus: OrderStatus): Promise<IOrder> {
  this.status = newStatus;
  this.updatedAt = new Date();
  return this.save();
};

// Static method to find orders by status
OrderSchema.statics.findByStatus = function(status: OrderStatus) {
  return this.find({ status });
};

// Static method to find orders by customer
OrderSchema.statics.findByCustomer = function(customerId: string) {
  return this.find({ customerId }).sort({ createdAt: -1 });
};

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
