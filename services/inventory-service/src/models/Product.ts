import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProduct extends Document {
  productId: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity?: number; // Make optional since it's a virtual field
  category: string;
  sku: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
  
  // Instance methods
  reserveInventory(quantity: number, orderId: string): Promise<boolean>;
  releaseInventory(quantity: number, orderId: string): Promise<void>;
  updateStock(newQuantity: number): Promise<void>;
}

// Interface for static methods
export interface IProductModel extends Model<IProduct> {
  findByCategory(category: string): Promise<IProduct[]>;
  findLowStock(threshold?: number): Promise<IProduct[]>;
  findAvailable(): Promise<IProduct[]>;
}

const ProductSchema = new Schema<IProduct>({
  productId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  name: { 
    type: String, 
    required: true, 
    index: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  stockQuantity: { 
    type: Number, 
    required: true, 
    min: 0,
    default: 0
  },
  reservedQuantity: { 
    type: Number, 
    required: true, 
    min: 0,
    default: 0
  },
  // Remove availableQuantity from real schema - it's calculated as a virtual field
  category: { 
    type: String, 
    required: true, 
    index: true 
  },
  sku: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
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
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ stockQuantity: 1 });
// Remove availableQuantity index since it's now a virtual field

// Virtual for available quantity
ProductSchema.virtual('availableQuantity').get(function() {
  const stock = this.stockQuantity || 0;
  const reserved = this.reservedQuantity || 0;
  return Math.max(0, stock - reserved);
});

// Remove the pre-save middleware that was causing the conflict
// ProductSchema.pre('save', function(next) {
//   this.availableQuantity = Math.max(0, this.stockQuantity - this.reservedQuantity);
//   next();
// });

// Instance method to reserve inventory
ProductSchema.methods.reserveInventory = async function(this: IProduct, quantity: number, orderId: string): Promise<boolean> {
  if ((this.availableQuantity || 0) < quantity) {
    return false;
  }

  this.reservedQuantity += quantity;
  // Remove direct assignment to availableQuantity - it's calculated automatically
  
  // Add reservation metadata
  if (!this.metadata) {
    this.metadata = {};
  }
  if (!this.metadata.reservations) {
    this.metadata.reservations = [];
  }
  
  this.metadata.reservations.push({
    orderId,
    quantity,
    reservedAt: new Date()
  });

  await this.save();
  return true;
};

// Instance method to release inventory
ProductSchema.methods.releaseInventory = async function(this: IProduct, quantity: number, orderId: string): Promise<void> {
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  // Remove direct assignment to availableQuantity - it's calculated automatically
  
  // Update reservation metadata
  if (this.metadata && this.metadata.reservations) {
    this.metadata.reservations = this.metadata.reservations.filter(
      (res: any) => res.orderId !== orderId
    );
  }

  await this.save();
};

// Instance method to update stock
ProductSchema.methods.updateStock = async function(this: IProduct, newQuantity: number): Promise<void> {
  this.stockQuantity = Math.max(0, newQuantity);
  // Remove direct assignment to availableQuantity - it's calculated automatically
  await this.save();
};

// Static method to find products by category
ProductSchema.statics.findByCategory = function(category: string) {
  return this.find({ category, isActive: true });
};

// Static method to find low stock products
ProductSchema.statics.findLowStock = function(threshold: number = 10) {
  return this.find({ 
    availableQuantity: { $lte: threshold }, 
    isActive: true 
  });
};

// Static method to find available products
ProductSchema.statics.findAvailable = function() {
  return this.find({ 
    availableQuantity: { $gt: 0 }, 
    isActive: true 
  });
};

export const Product = mongoose.model<IProduct, IProductModel>('Product', ProductSchema);
