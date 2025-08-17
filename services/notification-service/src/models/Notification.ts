import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  notificationId: string; // Required for API endpoints to work properly
  recipientId: string;
  type: 'email' | 'sms' | 'push';
  template: string;
  content: Record<string, any>;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  sentAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  notificationId: { 
    type: String, 
    required: true, // Required for API endpoints to work properly
    unique: true, 
    index: true 
  },
  recipientId: { 
    type: String, 
    required: true, 
    index: true 
  },
  type: { 
    type: String, 
    enum: ['email', 'sms', 'push'], 
    required: true,
    index: true
  },
  template: { 
    type: String, 
    required: true 
  },
  content: { 
    type: Schema.Types.Mixed, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'failed'], 
    default: 'pending',
    index: true
  },
  attempts: { 
    type: Number, 
    default: 0,
    min: 0
  },
  sentAt: { 
    type: Date 
  },
  failedAt: { 
    type: Date 
  },
  errorMessage: { 
    type: String 
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
NotificationSchema.index({ status: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, status: 1 });
NotificationSchema.index({ attempts: 1, status: 1 });

// Pre-save middleware to auto-generate notificationId if not provided
NotificationSchema.pre('save', function(next) {
  if (!this.notificationId) {
    this.notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

// Instance method to mark as sent
NotificationSchema.methods.markAsSent = function(): Promise<INotification> {
  this.status = 'sent';
  this.sentAt = new Date();
  this.attempts += 1;
  return this.save();
};

// Instance method to mark as failed
NotificationSchema.methods.markAsFailed = function(errorMessage: string): Promise<INotification> {
  this.status = 'failed';
  this.failedAt = new Date();
  this.attempts += 1;
  this.errorMessage = errorMessage;
  return this.save();
};

// Instance method to retry
NotificationSchema.methods.retry = function(): Promise<INotification> {
  this.status = 'pending';
  this.failedAt = undefined;
  this.errorMessage = undefined;
  return this.save();
};

// Static method to find pending notifications
NotificationSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: 1 });
};

// Static method to find failed notifications
NotificationSchema.statics.findFailed = function() {
  return this.find({ status: 'failed' }).sort({ failedAt: -1 });
};

// Static method to find notifications by recipient
NotificationSchema.statics.findByRecipient = function(recipientId: string) {
  return this.find({ recipientId }).sort({ createdAt: -1 });
};

// Static method to find notifications by status and type
NotificationSchema.statics.findByStatusAndType = function(status: string, type: string) {
  return this.find({ status, type }).sort({ createdAt: -1 });
};

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
