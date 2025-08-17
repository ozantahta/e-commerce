import { INotification, Notification } from '../models/Notification';
import { createServiceLogger } from '@e-commerce/shared';
import { MessageQueueManager } from '@e-commerce/shared';
import { NotificationEvent } from '@e-commerce/shared';

const logger = createServiceLogger('notification-service');

export class NotificationService {
  private messageQueue: MessageQueueManager;

  constructor() {
    this.messageQueue = new MessageQueueManager({
      url: process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq:5672',
      exchange: 'e-commerce-events',
      queue: 'notification-service-queue',
      routingKey: 'notification.*'
    });
  }

  // Send a new notification
  async sendNotification(notificationData: {
    recipientId: string;
    type: 'email' | 'sms' | 'push';
    template: string;
    content: Record<string, any>;
  }): Promise<INotification> {
    try {
      const notification = new Notification({
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: notificationData.recipientId,
        type: notificationData.type,
        template: notificationData.template,
        content: notificationData.content,
        status: 'pending',
        attempts: 0,
        createdAt: new Date()
      });

      const savedNotification = await notification.save();
      logger.info(`Notification created: ${savedNotification._id}`);

      // Publish notification event
      const notificationEvent: NotificationEvent = {
        id: `notif_${Date.now()}`,
        type: 'notification.sent',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'notification-service',
        data: {
          recipientId: notificationData.recipientId,
          type: notificationData.type,
          template: notificationData.template,
          content: notificationData.content,
          status: 'pending',
          attempts: 0
        }
      };

      await this.messageQueue.publishEvent(notificationEvent);

      // Process the notification
      await this.processNotification(savedNotification);

      return savedNotification;
    } catch (error: any) {
      logger.error('Error sending notification:', error);
      throw error;
    }
  }

  // Process a notification (send email/SMS)
  async processNotification(notification: INotification): Promise<boolean> {
    try {
      logger.info(`Processing notification: ${notification._id}`);

      // Simulate sending notification
      // In production, integrate with email/SMS service
      const success = await this.sendExternalNotification(notification);

      if (success) {
        notification.status = 'sent';
        notification.sentAt = new Date();
        await notification.save();
        logger.info(`Notification sent successfully: ${notification._id}`);
        return true;
      } else {
        notification.status = 'failed';
        notification.attempts += 1;
        await notification.save();
        logger.error(`Notification failed: ${notification._id}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`Error processing notification ${notification._id}:`, error);
      notification.status = 'failed';
      notification.attempts += 1;
      await notification.save();
      return false;
    }
  }

  // Send external notification (email/SMS)
  private async sendExternalNotification(notification: INotification): Promise<boolean> {
    try {
      // Simulate external service call
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate 90% success rate
      const success = Math.random() > 0.1;
      
      if (success) {
        logger.info(`External notification sent: ${notification._id}`);
      } else {
        logger.warn(`External notification failed: ${notification._id}`);
      }
      
      return success;
    } catch (error: any) {
      logger.error(`External notification error: ${notification._id}:`, error);
      return false;
    }
  }

  // Get notification by ID
  async getNotificationById(id: string): Promise<INotification | null> {
    try {
      return await Notification.findOne({ notificationId: id });
    } catch (error: any) {
      logger.error('Error getting notification by ID:', error);
      throw error;
    }
  }

  // Get notifications by recipient
  async getNotificationsByRecipient(recipientId: string): Promise<INotification[]> {
    try {
      return await Notification.find({ recipientId });
    } catch (error: any) {
      logger.error('Error getting notifications by recipient:', error);
      throw error;
    }
  }

  // Get notifications by status
  async getNotificationsByStatus(status: string): Promise<INotification[]> {
    try {
      return await Notification.find({ status });
    } catch (error: any) {
      logger.error('Error getting notifications by status:', error);
      throw error;
    }
  }

  // Retry failed notification
  async retryNotification(id: string): Promise<INotification | null> {
    try {
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return null;
      }

      if (notification.status !== 'failed') {
        throw new Error('Only failed notifications can be retried');
      }

      if (notification.attempts >= 3) {
        throw new Error('Maximum retry attempts exceeded');
      }

      notification.status = 'pending';
      await notification.save();

      // Process the notification again
      await this.processNotification(notification);

      return notification;
    } catch (error: any) {
      logger.error('Error retrying notification:', error);
      throw error;
    }
  }

  // Get notification statistics
  async getNotificationStats(): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
  }> {
    try {
      const [total, sent, failed, pending] = await Promise.all([
        Notification.countDocuments(),
        Notification.countDocuments({ status: 'sent' }),
        Notification.countDocuments({ status: 'failed' }),
        Notification.countDocuments({ status: 'pending' })
      ]);

      return { total, sent, failed, pending };
    } catch (error: any) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }
}
